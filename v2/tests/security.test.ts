import {describe,it,expect} from 'vitest';
import {assertAdminIdentity,assertOrigin,secretMatches,rateLimitKey} from '@/lib/security';
import {readEnv} from '@/lib/env';
describe('server authorization contract',()=>{
  const user={id:'admin'},profile={id:'admin',role:'admin',isActive:true};
  it.each([null,{id:'other'}])('denies absent or other identity',u=>expect(()=>assertAdminIdentity(u,profile,'aal2')).toThrow());
  it.each([{...profile,isActive:false},{...profile,role:'editor'},null])('denies inactive/unprivileged users',p=>expect(()=>assertAdminIdentity(user,p,'aal2')).toThrow());
  it('requires verified TOTP level, not just login',()=>{expect(()=>assertAdminIdentity(user,profile,'aal1')).toThrow();expect(()=>assertAdminIdentity(user,profile,'aal2')).not.toThrow();});
  it('rejects cross-origin and missing-origin cookie mutations',()=>{expect(()=>assertOrigin('https://evil.invalid','https://staging.nsjl.invalid')).toThrow();expect(()=>assertOrigin(null,'https://staging.nsjl.invalid')).toThrow();expect(()=>assertOrigin('https://staging.nsjl.invalid','https://staging.nsjl.invalid')).not.toThrow();});
  it('scheduler secret is server-only, required, length checked and timing-safe',()=>{const key='a'.repeat(64);expect(secretMatches(`Bearer ${key}`,key)).toBe(true);expect(secretMatches('Bearer bad',key)).toBe(false);expect(secretMatches(null,undefined)).toBe(false);expect(secretMatches('Bearer abc','abc')).toBe(false);});
  it('rate-limit keys do not log personal email addresses',()=>expect(rateLimitKey('login','admin@example.invalid')).not.toContain('@'));
  it('rejects local embedded database on staging and nsjl.nl as staging URL',()=>{expect(()=>readEnv({APP_ENV:'staging',APP_URL:'https://preview.invalid'})).toThrow();expect(()=>readEnv({APP_ENV:'staging',APP_URL:'https://nsjl.nl',DATABASE_MODE:'postgres',DATABASE_URL:'postgres://example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'})).toThrow();});
});
