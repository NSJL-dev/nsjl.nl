import {NextResponse} from 'next/server';
import {authenticatedClient} from '@/lib/auth';
import {assertOrigin,AccessError} from '@/lib/security';
import {readEnv} from '@/lib/env';
import {getDatabase} from '@/db/client';
import {enforceRateLimit} from '@/lib/rate-limit';
import {authAudit} from '@/lib/admin/audit';
export async function POST(request:Request){
  try{
    assertOrigin(request.headers.get('origin'),readEnv().APP_URL);const {client,user}=await authenticatedClient(true),form=await request.formData();
    await enforceRateLimit(await getDatabase(),'password-change',user.id,5,3600);
    const factors=await client.auth.mfa.listFactors(),assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if(factors.error||assurance.error)throw new AccessError(401,'Verificatie laden mislukt.');
    if(factors.data.all.some(f=>f.status==='verified')&&assurance.data.currentLevel!=='aal2')throw new AccessError(403,'Verifieer eerst je authenticator. Wachtwoordherstel schakelt MFA niet uit.');
    const password=String(form.get('password')||'');if(password.length<12||password.length>128)return NextResponse.json({error:'Gebruik 12 tot 128 tekens.'},{status:400,headers:{'Cache-Control':'no-store'}});
    const {error}=await client.auth.updateUser({password});if(error)return NextResponse.json({error:'Wachtwoord opslaan mislukt.'},{status:400,headers:{'Cache-Control':'no-store'}});
    await authAudit(user.id,'auth.password_changed');const response=NextResponse.redirect(new URL('/admin/mfa',request.url),303);response.headers.set('Cache-Control','private, no-store');return response;
  }catch(error){
    return NextResponse.json({error:error instanceof AccessError?error.message:'Wachtwoord opslaan mislukt.'},{status:error instanceof AccessError?error.status:500,headers:{'Cache-Control':'no-store'}});
  }
}
