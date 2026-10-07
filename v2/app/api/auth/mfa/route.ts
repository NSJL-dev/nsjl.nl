import {NextResponse} from 'next/server';
import {authenticatedClient,saveSession} from '@/lib/auth';
import {AccessError,assertOrigin} from '@/lib/security';
import {readEnv} from '@/lib/env';
import {getDatabase} from '@/db/client';
import {enforceRateLimit} from '@/lib/rate-limit';
export async function POST(request:Request){
  try{
    assertOrigin(request.headers.get('origin'),readEnv().APP_URL);const {client,user}=await authenticatedClient(true);
    await enforceRateLimit(await getDatabase(),'mfa',user.id,10,300);
    const form=await request.formData(),factorId=String(form.get('factorId')||''),code=String(form.get('code')||'');
    if(!/^[0-9]{6}$/.test(code)||!factorId)throw new AccessError(400,'Vul een geldige zescijferige code in.');
    const {data,error}=await client.auth.mfa.challengeAndVerify({factorId,code});if(error)throw new AccessError(401,'De code is ongeldig of verlopen.');
    const session=await client.auth.getSession();if(!session.data.session||!data)throw new AccessError(401,'Sessie ontbreekt.');
    await saveSession(session.data.session);return NextResponse.redirect(new URL('/admin',request.url),303);
  }catch(error){const url=new URL('/admin/mfa',request.url);url.searchParams.set('error',error instanceof AccessError?error.message:'Verificatie mislukt.');return NextResponse.redirect(url,303);}
}
