import 'server-only';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import type {Session} from '@supabase/supabase-js';
import {getDatabase} from '@/db/client';
import {auditLogs, rateLimits, users} from '@/db/schema';
import {ACCESS_COOKIE, REFRESH_COOKIE, newAuthClient, sessionCookieOptions} from './auth-client';
import {readEnv} from './env';
import {enforceRateLimit} from './rate-limit';
import {AccessError, rateLimitKey} from './security';

export const MAIL_CSRF_COOKIE = 'nsjl-mail-csrf';
export const MAIL_CONFIRM_COOKIE = 'nsjl-mail-confirm';
export const MAIL_ENDPOINT = '/api/auth/mail-session';
export const mailInput = z.object({
  action: z.enum(['preview', 'activate']),
  type: z.enum(['invite', 'recovery']), // A UI hint, never an authorization claim.
  access_token: z.string().min(1).max(4096),
  refresh_token: z.string().regex(/^[A-Za-z0-9_-]{8,4096}$/),
  csrf: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type MailInput = z.infer<typeof mailInput>;
type CookieReader = {get(name: string): {value: string} | undefined};

export function mailCookieOptions() {
  return {...sessionCookieOptions(), sameSite: 'strict' as const, path: MAIL_ENDPOINT, maxAge: 300};
}
export function newMailChallenge() { return randomBytes(32).toString('hex'); }
export function sameMailSecret(left: string | undefined, right: string) {
  if (!left || !/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
export function mailConfirmation(input: MailInput) {
  // Only the digest enters the temporary HttpOnly confirmation cookie.
  return createHash('sha256').update(JSON.stringify([input.csrf, input.type, input.access_token, input.refresh_token])).digest('hex');
}
export function assertMailTransport(request: Request, post = false) {
  const env = readEnv(), expected = new URL(env.APP_URL), actual = new URL(request.url);
  const local = env.APP_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(expected.hostname);
  if (actual.origin !== expected.origin || (!local && (actual.protocol !== 'https:' || expected.protocol !== 'https:'))) throw new AccessError(403, 'Ongeldige aanvraag.');
  const origin = request.headers.get('origin'), site = request.headers.get('sec-fetch-site');
  if ((post || origin !== null) && origin !== expected.origin) throw new AccessError(403, 'Ongeldige aanvraag.');
  if (site && site !== 'same-origin' && site !== 'none') throw new AccessError(403, 'Ongeldige aanvraag.');
}
export function assertNoMailSession(store: CookieReader) {
  // Even expired cookies require an explicit logout. Never switch accounts or silently
  // replace a verified MFA session with the AAL1 session from an email link.
  if (store.get(ACCESS_COOKIE)?.value || store.get(REFRESH_COOKIE)?.value) throw new AccessError(409, 'Log eerst uit voordat je een maillink gebruikt.');
}

const claimShape = z.object({
  sub: z.uuid(), session_id: z.uuid(), iss: z.string(),
  aud: z.union([z.literal('authenticated'), z.array(z.string()).refine(v => v.includes('authenticated'))]),
  role: z.literal('authenticated'), aal: z.enum(['aal1', 'aal2']),
  exp: z.number().int().positive(), iat: z.number().int().positive(),
});
function readMailClaims(token: string) {
  try {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const claims = claimShape.parse(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')));
    const configuredUrl = readEnv().SUPABASE_URL!;
    if (new URL(configuredUrl).protocol !== 'https:') throw new Error();
    const now = Math.floor(Date.now() / 1000), issuer = configuredUrl.replace(/\/$/, '') + '/auth/v1';
    if (claims.iss !== issuer || claims.exp <= now || claims.iat > now + 30) throw new Error();
    return claims;
  } catch { throw new AccessError(401, 'Ongeldige of verlopen maillink.'); }
}
async function verifiedAccess(token: string) {
  const claims = readMailClaims(token), client = newAuthClient();
  // Decoded claims have no authority until this exact JWT has been verified by
  // the configured Supabase Auth server (signature, user and live session).
  const {data, error} = await client.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at || !data.user.email || data.user.is_anonymous || data.user.id !== claims.sub) throw new AccessError(401, 'Ongeldige of verlopen maillink.');
  return {claims, client, user: data.user};
}
function usedSessionKey(sessionId: string) {
  return rateLimitKey('auth-mail-used', `${readEnv().SUPABASE_URL}:${sessionId}`);
}
async function unusedSession(sessionId: string) {
  const db = await getDatabase();
  const [used] = await db.select({key: rateLimits.key}).from(rateLimits).where(eq(rateLimits.key, usedSessionKey(sessionId)));
  if (used) throw new AccessError(401, 'Deze maillink is al gebruikt.');
}
async function activeAdmin(userId: string) {
  const db = await getDatabase();
  const [profile] = await db.select().from(users).where(eq(users.id, userId));
  if (!profile?.isActive || profile.role !== 'admin') throw new AccessError(403, 'Dit account heeft geen beheertoegang.');
}
export async function previewMailSession(input: MailInput) {
  const verified = await verifiedAccess(input.access_token);
  await activeAdmin(verified.user.id);
  await unusedSession(verified.claims.session_id);
  return {email: verified.user.email!};
}
export async function activateMailSession(input: MailInput): Promise<Session> {
  const incoming = await verifiedAccess(input.access_token);
  await activeAdmin(incoming.user.id);
  // Supabase deliberately permits refresh reuse. Reject previously activated
  // mail sessions before touching their refresh token, including rotated pairs.
  await unusedSession(incoming.claims.session_id);
  const {data, error} = await incoming.client.auth.refreshSession({refresh_token: input.refresh_token});
  if (error || !data.session?.refresh_token || data.session.refresh_token === input.refresh_token) throw new AccessError(401, 'Ongeldige of verlopen maillink.');
  const refreshed = await verifiedAccess(data.session.access_token);
  if (incoming.user.id !== refreshed.user.id || incoming.claims.session_id !== refreshed.claims.session_id || data.session.user.id !== refreshed.user.id) throw new AccessError(401, 'Ongeldige of verlopen maillink.');
  const db = await getDatabase();
  await db.transaction(async tx => {
    const [profile] = await tx.select().from(users).where(eq(users.id, refreshed.user.id)).for('share');
    if (!profile?.isActive || profile.role !== 'admin') throw new AccessError(403, 'Dit account heeft geen beheertoegang.');
    // Existing security table, no schema change. ON CONFLICT is an atomic
    // one-time claim across processes; the namespace is never reset by a limiter.
    const claimed = await tx.insert(rateLimits).values({key: usedSessionKey(refreshed.claims.session_id), windowStart: new Date(), count: 1}).onConflictDoNothing().returning({key: rateLimits.key});
    if (!claimed.length) throw new AccessError(401, 'Deze maillink is al gebruikt.');
    await tx.insert(auditLogs).values({actorUserId: refreshed.user.id, action: 'auth.mail_session_activated', entityType: 'auth', entityId: refreshed.user.id, summary: 'Maillinksessie server-side gecontroleerd en eenmalig geactiveerd; type is geen autorisatiebewijs.'});
  });
  return data.session;
}
export async function limitMailRequests() {
  await enforceRateLimit(await getDatabase(), 'auth-mail-request', 'nsjl', 100, 900);
}
