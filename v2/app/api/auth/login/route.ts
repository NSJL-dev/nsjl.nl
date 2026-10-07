import {NextResponse} from 'next/server';
import {z} from 'zod';
import {newAuthClient,saveSession} from '@/lib/auth';
import {readEnv} from '@/lib/env';
import {AccessError,assertOrigin} from '@/lib/security';
import {enforceRateLimit} from '@/lib/rate-limit';
import {getDatabase} from '@/db/client';
import {users} from '@/db/schema';
import {eq} from 'drizzle-orm';
export async function POST(request:Request){
  try{
    assertOrigin(request.headers.get('origin'),readEnv().APP_URL);
    const form=await request.formData();const {email,password}=z.object({email:z.email().max(254),password:z.string().min(8).max(128)}).parse(Object.fromEntries(form));
    const db=await getDatabase();await enforceRateLimit(db,'login-global','nsjl',100,900);await enforceRateLimit(db,'login-account',email.toLowerCase(),8,900);
    const client=newAuthClient();const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error||!data.session||!data.user)throw new AccessError(401,'Inloggen mislukt. Controleer je gegevens.');
    const [profile]=await db.select().from(users).where(eq(users.id,data.user.id));
    if(!profile?.isActive||profile.role!=='admin'){await client.auth.signOut();throw new AccessError(403,'Dit account heeft geen beheertoegang.');}
    await saveSession(data.session);return NextResponse.redirect(new URL('/admin/mfa',request.url),303);
  }catch(error){
    const message=error instanceof AccessError?error.message:'Controleer je e-mailadres en wachtwoord.';
    const url=new URL('/admin/login',request.url);url.searchParams.set('error',message);return NextResponse.redirect(url,303);
  }
}
