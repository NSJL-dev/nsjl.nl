import 'server-only';
import {createClient, type Session, type SupabaseClient} from '@supabase/supabase-js';
import {authConfigured, readEnv} from './env';
import {AccessError} from './security';

export const ACCESS_COOKIE = 'nsjl-access';
export const REFRESH_COOKIE = 'nsjl-refresh';
export function newAuthClient(): SupabaseClient {
  const env = readEnv();
  if (!authConfigured()) throw new AccessError(503, 'De staging-login is nog niet ingesteld.');
  // A client belongs to one request; tokens are never shared between users.
  return createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
}
export function sessionCookieOptions() {
  const env = readEnv();
  return {httpOnly: true, secure: env.APP_ENV !== 'development' || new URL(env.APP_URL).protocol === 'https:', sameSite: 'lax' as const, path: '/', maxAge: 7 * 86400};
}
type CookieWriter = {set(name: string, value: string, options: ReturnType<typeof sessionCookieOptions>): unknown};
export function writeSessionCookies(store: CookieWriter, session: Session) {
  // Keep expired access tokens available for refresh. Supabase still verifies JWT expiry server-side.
  const options = sessionCookieOptions();
  store.set(ACCESS_COOKIE, session.access_token, options);
  store.set(REFRESH_COOKIE, session.refresh_token, options);
}
export function expireSessionCookies(store: CookieWriter) {
  const options = {...sessionCookieOptions(), maxAge: 0};
  store.set(ACCESS_COOKIE, '', options); store.set(REFRESH_COOKIE, '', options);
}
