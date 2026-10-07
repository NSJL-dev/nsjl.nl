import {NextResponse} from 'next/server';
import {readEnv} from '@/lib/env';
import {secretMatches} from '@/lib/security';
import {getDatabase} from '@/db/client';
import {sourceConfigs} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {BullshooterProvider} from '@/lib/bullshooter/provider';
import {synchronize} from '@/lib/sync/service';
import {revalidatePath} from 'next/cache';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(request:Request){
  const env=readEnv();if(!env.SYNC_ENABLED||!secretMatches(request.headers.get('authorization'),env.SYNC_CRON_SECRET))return NextResponse.json({error:'Niet toegestaan'},{status:403});
  const db=await getDatabase(),configs=await db.select().from(sourceConfigs).where(eq(sourceConfigs.enabled,true));const outcomes=[];
  if(configs.length>1)return NextResponse.json({error:'Gebruik één broncontext per schedulerjob; bronselectie aanpassen vóór activeren.'},{status:409});
  for(const c of configs)outcomes.push(await synchronize(db,c.id,new BullshooterProvider(c.resultsEntryUrl,c.scheduleEntryUrl),{trigger:'cron',invalidate:async()=>{for(const p of ['/','/stand','/wedstrijden','/statistieken','/spelers','/admin'])revalidatePath(p,'layout');}}));
  return NextResponse.json({outcomes},{status:outcomes.some(o=>o.status==='failed')?502:200,headers:{'Cache-Control':'no-store'}});
}
