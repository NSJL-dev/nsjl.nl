import {NextResponse} from 'next/server';
import {newAuthClient,saveSession} from '@/lib/auth';
export async function GET(request:Request){
  const url=new URL(request.url),token=url.searchParams.get('token_hash'),type=url.searchParams.get('type');
  if(!token||!['invite','recovery'].includes(type||''))return NextResponse.redirect(new URL('/admin/login?error=Ongeldige+uitnodiging',request.url));
  const client=newAuthClient();const {data,error}=await client.auth.verifyOtp({token_hash:token,type:type as 'invite'|'recovery'});
  if(error||!data.session)return NextResponse.redirect(new URL('/admin/login?error=Uitnodiging+verlopen',request.url));
  await saveSession(data.session);return NextResponse.redirect(new URL('/admin/wachtwoord',request.url));
}
