import 'server-only';
import {sql} from 'drizzle-orm';
import type {Database} from '@/db/client';
import {AccessError,rateLimitKey} from './security';
export async function enforceRateLimit(db:Database,kind:string,identity:string,limit:number,windowSeconds:number){
  const key=rateLimitKey(kind,identity);
  const result=await db.execute(sql`
    INSERT INTO rate_limits(key,window_start,count) VALUES(${key},now(),1)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN rate_limits.window_start<now()-${windowSeconds}*interval '1 second' THEN 1 ELSE rate_limits.count+1 END,
      window_start=CASE WHEN rate_limits.window_start<now()-${windowSeconds}*interval '1 second' THEN now() ELSE rate_limits.window_start END
    RETURNING count`);
  if(Number(result.rows[0]?.count)>limit)throw new AccessError(429,'Te veel pogingen. Probeer later opnieuw.');
}
