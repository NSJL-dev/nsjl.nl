import {NextResponse} from 'next/server';
import {authenticatedClient,clearSession} from '@/lib/auth';
import {assertOrigin} from '@/lib/security';
import {readEnv} from '@/lib/env';
export async function POST(request:Request){
  assertOrigin(request.headers.get('origin'),readEnv().APP_URL);
  try{const {client}=await authenticatedClient(true);await client.auth.signOut({scope:'local'});}catch{/* Always clear expired local cookies. */}finally{await clearSession();}
  return NextResponse.redirect(new URL('/admin/login',request.url),303);
}
