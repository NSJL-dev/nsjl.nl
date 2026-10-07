import {NextResponse} from 'next/server';
import {authenticatedClient,saveSession} from '@/lib/auth';
import {AccessError,assertOrigin} from '@/lib/security';
import {readEnv} from '@/lib/env';
import {getDatabase} from '@/db/client';
import {enforceRateLimit} from '@/lib/rate-limit';
import {authAudit} from '@/lib/admin/audit';
export async function POST(request:Request){
  let next='';
  try{
    assertOrigin(request.headers.get('origin'),readEnv().APP_URL);const {client,user}=await authenticatedClient(true);
    await enforceRateLimit(await getDatabase(),'mfa',user.id,10,300);
    const form=await request.formData(),factorId=String(form.get('factorId')||''),code=String(form.get('code')||'');
    next=form.get('next')==='wachtwoord'?'wachtwoord':'';
    if(!/^[0-9]{6}$/.test(code)||!factorId)throw new AccessError(400,'Vul een geldige zescijferige code in.');
    const factors=await client.auth.mfa.listFactors();if(factors.error||!factors.data.all.some(f=>f.factor_type==='totp'&&f.id===factorId))throw new AccessError(400,'Deze authenticator hoort niet bij deze sessie.');
    const {data,error}=await client.auth.mfa.challengeAndVerify({factorId,code});if(error)throw new AccessError(401,'De code is ongeldig of verlopen.');
    const session=await client.auth.getSession(),assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();if(session.error||!session.data.session||!data||assurance.error||assurance.data.currentLevel!=='aal2')throw new AccessError(401,'Tweestapsverificatie is niet bevestigd.');
    await authAudit(user.id,'auth.mfa_verified');await saveSession(session.data.session);const response=NextResponse.redirect(new URL(form.get('next')==='wachtwoord'?'/admin/wachtwoord':'/admin',request.url),303);response.headers.set('Cache-Control','private, no-store');return response;
  }catch(error){const url=new URL('/admin/mfa',request.url);if(next)url.searchParams.set('next',next);url.searchParams.set('error',error instanceof AccessError?error.message:'Verificatie mislukt.');const response=NextResponse.redirect(url,303);response.headers.set('Cache-Control','private, no-store');return response;}
}
