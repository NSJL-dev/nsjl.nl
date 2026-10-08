import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {getDatabase} from '@/db/client';
import {media} from '@/db/schema';
import {readEnv} from '@/lib/env';
import {AccessError} from '@/lib/security';
import {downloadPrivateMedia} from '@/lib/media';
import {mediaResponse,mediaErrorResponse} from '@/lib/media-response';

export const dynamic='force-dynamic';
export const revalidate=0;
export const fetchCache='force-no-store';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const parsed=z.uuid().safeParse((await params).id);
    if(!parsed.success)throw new AccessError(404,'Afbeelding niet beschikbaar.');
    const db=await getDatabase(),env=readEnv();
    const published=and(eq(media.id,parsed.data),eq(media.status,'published'),eq(media.bucket,env.MEDIA_PRIVATE_BUCKET),eq(media.mimeType,'image/webp'));
    const [row]=await db.select().from(media).where(published);
    if(!row)throw new AccessError(404,'Afbeelding niet beschikbaar.');
    const bytes=await downloadPrivateMedia(row);
    // A withdrawal committed while Storage was being read must also deny this
    // response. Neither the initial lookup nor this recheck is cached.
    const [current]=await db.select({id:media.id}).from(media).where(and(published,eq(media.storagePath,row.storagePath),eq(media.size,row.size)));
    if(!current)throw new AccessError(404,'Afbeelding niet beschikbaar.');
    return mediaResponse(bytes);
  }catch(error){return mediaErrorResponse(error);}
}
