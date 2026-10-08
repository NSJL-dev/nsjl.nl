import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {AccessError} from '@/lib/security';
import {getDatabase} from '@/db/client';
import {media} from '@/db/schema';
import {downloadPrivateMedia} from '@/lib/media';
import {mediaResponse,mediaErrorResponse} from '@/lib/media-response';
import {enforceRateLimit} from '@/lib/rate-limit';
export const dynamic='force-dynamic';
export const revalidate=0;
export const fetchCache='force-no-store';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {user}=await requireAdmin(true),parsed=z.uuid().safeParse((await params).id);
    if(!parsed.success)throw new AccessError(404,'Afbeelding niet gevonden.');
    const db=await getDatabase(),id=parsed.data;
    await enforceRateLimit(db,'media-preview',user.id,60,60);
    const [row]=await db.select().from(media).where(eq(media.id,id));
    if(!row)throw new AccessError(404,'Afbeelding niet gevonden.');
    return mediaResponse(await downloadPrivateMedia(row));
  }catch(error){return mediaErrorResponse(error);}
}
