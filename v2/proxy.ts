import {NextRequest, NextResponse} from 'next/server';
import {ACCESS_COOKIE, REFRESH_COOKIE, newAuthClient, writeSessionCookies, expireSessionCookies} from '@/lib/auth-client';
import {authConfigured, readEnv} from '@/lib/env';
import {AccessError, assertOrigin} from '@/lib/security';

export async function proxy(request: NextRequest) {
  const nonce=Buffer.from(crypto.randomUUID()).toString('base64'),supabase=process.env.SUPABASE_URL?new URL(process.env.SUPABASE_URL).origin:'';
  const csp=`default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${process.env.NODE_ENV==='development'?"'unsafe-eval'":''}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: ${supabase}; connect-src 'self' ${supabase}; form-action 'self' https://formspree.io; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`;
  const path=request.nextUrl.pathname;
  const next = () => {
    const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',csp);
    const response=NextResponse.next({request:{headers}});response.headers.set('Content-Security-Policy',csp);
    if(path.startsWith('/admin')||path.startsWith('/api')||path.startsWith('/auth/'))response.headers.set('Cache-Control','private, no-store');
    if(path.startsWith('/auth/'))response.headers.set('Referrer-Policy','no-referrer');return response;
  };
  // Keep the approved public CSP unchanged; only protected paths refresh sessions.
  if(!(path.startsWith('/admin')||path.startsWith('/api/admin/')||path.startsWith('/api/auth/mfa')||path==='/api/auth/password'))return next();
  const env = readEnv();
  // Disabled sync must not cause even an authentication/refresh request.
  if (request.nextUrl.pathname === '/api/admin/sync' && !env.SYNC_ENABLED) return next();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    try { assertOrigin(request.headers.get('origin'), env.APP_URL); }
    catch { return NextResponse.json({error: 'Ongeldige aanvraagherkomst'}, {status: 403, headers: {'Cache-Control': 'no-store','Content-Security-Policy':csp}}); }
  }
  const access = request.cookies.get(ACCESS_COOKIE)?.value, refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!authConfigured() || !refresh) return next();
  try {
    if (refresh.length > 4096 || (access?.length ?? 0) > 4096) throw new AccessError(401, 'Ongeldige sessie.');
    const client = newAuthClient();
    const {data, error} = access ? await client.auth.setSession({access_token: access, refresh_token: refresh}) : await client.auth.refreshSession({refresh_token: refresh});
    if (error || !data.session) throw new AccessError(401, 'Sessie verlopen.');
    const verified = await client.auth.getUser();
    if (verified.error || !verified.data.user?.email_confirmed_at) throw new AccessError(401, 'Ongeldige sessie.');
    // Forward refreshed cookies to the current render as well as the browser response.
    request.cookies.set(ACCESS_COOKIE, data.session.access_token); request.cookies.set(REFRESH_COOKIE, data.session.refresh_token);
    const response = next();
    if (data.session.access_token !== access || data.session.refresh_token !== refresh) writeSessionCookies(response.cookies, data.session);
    return response;
  } catch {
    request.cookies.delete(ACCESS_COOKIE); request.cookies.delete(REFRESH_COOKIE);
    const response = next(); expireSessionCookies(response.cookies); return response;
  }
}
export const config = {matcher: ['/((?!_next/static|_next/image|favicon.ico|img/).*)']};
