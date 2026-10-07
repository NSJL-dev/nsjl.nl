import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {NextRequest} from 'next/server';
import type {Session} from '@supabase/supabase-js';
import {testDatabase} from './database';
import * as s from '@/db/schema';
const mocks=vi.hoisted(()=>({create:vi.fn(),cookies:vi.fn(),database:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.create}));
vi.mock('next/headers',()=>({cookies:mocks.cookies}));
vi.mock('@/db/client',()=>({getDatabase:mocks.database}));
import {authenticatedClient,requireAdmin,saveSession,clearSession} from '@/lib/auth';
import {sessionCookieOptions} from '@/lib/auth-client';
import {proxy,config} from '@/proxy';
import {POST as login} from '@/app/api/auth/login/route';
import {POST as logout} from '@/app/api/auth/logout/route';
import {POST as password} from '@/app/api/auth/password/route';
import {POST as verifyMfa} from '@/app/api/auth/mfa/route';
import {POST as enroll} from '@/app/api/auth/mfa/enroll/route';
import {POST as recovery} from '@/app/api/auth/recovery/route';
import {GET as callback} from '@/app/auth/callback/route';
let c:Awaited<ReturnType<typeof testDatabase>>,actor:string;
const session={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600} as Session;
const values=new Map<string,string>();
const store={get:(name:string)=>values.has(name)?{value:values.get(name)!}:undefined,set:vi.fn((name:string,value:string)=>{values.set(name,value);})};
function sdk(){const user={id:actor,email:'admin@example.invalid',email_confirmed_at:'2026-10-01',user_metadata:{role:'admin'}};return {user,auth:{
  getUser:vi.fn(async()=>({data:{user},error:null})),setSession:vi.fn(async()=>({data:{session},error:null})),refreshSession:vi.fn(async()=>({data:{session},error:null})),
  signInWithPassword:vi.fn(async()=>({data:{session,user},error:null})),signOut:vi.fn(async()=>({error:null})),getSession:vi.fn(async()=>({data:{session},error:null})),updateUser:vi.fn(async()=>({error:null})),
  verifyOtp:vi.fn(async()=>({data:{session,user},error:null})),resetPasswordForEmail:vi.fn(async()=>({error:null})),
  mfa:{getAuthenticatorAssuranceLevel:vi.fn(async()=>({data:{currentLevel:'aal2'},error:null})),listFactors:vi.fn(async()=>({data:{all:[{id:'own-factor',factor_type:'totp',status:'verified'}],totp:[{id:'own-factor',factor_type:'totp',status:'verified'}]},error:null})),
    unenroll:vi.fn(async()=>({error:null})),enroll:vi.fn(async()=>({data:{id:'new-factor',totp:{qr_code:'fixture-qr',secret:'fixture-enrollment-key'}},error:null})),challengeAndVerify:vi.fn(async()=>({data:{},error:null}))}
}};}
let client:ReturnType<typeof sdk>;
function request(path:string,form:Record<string,string>={},origin='http://localhost:3000'){return new Request(`http://localhost:3000${path}`,{method:'POST',headers:{origin},body:new URLSearchParams(form)});}
beforeAll(async()=>{c=await testDatabase();actor=crypto.randomUUID();await c.db.insert(s.users).values({id:actor,name:'Fixture admin',email:'admin@example.invalid'});mocks.database.mockResolvedValue(c.db);});
afterAll(async()=>{await c?.client.close();});
beforeEach(async()=>{
  for(const [key,value]of Object.entries({APP_ENV:'development',APP_URL:'http://localhost:3000',DATABASE_MODE:'local',SYNC_ENABLED:'false',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture-publishable'}))vi.stubEnv(key,value);
  vi.stubEnv('VERCEL',undefined);values.clear();values.set('nsjl-access','fixture-access');values.set('nsjl-refresh','fixture-refresh');store.set.mockClear();
  client=sdk();mocks.create.mockReset().mockReturnValue(client);mocks.cookies.mockResolvedValue(store);await c.db.update(s.users).set({role:'admin',isActive:true}).where(eq(s.users.id,actor));
});
afterEach(()=>{vi.unstubAllEnvs();});
describe('Verified server-side identity, MFA and session cookies',()=>{
  it('permits an active registered admin with confirmed email and AAL2',async()=>{expect((await requireAdmin()).profile.id).toBe(actor);expect(client.auth.getUser).toHaveBeenCalled();});
  it('denies an anonymous request',async()=>{values.clear();await expect(requireAdmin()).rejects.toMatchObject({status:401});expect(client.auth.setSession).not.toHaveBeenCalled();});
  it('denies invalid or expired access instead of trusting cookie text',async()=>{client.auth.getUser.mockResolvedValueOnce({data:{user:null!},error:null});await expect(requireAdmin()).rejects.toMatchObject({status:401});});
  it('denies an inactive registered account',async()=>{await c.db.update(s.users).set({isActive:false}).where(eq(s.users.id,actor));await expect(requireAdmin()).rejects.toMatchObject({status:403});});
  it('metadata cannot elevate an editor to admin',async()=>{await c.db.update(s.users).set({role:'editor'}).where(eq(s.users.id,actor));await expect(requireAdmin()).rejects.toMatchObject({status:403});});
  it('requires confirmed invite email',async()=>{client.user.email_confirmed_at='';await expect(requireAdmin()).rejects.toMatchObject({status:403});});
  it('gates admin access at AAL1',async()=>{client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({data:{currentLevel:'aal1'},error:null});await expect(requireAdmin()).rejects.toMatchObject({status:403});});
  it('refresh-only writable session persists rotated tokens',async()=>{values.delete('nsjl-access');await authenticatedClient(true);expect(client.auth.refreshSession).toHaveBeenCalled();expect(store.set).toHaveBeenCalledTimes(2);});
  it('readonly render refuses unpersisted token rotation',async()=>{client.auth.setSession.mockResolvedValueOnce({data:{session:{...session,refresh_token:'fixture-rotated'}},error:null});await expect(authenticatedClient()).rejects.toMatchObject({status:401});expect(store.set).not.toHaveBeenCalled();});
  it('both cookies remain HttpOnly, Secure on HTTPS, SameSite=Lax and logout expires them',async()=>{vi.stubEnv('APP_URL','https://staging.example.invalid');expect(sessionCookieOptions()).toMatchObject({httpOnly:true,secure:true,sameSite:'lax',path:'/'});await saveSession(session);expect(store.set.mock.calls).toHaveLength(2);await clearSession();expect(values.get('nsjl-access')).toBe('');expect(values.get('nsjl-refresh')).toBe('');});
});
describe('Request-scoped session refresh proxy',()=>{
  it('forwards rotated cookies to the current render and browser without caching',async()=>{client.auth.setSession.mockResolvedValueOnce({data:{session:{...session,access_token:'fixture-new-access',refresh_token:'fixture-new-refresh'}},error:null});const r=new NextRequest('http://localhost:3000/admin',{headers:{cookie:'nsjl-access=fixture-access; nsjl-refresh=fixture-refresh'}});const response=await proxy(r);expect(r.cookies.get('nsjl-access')?.value).toBe('fixture-new-access');expect(response.cookies.get('nsjl-refresh')?.value).toBe('fixture-new-refresh');expect(response.headers.get('x-middleware-request-cookie')).toContain('fixture-new-access');expect(response.headers.get('cache-control')).toBe('private, no-store');});
  it('refreshes when the access cookie is absent',async()=>{await proxy(new NextRequest('http://localhost:3000/admin',{headers:{cookie:'nsjl-refresh=fixture-refresh'}}));expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);});
  it('clears invalid session cookies without granting permissions',async()=>{client.auth.getUser.mockResolvedValueOnce({data:{user:null!},error:null});const r=new NextRequest('http://localhost:3000/admin',{headers:{cookie:'nsjl-access=bad; nsjl-refresh=bad'}});const response=await proxy(r);expect(r.cookies.get('nsjl-access')).toBeUndefined();expect(response.cookies.get('nsjl-refresh')?.value).toBe('');});
  it('denies foreign or malformed write origins before SDK use',async()=>{for(const origin of ['https://evil.example.invalid','null','invalid']){const response=await proxy(new NextRequest('http://localhost:3000/api/admin/nieuws',{method:'POST',headers:{origin,cookie:'nsjl-refresh=fixture-refresh'}}));expect(response.status).toBe(403);}expect(mocks.create).not.toHaveBeenCalled();});
  it('does not authenticate or refresh a disabled sync request',async()=>{await proxy(new NextRequest('http://localhost:3000/api/admin/sync',{method:'POST',headers:{cookie:'nsjl-refresh=fixture-refresh'}}));expect(mocks.create).not.toHaveBeenCalled();});
  it('preserves the public CSP without auth refresh or private caching',async()=>{const r=await proxy(new NextRequest('http://localhost:3000/',{headers:{cookie:'nsjl-access=fixture-access; nsjl-refresh=fixture-refresh'}}));expect(mocks.create).not.toHaveBeenCalled();expect(r.headers.get('cache-control')).toBeNull();expect(r.headers.get('content-security-policy')).toContain("'strict-dynamic'");expect(r.headers.get('x-middleware-request-x-nonce')).toBeTruthy();expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico|img/).*)']);});
  it('keeps the auth landing private with the existing CSP and never refreshes cookies there',async()=>{const r=await proxy(new NextRequest('http://localhost:3000/auth/voltooien',{headers:{cookie:'nsjl-access=fixture-access; nsjl-refresh=fixture-refresh'}}));expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('referrer-policy')).toBe('no-referrer');expect(r.headers.get('content-security-policy')).toContain("'strict-dynamic'");expect(mocks.create).not.toHaveBeenCalled();});
});
describe('Invite-only login, recovery, password and MFA HTTP flows',()=>{
  it('login redirects to MFA and writes a secret-free audit',async()=>{const r=await login(request('/api/auth/login',{email:'admin@example.invalid',password:'fixture-password-only'}));expect(r.status).toBe(303);expect(r.headers.get('location')).toContain('/admin/mfa');const logs=await c.db.select().from(s.auditLogs).where(eq(s.auditLogs.action,'auth.login'));expect(logs).toHaveLength(1);expect(JSON.stringify(logs)).not.toContain('fixture-password');});
  it('failed login does not save session cookies or expose provider error details',async()=>{client.auth.signInWithPassword.mockResolvedValueOnce({data:{session:null!,user:null!},error:null});const r=await login(request('/api/auth/login',{email:'admin@example.invalid',password:'fixture-password-only'}));expect(r.headers.get('location')).toContain('/admin/login?error=');expect(store.set).not.toHaveBeenCalled();});
  it('logout revokes the local session and clears cookies',async()=>{const r=await logout(request('/api/auth/logout'));expect(r.status).toBe(303);expect(client.auth.signOut).toHaveBeenCalledWith({scope:'local'});expect(values.get('nsjl-refresh')).toBe('');});
  it('logout also clears an expired session',async()=>{values.delete('nsjl-refresh');expect((await logout(request('/api/auth/logout'))).status).toBe(303);expect(values.get('nsjl-access')).toBe('');});
  it.each(['invite','recovery'])('token_hash callback accepts a verified %s for an active application admin',async type=>{values.clear();const r=await callback(new Request(`http://localhost:3000/auth/callback?token_hash=fixture-mail&type=${type}`));expect(r.headers.get('location')).toContain('/admin/wachtwoord');expect(r.headers.get('referrer-policy')).toBe('no-referrer');expect(client.auth.verifyOtp).toHaveBeenCalledWith({token_hash:'fixture-mail',type});});
  it('invalid callback type never verifies a signup or establishes a session',async()=>{const r=await callback(new Request('http://localhost:3000/auth/callback?token_hash=fixture&type=signup'));expect(r.headers.get('location')).toContain('/admin/login');expect(client.auth.verifyOtp).not.toHaveBeenCalled();expect(store.set).not.toHaveBeenCalled();});
  it('non-admin invite cannot create application privileges',async()=>{values.clear();await c.db.update(s.users).set({role:'editor'}).where(eq(s.users.id,actor));const r=await callback(new Request('http://localhost:3000/auth/callback?token_hash=fixture&type=invite'));expect(r.headers.get('location')).toContain('/admin/login');expect(store.set).not.toHaveBeenCalled();});
  it('token_hash callback requires explicit logout before replacing any existing session',async()=>{const r=await callback(new Request('http://localhost:3000/auth/callback?token_hash=fixture&type=invite'));expect(r.headers.get('location')).toContain('/auth/voltooien?reason=session');expect(client.auth.verifyOtp).not.toHaveBeenCalled();expect(store.set).not.toHaveBeenCalled();});
  it('standard callback redirects to the browser landing without consuming tokens or doing auth',async()=>{const r=await callback(new Request('http://localhost:3000/auth/callback'));expect(r.status).toBe(303);expect(r.headers.get('location')).toBe('http://localhost:3000/auth/voltooien');expect(r.headers.get('cache-control')).toBe('private, no-store');expect(client.auth.verifyOtp).not.toHaveBeenCalled();expect(store.set).not.toHaveBeenCalled();});
  it('recovery does not disclose account existence or call signup',async()=>{const a=await recovery(request('/api/auth/recovery',{email:'admin@example.invalid'})),b=await recovery(request('/api/auth/recovery',{email:'unknown@example.invalid'}));expect(a.headers.get('location')).toBe(b.headers.get('location'));expect(client.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);expect(client.auth.mfa.unenroll).not.toHaveBeenCalled();});
  it('password recovery cannot bypass an existing verified MFA factor',async()=>{client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({data:{currentLevel:'aal1'},error:null});expect((await password(request('/api/auth/password',{password:'fixture-password-only'}))).status).toBe(403);expect(client.auth.updateUser).not.toHaveBeenCalled();});
  it('an invited admin without a verified factor can set the initial password',async()=>{client.auth.mfa.listFactors.mockResolvedValueOnce({data:{all:[],totp:[]},error:null});client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({data:{currentLevel:'aal1'},error:null});expect((await password(request('/api/auth/password',{password:'fixture-password-only'}))).status).toBe(303);expect(client.auth.updateUser).toHaveBeenCalled();});
  it('short password is refused before provider update',async()=>{expect((await password(request('/api/auth/password',{password:'short'}))).status).toBe(400);expect(client.auth.updateUser).not.toHaveBeenCalled();});
  it('MFA verification rejects a factor from another user',async()=>{const r=await verifyMfa(request('/api/auth/mfa',{factorId:'someone-else',code:'123456'}));expect(r.headers.get('location')).toContain('error=');expect(client.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();});
  it('MFA verification accepts the own pending TOTP and persists AAL2 before redirect',async()=>{client.auth.mfa.listFactors.mockResolvedValueOnce({data:{all:[{id:'pending-factor',factor_type:'totp',status:'unverified'}],totp:[]},error:null});const r=await verifyMfa(request('/api/auth/mfa',{factorId:'pending-factor',code:'123456',next:'wachtwoord'}));expect(r.headers.get('location')).toContain('/admin/wachtwoord');expect(store.set).toHaveBeenCalledTimes(2);});
  it('challenge success without AAL2 is not sufficient',async()=>{client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({data:{currentLevel:'aal1'},error:null});expect((await verifyMfa(request('/api/auth/mfa',{factorId:'own-factor',code:'123456'}))).headers.get('location')).toContain('error=');expect(store.set).not.toHaveBeenCalled();});
  it('enrollment never removes a verified TOTP factor',async()=>{expect((await enroll(request('/api/auth/mfa/enroll'))).status).toBe(400);expect(client.auth.mfa.unenroll).not.toHaveBeenCalled();});
  it('enrollment cleans only own unfinished TOTP factors and excludes its secret from audit',async()=>{client.auth.mfa.listFactors.mockResolvedValueOnce({data:{all:[{id:'pending',factor_type:'totp',status:'unverified'}],totp:[]},error:null});const r=await enroll(request('/api/auth/mfa/enroll'));expect(r.status).toBe(200);expect(client.auth.mfa.unenroll).toHaveBeenCalledWith({factorId:'pending'});expect(r.headers.get('cache-control')).toBe('private, no-store');const logs=await c.db.select().from(s.auditLogs);expect(JSON.stringify(logs)).not.toContain('fixture-enrollment-key');});
});
