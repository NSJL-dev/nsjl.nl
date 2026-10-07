import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {ACCESS_COOKIE,REFRESH_COOKIE} from '@/lib/auth';
export async function proxy(request:NextRequest){
  const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
  const supabase=process.env.SUPABASE_URL?new URL(process.env.SUPABASE_URL).origin:'';
  const csp=`default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${process.env.NODE_ENV==='development'?"'unsafe-eval'":''}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: ${supabase}; connect-src 'self' ${supabase}; form-action 'self' https://formspree.io; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`;
  const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',csp);
  const response=NextResponse.next({request:{headers}});response.headers.set('Content-Security-Policy',csp);
  const path=request.nextUrl.pathname;
  // Token refresh is server-only. No role authorization is delegated to this proxy.
  if(path.startsWith('/admin')&&process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY){
    const access=request.cookies.get(ACCESS_COOKIE)?.value,refresh=request.cookies.get(REFRESH_COOKIE)?.value;
    if(access&&refresh){
      const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const {data,error}=await client.auth.setSession({access_token:access,refresh_token:refresh});
      if(!error&&data.session&&data.session.access_token!==access){
        request.cookies.set(ACCESS_COOKIE,data.session.access_token);request.cookies.set(REFRESH_COOKIE,data.session.refresh_token);
        headers.set('cookie',request.headers.get('cookie')??'');
        const next=NextResponse.next({request:{headers}}),options={httpOnly:true,secure:request.nextUrl.protocol==='https:',sameSite:'lax' as const,path:'/'};
        next.cookies.set(ACCESS_COOKIE,data.session.access_token,{...options,maxAge:data.session.expires_in});next.cookies.set(REFRESH_COOKIE,data.session.refresh_token,{...options,maxAge:7*86400});
        next.headers.set('Cache-Control','private, no-store');next.headers.set('Content-Security-Policy',csp);return next;
      }
    }
    response.headers.set('Cache-Control','private, no-store');
  }
  if(path.startsWith('/admin')||path.startsWith('/api'))response.headers.set('Cache-Control','private, no-store');return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|img/).*)']};
