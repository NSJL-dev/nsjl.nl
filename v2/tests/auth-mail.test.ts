import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {eq} from 'drizzle-orm';
import type {Session, User} from '@supabase/supabase-js';
import {NextRequest} from 'next/server';
import {testDatabase} from './database';
import * as s from '@/db/schema';
const mocks = vi.hoisted(() => ({create: vi.fn(), database: vi.fn(), cookies: vi.fn()}));
vi.mock('@supabase/supabase-js', () => ({createClient: mocks.create}));
vi.mock('@/db/client', () => ({getDatabase: mocks.database}));
vi.mock('next/headers', () => ({cookies: mocks.cookies}));
import {GET, POST} from '@/app/api/auth/mail-session/route';
import {MAIL_CSRF_COOKIE, MAIL_CONFIRM_COOKIE, MAIL_ENDPOINT, mailConfirmation, type MailInput} from '@/lib/auth-mail';
import {requireAdmin} from '@/lib/auth';
import {POST as password} from '@/app/api/auth/password/route';

const app = 'https://staging.example.invalid', issuer = 'https://fixture.supabase.co/auth/v1';
let c: Awaited<ReturnType<typeof testDatabase>>, actor: string, other: string;
let sessionId: string, incoming: MailInput, rotated: Session;
let client: ReturnType<typeof sdk>;
const knownTokens = new Map<string, User>();
const jar = new Map<string, string>();
const cookieStore = {get: (name: string) => jar.has(name) ? {value: jar.get(name)!} : undefined, set: vi.fn()};
function user(id = actor): User { return {id, email: id === actor ? 'admin@example.invalid' : 'other@example.invalid', email_confirmed_at: '2026-10-01', is_anonymous: false, user_metadata: {role: 'admin'}, app_metadata: {}, aud: 'authenticated', created_at: '2026-10-01'}; }
function jwt(overrides: Record<string, unknown> = {}, verified = user()) {
  const now = Math.floor(Date.now() / 1000);
  // Construct test JWTs in memory; these have a fake signature and are accepted
  // only by the explicit provider mock, never by a real Supabase project.
  const claims = {sub: verified.id, session_id: sessionId, iss: issuer, aud: 'authenticated', role: 'authenticated', aal: 'aal1', iat: now - 1, exp: now + 3600, jti: crypto.randomUUID(), ...overrides};
  const token = [Buffer.from(JSON.stringify({alg: 'ES256', typ: 'JWT'})).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url'), Buffer.from('fixture-signature').toString('base64url')].join('.');
  knownTokens.set(token, verified); return token;
}
function sdk() { return {auth: {
  getUser: vi.fn(async (token = rotated.access_token) => ({data: {user: knownTokens.get(token) ?? null}, error: knownTokens.has(token) ? null : {message: 'Fixture: rejected JWT'}})),
  refreshSession: vi.fn(async ({refresh_token}: {refresh_token: string}) => ({data: {session: refresh_token === incoming.refresh_token ? rotated : null}, error: null})),
  setSession: vi.fn(async () => ({data: {session: rotated}, error: null})),
  updateUser: vi.fn(),
  mfa: {getAuthenticatorAssuranceLevel: vi.fn(async () => ({data: {currentLevel: 'aal1'}, error: null})), listFactors: vi.fn(async () => ({data: {all: [{id: 'fixture-factor', status: 'verified', factor_type: 'totp'}]}, error: null})), unenroll: vi.fn()},
}}; }
function request(input?: Partial<MailInput>, extra: Record<string, string> = {}, origin: string | null = app) {
  const headers: Record<string, string> = {cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), 'sec-fetch-site': 'same-origin', ...extra};
  if (origin !== null) headers.origin = origin;
  if (input) headers['content-type'] ??= 'application/json';
  return new NextRequest(app + MAIL_ENDPOINT, {method: input ? 'POST' : 'GET', headers, ...(input ? {body: JSON.stringify({...incoming, ...input})} : {})});
}
async function challenge() {
  const response = await GET(request()); expect(response.status).toBe(200);
  jar.set(MAIL_CSRF_COOKIE, response.cookies.get(MAIL_CSRF_COOKIE)!.value);
  incoming.csrf = (await response.json()).csrf; return response;
}
async function preview() {
  await challenge(); const response = await POST(request({action: 'preview'}));
  if (response.status === 200) jar.set(MAIL_CONFIRM_COOKIE, response.cookies.get(MAIL_CONFIRM_COOKIE)!.value);
  return response;
}
async function usedRows() { return (await c.db.select().from(s.rateLimits)).filter(row => row.key.startsWith('auth-mail-used:')); }
async function mailAudit() { return await c.db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'auth.mail_session_activated')); }
beforeAll(async () => {
  c = await testDatabase(); actor = crypto.randomUUID(); other = crypto.randomUUID();
  await c.db.insert(s.users).values([{id: actor, email: 'admin@example.invalid', name: 'Fixture admin'}, {id: other, email: 'other@example.invalid', name: 'Other fixture admin'}]);
  mocks.database.mockResolvedValue(c.db);
});
afterAll(async () => { await c?.client.close(); });
beforeEach(async () => {
  for (const [name, value] of Object.entries({APP_ENV: 'staging', APP_URL: app, DATABASE_MODE: 'postgres', DATABASE_URL: 'postgresql://fixture', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable', SYNC_ENABLED: 'false'})) vi.stubEnv(name, value);
  vi.stubEnv('VERCEL', undefined);
  knownTokens.clear(); jar.clear(); sessionId = crypto.randomUUID();
  incoming = {action: 'preview', type: 'invite', access_token: jwt(), refresh_token: `fixture-refresh-${crypto.randomUUID()}`, csrf: '0'.repeat(64)};
  rotated = {access_token: jwt(), refresh_token: `fixture-rotated-${crypto.randomUUID()}`, token_type: 'bearer', expires_in: 3600, user: user()} as Session;
  client = sdk(); mocks.create.mockReset().mockReturnValue(client); mocks.database.mockClear(); mocks.cookies.mockResolvedValue(cookieStore); cookieStore.set.mockClear();
  await c.db.update(s.users).set({role: 'admin', isActive: true}).where(eq(s.users.id, actor));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Standard Supabase mail handoff', () => {
  it('issues only a short-lived HttpOnly/Secure/SameSite=Strict CSRF cookie without Auth or database access', async () => {
    const response = await challenge(), cookie = response.cookies.get(MAIL_CSRF_COOKIE)!;
    expect(cookie).toMatchObject({httpOnly: true, secure: true, sameSite: 'strict', path: MAIL_ENDPOINT, maxAge: 300});
    expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it.each(['invite', 'recovery'] as const)('activates %s only after a verified-email preview and explicit confirmation', async type => {
    incoming.type = type;
    const before = (await usedRows()).length, audited = (await mailAudit()).length;
    const p = await preview(); expect(p.status).toBe(200); expect(await p.json()).toEqual({email: 'admin@example.invalid'});
    expect(p.cookies.get('nsjl-access')).toBeUndefined(); expect(client.auth.refreshSession).not.toHaveBeenCalled();
    const response = await POST(request({action: 'activate'})); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({destination: '/admin/wachtwoord'});
    for (const name of ['nsjl-access', 'nsjl-refresh']) expect(response.cookies.get(name)).toMatchObject({httpOnly: true, secure: true, sameSite: 'lax', path: '/'});
    expect(response.cookies.get('nsjl-access')?.value).toBe(rotated.access_token); expect(response.cookies.get('nsjl-refresh')?.value).toBe(rotated.refresh_token);
    expect(response.cookies.get(MAIL_CSRF_COOKIE)?.maxAge).toBe(0); expect(response.cookies.get(MAIL_CONFIRM_COOKIE)?.maxAge).toBe(0);
    expect(client.auth.getUser).toHaveBeenCalledWith(incoming.access_token); expect(client.auth.getUser).toHaveBeenCalledWith(rotated.access_token);
    expect(mocks.create).toHaveBeenCalledWith('https://fixture.supabase.co', 'fixture-publishable', {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
    expect((await usedRows()).length).toBe(before + 1); expect((await mailAudit()).length).toBe(audited + 1);
    expect(client.auth.mfa.unenroll).not.toHaveBeenCalled();
  });
  it('does not activate a session without the preview-bound confirmation cookie', async () => {
    await challenge(); expect((await POST(request({action: 'activate'}))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(['access_token', 'refresh_token', 'type'] as const)('binds confirmation to the original %s', async field => {
    expect((await preview()).status).toBe(200); mocks.create.mockClear();
    const changed = field === 'type' ? 'recovery' : 'fixture-changed';
    expect((await POST(request({action: 'activate', [field]: changed}))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('retains AAL1, requires AAL2 for admin actions and keeps existing-MFA password recovery gated', async () => {
    incoming.type = 'recovery'; await preview(); const response = await POST(request({action: 'activate'})); expect(response.status).toBe(200);
    for (const name of ['nsjl-access', 'nsjl-refresh']) jar.set(name, response.cookies.get(name)!.value);
    await expect(requireAdmin()).rejects.toMatchObject({status: 403});
    const change = await password(new Request(app + '/api/auth/password', {method: 'POST', headers: {origin: app}, body: new URLSearchParams({password: 'fixture-password-only'})}));
    expect(change.status).toBe(403); expect(client.auth.updateUser).not.toHaveBeenCalled(); expect(client.auth.mfa.unenroll).not.toHaveBeenCalled();
  });
});
describe('Origin, HTTPS, CSRF and account switching', () => {
  it.each([null, 'null', 'invalid', 'https://evil.example.invalid', app + '/path', app + '/'])('denies POST Origin %s before database or provider access', async origin => {
    await challenge(); expect((await POST(request({}, {}, origin))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it.each(['cross-site', 'same-site'])('denies %s challenge requests', async site => {
    expect((await GET(request(undefined, {'sec-fetch-site': site}))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it('denies a foreign Origin on the challenge endpoint', async () => { expect((await GET(request(undefined, {}, 'https://evil.example.invalid'))).status).toBe(403); });
  it('denies non-HTTPS staging and another deployment origin', async () => {
    expect((await GET(new NextRequest('http://staging.example.invalid' + MAIL_ENDPOINT))).status).toBe(403);
    expect((await GET(new NextRequest('https://other.example.invalid' + MAIL_ENDPOINT))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(['missing', 'mismatched'])('denies %s CSRF cookies', async kind => {
    await challenge(); if (kind === 'missing') jar.delete(MAIL_CSRF_COOKIE); else jar.set(MAIL_CSRF_COOKIE, 'f'.repeat(64));
    expect((await POST(request({}))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it.each(['nsjl-access', 'nsjl-refresh'])('requires explicit logout even with only an expired %s cookie', async name => {
    await challenge(); jar.set(name, 'fixture-expired-or-other-account');
    for (const response of [await GET(request()), await POST(request({}))]) {
      expect(response.status).toBe(409); expect(response.cookies.get('nsjl-access')).toBeUndefined(); expect(response.cookies.get('nsjl-refresh')).toBeUndefined();
    }
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it('rejects oversized bodies and non-JSON submissions before provider access', async () => {
    await challenge();
    const large = new NextRequest(app + MAIL_ENDPOINT, {method: 'POST', headers: {origin: app, 'content-type': 'application/json'}, body: 'x'.repeat(10001)});
    expect((await POST(large)).status).toBe(413);
    expect((await POST(request({}, {'content-type': 'application/x-www-form-urlencoded'}))).status).toBe(415); expect(mocks.create).not.toHaveBeenCalled();
  });
});
describe('Provider verification and one-time session activation', () => {
  it('never sends credentials to a configured upstream without HTTPS', async () => {
    vi.stubEnv('SUPABASE_URL', 'http://fixture.supabase.co'); incoming.access_token = jwt({iss: 'http://fixture.supabase.co/auth/v1'});
    expect((await preview()).status).toBe(401); expect(client.auth.getUser).not.toHaveBeenCalled(); expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });
  it.each(['expired', 'future-iat', 'foreign-issuer', 'missing-session', 'wrong-subject', 'wrong-role'] as const)('rejects a %s access claim', async kind => {
    const now = Math.floor(Date.now() / 1000);
    const changes: Record<string, Record<string, unknown>> = {expired: {exp: now - 1}, 'future-iat': {iat: now + 3600}, 'foreign-issuer': {iss: 'https://another.supabase.co/auth/v1'}, 'missing-session': {session_id: undefined}, 'wrong-subject': {sub: other}, 'wrong-role': {role: 'service_role'}};
    incoming.access_token = jwt(changes[kind]); expect((await preview()).status).toBe(401); expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });
  it('does not trust a syntactically valid JWT unless the configured Auth server verifies it', async () => {
    knownTokens.delete(incoming.access_token); expect((await preview()).status).toBe(401); expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });
  it.each(['unconfirmed', 'anonymous', 'inactive', 'editor', 'unregistered'] as const)('denies an %s account despite the invite hint or role metadata', async kind => {
    if (kind === 'unconfirmed') knownTokens.get(incoming.access_token)!.email_confirmed_at = '';
    if (kind === 'anonymous') knownTokens.get(incoming.access_token)!.is_anonymous = true;
    if (kind === 'inactive') await c.db.update(s.users).set({isActive: false}).where(eq(s.users.id, actor));
    if (kind === 'editor') await c.db.update(s.users).set({role: 'editor'}).where(eq(s.users.id, actor));
    if (kind === 'unregistered') incoming.access_token = jwt({}, user(crypto.randomUUID()));
    const response = await preview(); expect([401, 403]).toContain(response.status); expect(response.cookies.get('nsjl-access')).toBeUndefined(); expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });
  it.each(['other-user', 'other-session', 'session-user-mismatch'] as const)('rejects a %s access/refresh pair before setting cookies', async kind => {
    expect((await preview()).status).toBe(200);
    if (kind === 'other-user') { rotated.user = user(other); rotated.access_token = jwt({}, rotated.user); }
    if (kind === 'other-session') rotated.access_token = jwt({session_id: crypto.randomUUID()});
    if (kind === 'session-user-mismatch') rotated.user = user(other);
    const count = (await usedRows()).length, response = await POST(request({action: 'activate'}));
    expect(response.status).toBe(401); expect(response.cookies.get('nsjl-access')).toBeUndefined(); expect((await usedRows()).length).toBe(count);
  });
  it('rejects a revoked or expired refresh token without exposing the provider error', async () => {
    await preview(); client.auth.refreshSession.mockResolvedValueOnce({data: {session: null}, error: null});
    const response = await POST(request({action: 'activate'})); expect(response.status).toBe(401); expect(response.cookies.get('nsjl-refresh')).toBeUndefined();
  });
  it('requires the refreshed access token to be verified independently', async () => {
    await preview(); knownTokens.delete(rotated.access_token); const response = await POST(request({action: 'activate'})); expect(response.status).toBe(401); expect(response.cookies.get('nsjl-refresh')).toBeUndefined();
  });
  it('refuses an unrotated refresh token', async () => {
    await preview(); rotated.refresh_token = incoming.refresh_token; expect((await POST(request({action: 'activate'}))).status).toBe(401);
  });
  it('rejects replay within the provider reuse interval and also rejects a rotated pair for that session', async () => {
    await preview(); expect((await POST(request({action: 'activate'}))).status).toBe(200);
    const calls = client.auth.refreshSession.mock.calls.length;
    expect((await POST(request({action: 'activate'}))).status).toBe(401);
    incoming.access_token = rotated.access_token; incoming.refresh_token = rotated.refresh_token;
    jar.set(MAIL_CONFIRM_COOKIE, mailConfirmation(incoming));
    expect((await POST(request({action: 'activate'}))).status).toBe(401); expect(client.auth.refreshSession).toHaveBeenCalledTimes(calls);
  });
  it('allows only one concurrent activation and one audit record for the same session', async () => {
    await preview(); const count = (await usedRows()).length, audited = (await mailAudit()).length;
    const results = await Promise.all([POST(request({action: 'activate'})), POST(request({action: 'activate'}))]);
    expect(results.map(r => r.status).sort()).toEqual([200, 401]); expect((await usedRows()).length).toBe(count + 1); expect((await mailAudit()).length).toBe(audited + 1);
  });
  it('rolls back the one-time claim and audit together when the transaction fails', async () => {
    await preview(); const count = (await usedRows()).length, audited = (await mailAudit()).length;
    const transaction = c.db.transaction.bind(c.db);
    vi.spyOn(c.db, 'transaction').mockImplementationOnce(callback => transaction(async tx => {await callback(tx); throw new Error('Fixture transaction failure');}));
    const response = await POST(request({action: 'activate'})); expect(response.status).not.toBe(200); expect(response.cookies.get('nsjl-access')).toBeUndefined();
    expect((await usedRows()).length).toBe(count); expect((await mailAudit()).length).toBe(audited);
  });
  it('never puts tokens, purpose hints or provider error details into responses or audit records', async () => {
    await preview(); const response = await POST(request({action: 'activate'}));
    const text = await response.text(), audit = JSON.stringify(await mailAudit());
    for (const token of [incoming.access_token, incoming.refresh_token, rotated.access_token, rotated.refresh_token]) {expect(text).not.toContain(token); expect(audit).not.toContain(token);}
    expect(audit).not.toContain('auth.invite_accepted'); expect(audit).not.toContain('auth.recovery_verified');
    client.auth.getUser.mockRejectedValueOnce(new Error('Fixture provider exception: ' + incoming.access_token));
    const failed = await POST(request({})); expect(await failed.text()).not.toContain(incoming.access_token); expect(failed.headers.get('cache-control')).toBe('private, no-store');
  });
  it('does not accept signup as a mail purpose', async () => {
    await challenge(); const r = await POST(new NextRequest(app + MAIL_ENDPOINT, {method: 'POST', headers: {origin: app, 'content-type': 'application/json'}, body: JSON.stringify({...incoming, type: 'signup'})}));
    expect(r.status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
  });
});
