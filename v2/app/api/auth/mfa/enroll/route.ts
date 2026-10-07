import {NextResponse} from 'next/server';
import {authenticatedClient} from '@/lib/auth';
import {assertOrigin,AccessError} from '@/lib/security';
import {readEnv} from '@/lib/env';
import {getDatabase} from '@/db/client';
import {enforceRateLimit} from '@/lib/rate-limit';
export async function POST(request:Request){
  try{
    assertOrigin(request.headers.get('origin'),readEnv().APP_URL);const {client,user}=await authenticatedClient(true);
    await enforceRateLimit(await getDatabase(),'mfa-enroll',user.id,5,3600);
    const list=await client.auth.mfa.listFactors();if(list.error)throw new AccessError(400,'Factoren laden mislukt.');
    if(list.data.totp.some(f=>f.status==='verified'))throw new AccessError(400,'Dit account heeft al een authenticator.');
    for(const factor of list.data.all.filter(f=>f.status==='unverified'))await client.auth.mfa.unenroll({factorId:factor.id});
    const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'NSJL Admin',issuer:'NSJL'});
    if(error)throw new AccessError(400,'Authenticator instellen mislukt.');
    return NextResponse.json({id:data.id,qrCode:data.totp.qr_code,secret:data.totp.secret},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return NextResponse.json({error:e instanceof AccessError?e.message:'Instellen mislukt.'},{status:e instanceof AccessError?e.status:500});}
}
