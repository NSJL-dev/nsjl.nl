import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {getDatabase} from '@/db/client';
import {sourceConfigs} from '@/db/schema';
import {readEnv} from '@/lib/env';
import {assertOrigin,AccessError} from '@/lib/security';
import {synchronize} from '@/lib/sync/service';
import {BullshooterProvider} from '@/lib/bullshooter/provider';
import {eq} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(request:Request){
  try{
    const env=readEnv();if(!env.SYNC_ENABLED)throw new AccessError(403,'Synchronisatie is uitgeschakeld voor deze omgeving.');
    assertOrigin(request.headers.get('origin'),env.APP_URL);const {user}=await requireAdmin(true),db=await getDatabase();
    const [c]=await db.select().from(sourceConfigs).where(eq(sourceConfigs.expectedLeagueCode,'REU327'));if(!c)throw new AccessError(400,'Stel eerst de broncontext in.');
    if(!c.enabled)throw new AccessError(403,'Deze broncontext is niet vrijgegeven voor synchronisatie.');
    const outcome=await synchronize(db,c.id,new BullshooterProvider(c.resultsEntryUrl,c.scheduleEntryUrl),{trigger:'manual',actorUserId:user.id,invalidate:async()=>{for(const p of ['/','/stand','/wedstrijden','/statistieken','/spelers','/admin'])revalidatePath(p,'layout');}});
    const url=new URL('/admin/synchronisatie',request.url);url.searchParams.set('message',outcome.message);return NextResponse.redirect(url,303);
  }catch(e){return NextResponse.json({error:e instanceof AccessError?e.message:'Synchronisatie niet gestart.'},{status:e instanceof AccessError?e.status:500,headers:{'Cache-Control':'no-store'}});}
}
