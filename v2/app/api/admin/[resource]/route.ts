import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {assertOrigin,AccessError} from '@/lib/security';
import {readEnv} from '@/lib/env';
import {getDatabase} from '@/db/client';
import {adminMutation} from '@/lib/admin/mutations';
import {enforceRateLimit} from '@/lib/rate-limit';
import {revalidatePath} from 'next/cache';
export async function POST(request:Request,{params}:{params:Promise<{resource:string}>}){
  const resource=(await params).resource;
  try{
    assertOrigin(request.headers.get('origin'),readEnv().APP_URL);const {user}=await requireAdmin(true),db=await getDatabase();await enforceRateLimit(db,'admin-write',user.id,60,60);
    const form=Object.fromEntries(await request.formData());await adminMutation(db,user.id,resource,form);
    for(const p of ['/','/stand','/wedstrijden','/statistieken','/nieuws','/spelers','/admin'])revalidatePath(p,'layout');
    const back=resource==='bronconfiguratie'?'/admin/synchronisatie':resource==='koppelingen'?'/admin/spelers/koppelingen':`/admin/${resource}`;return NextResponse.redirect(new URL(`${back}?message=Opgeslagen`,request.url),303);
  }catch(error){return NextResponse.json({error:error instanceof AccessError?error.message:'Opslaan mislukt. Controleer de velden en eventuele dubbele koppelingen.'},{status:error instanceof AccessError?error.status:400,headers:{'Cache-Control':'no-store'}});}
}
