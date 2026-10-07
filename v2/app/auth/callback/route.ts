import {NextResponse} from 'next/server';
import {newAuthClient,saveSession} from '@/lib/auth';
import {getDatabase} from '@/db/client';
import {users} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {enforceRateLimit} from '@/lib/rate-limit';
import {authAudit} from '@/lib/admin/audit';
export async function GET(request:Request){
  const fail=()=>{const response=NextResponse.redirect(new URL('/admin/login?error=Uitnodiging+ongeldig+of+verlopen',request.url));response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;};
  try{
  const url=new URL(request.url),token=url.searchParams.get('token_hash'),type=url.searchParams.get('type');
  if(!token||token.length>512||!['invite','recovery'].includes(type||''))return fail();
  const db=await getDatabase();await enforceRateLimit(db,'invite-callback','nsjl',100,900);
  const client=newAuthClient();const {data,error}=await client.auth.verifyOtp({token_hash:token,type:type as 'invite'|'recovery'});
  if(error||!data.session||!data.user?.email_confirmed_at)return fail();
  const [profile]=await db.select().from(users).where(eq(users.id,data.user.id));
  if(!profile?.isActive||profile.role!=='admin'){await client.auth.signOut({scope:'local'});return fail();}
  await authAudit(data.user.id,type==='invite'?'auth.invite_accepted':'auth.recovery_verified');
  await saveSession(data.session);const response=NextResponse.redirect(new URL('/admin/wachtwoord',request.url));response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
  }catch{return fail();}
}
