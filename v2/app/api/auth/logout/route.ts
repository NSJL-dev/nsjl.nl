import {NextResponse} from 'next/server';
import {authenticatedClient,clearSession} from '@/lib/auth';
import {assertOrigin,AccessError} from '@/lib/security';
import {readEnv} from '@/lib/env';
import {authAudit} from '@/lib/admin/audit';
export async function POST(request:Request){
  try{assertOrigin(request.headers.get('origin'),readEnv().APP_URL);}catch(error){return NextResponse.json({error:'Ongeldige aanvraagherkomst'},{status:error instanceof AccessError?error.status:403,headers:{'Cache-Control':'no-store'}});}
  try{const {client,user}=await authenticatedClient(true);await client.auth.signOut({scope:'local'});await authAudit(user.id,'auth.logout');}catch{/* Always clear expired local cookies. */}finally{await clearSession();}
  const response=NextResponse.redirect(new URL('/admin/login',request.url),303);response.headers.set('Cache-Control','private, no-store');return response;
}
