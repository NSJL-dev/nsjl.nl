import {NextResponse} from 'next/server';
import {z} from 'zod';
import {and, eq} from 'drizzle-orm';
import {newAuthClient} from '@/lib/auth';
import {getDatabase} from '@/db/client';
import {users} from '@/db/schema';
import {assertOrigin, AccessError} from '@/lib/security';
import {readEnv} from '@/lib/env';
import {enforceRateLimit} from '@/lib/rate-limit';
import {authAudit} from '@/lib/admin/audit';

export async function POST(request: Request) {
  try {
    const env=readEnv(); assertOrigin(request.headers.get('origin'), env.APP_URL);
    const form=await request.formData(), email=z.email().max(254).parse(form.get('email')).toLowerCase();
    const db=await getDatabase();
    await enforceRateLimit(db,'recovery-global','nsjl',30,3600); await enforceRateLimit(db,'recovery-account',email,3,3600);
    const [profile]=await db.select().from(users).where(and(eq(users.email,email),eq(users.isActive,true),eq(users.role,'admin')));
    if(profile){
      const {error}=await newAuthClient().auth.resetPasswordForEmail(email,{redirectTo:`${env.APP_URL}/auth/callback`}).catch(()=>({error:true}));
      if(!error)await authAudit(profile.id,'auth.recovery_requested');
    }
    // Do not disclose whether an address is registered; recovery never removes MFA.
    const url=new URL('/admin/login',request.url);url.searchParams.set('message','Als dit adres bij een actieve beheerder hoort, ontvang je een herstelmail.');
    const response=NextResponse.redirect(url,303);response.headers.set('Cache-Control','private, no-store');return response;
  }catch(error){return NextResponse.json({error:error instanceof AccessError?error.message:'Controleer je e-mailadres en probeer later opnieuw.'},{status:error instanceof AccessError?error.status:400,headers:{'Cache-Control':'private, no-store'}});}
}
