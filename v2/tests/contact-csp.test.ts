import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({auth:vi.fn()}));
vi.mock('@/lib/auth-client',()=>({ACCESS_COOKIE:'fixture-access',REFRESH_COOKIE:'fixture-refresh',newAuthClient:mocks.auth,writeSessionCookies:vi.fn(),expireSessionCookies:vi.fn()}));
import {proxy} from '@/proxy';
import {DEFAULT_FORMSPREE_ENDPOINT} from '@/lib/formspree';
function sources(policy:string,directive:string){return policy.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${directive} `))!.split(/\s+/).slice(1);}
beforeEach(()=>{vi.clearAllMocks();for(const[key,value]of Object.entries({APP_ENV:'development',APP_URL:'http://localhost:3000',DATABASE_MODE:'local',SYNC_ENABLED:'false'}))vi.stubEnv(key,value);for(const key of ['VERCEL','FORM_SPREE_ENDPOINT','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'])vi.stubEnv(key,undefined);});
afterEach(()=>vi.unstubAllEnvs());
describe('Browser CSP permits the real contact fetch without widening script/Auth policy',()=>{
  it.each(['/','/nieuws','/sponsors','/admin/login','/auth/voltooien'])('allows the exact Formspree source on %s, including App Router navigation to home',async path=>{
    const response=await proxy(new NextRequest(`http://localhost:3000${path}`)),csp=response.headers.get('content-security-policy')!;
    expect(sources(csp,'connect-src')).toEqual(["'self'",DEFAULT_FORMSPREE_ENDPOINT]);expect(sources(csp,'connect-src')).not.toContain('https:');expect(sources(csp,'connect-src')).not.toContain('*');expect(sources(csp,'connect-src')).not.toContain('https://formspree.io');
    expect(sources(csp,'form-action')).toEqual(["'self'",'https://formspree.io']);expect(sources(csp,'default-src')).toEqual(["'self'"]);expect(sources(csp,'frame-ancestors')).toEqual(["'none'"]);expect(sources(csp,'base-uri')).toEqual(["'self'"]);expect(sources(csp,'object-src')).toEqual(["'none'"]);expect(csp).toContain("'strict-dynamic'");expect(csp).toMatch(/'nonce-[^']+'/);expect(mocks.auth).not.toHaveBeenCalled();
  });
  it('uses the same configured public endpoint in CSP and retains the Supabase origin',async()=>{
    vi.stubEnv('FORM_SPREE_ENDPOINT','https://formspree.io/f/fixture123');vi.stubEnv('SUPABASE_URL','https://fixture.supabase.co');
    const response=await proxy(new NextRequest('http://localhost:3000/'));expect(sources(response.headers.get('content-security-policy')!,'connect-src')).toEqual(["'self'",'https://fixture.supabase.co','https://formspree.io/f/fixture123']);
  });
  it.each(['https://formspree.io/f/mdajbaba?token=PRIVATE_TOKEN','https://user:PRIVATE_PASSWORD@formspree.io/f/mdajbaba','https://evil.invalid/f/mdajbaba','https://formspree.io/f/a;script-src%20https://evil.invalid'])('omits unsafe provider config and secrets from CSP: %s',async config=>{
    vi.stubEnv('FORM_SPREE_ENDPOINT',config);const response=await proxy(new NextRequest('http://localhost:3000/')),csp=response.headers.get('content-security-policy')!;expect(sources(csp,'connect-src')).toEqual(["'self'"]);expect(csp).not.toContain('PRIVATE_');expect(csp).not.toContain('evil.invalid');
  });
  it('retains private caching on Auth/API responses and disabled sync never reaches the SDK',async()=>{
    const response=await proxy(new NextRequest('http://localhost:3000/api/admin/sync',{method:'POST'}));expect(response.headers.get('cache-control')).toBe('private, no-store');expect(mocks.auth).not.toHaveBeenCalled();
  });
});
