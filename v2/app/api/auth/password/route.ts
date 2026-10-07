import {NextResponse} from 'next/server';
import {authenticatedClient} from '@/lib/auth';
import {assertOrigin,AccessError} from '@/lib/security';
import {readEnv} from '@/lib/env';
export async function POST(request:Request){
  try{
    assertOrigin(request.headers.get('origin'),readEnv().APP_URL);const {client}=await authenticatedClient(true),form=await request.formData();
    const password=String(form.get('password')||'');if(password.length<12||password.length>128)return NextResponse.json({error:'Gebruik 12 tot 128 tekens.'},{status:400,headers:{'Cache-Control':'no-store'}});
    const {error}=await client.auth.updateUser({password});if(error)return NextResponse.json({error:'Wachtwoord opslaan mislukt.'},{status:400,headers:{'Cache-Control':'no-store'}});
    return NextResponse.redirect(new URL('/admin/mfa',request.url),303);
  }catch(error){
    return NextResponse.json({error:error instanceof AccessError?error.message:'Wachtwoord opslaan mislukt.'},{status:error instanceof AccessError?error.status:500,headers:{'Cache-Control':'no-store'}});
  }
}
