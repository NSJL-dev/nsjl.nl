import {NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {AccessError} from '@/lib/security';
import {getDatabase} from '@/db/client';
import {media} from '@/db/schema';
import {storageClient} from '@/lib/media';
import {readEnv} from '@/lib/env';
import {enforceRateLimit} from '@/lib/rate-limit';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
  try{
    const {user}=await requireAdmin(true),db=await getDatabase(),id=z.uuid().parse((await params).id),env=readEnv();
    await enforceRateLimit(db,'media-preview',user.id,60,60);
    const [row]=await db.select().from(media).where(eq(media.id,id));
    if(!row)throw new AccessError(404,'Afbeelding niet gevonden.');
    if(row.bucket!==env.MEDIA_PRIVATE_BUCKET||row.mimeType!=='image/webp')throw new AccessError(400,'Deze afbeelding heeft geen gecontroleerd privé-origineel.');
    const {data,error}=await storageClient().storage.from(env.MEDIA_PRIVATE_BUCKET).createSignedUrl(row.storagePath,60);
    if(error||!data)throw new AccessError(502,'Afbeelding bekijken is tijdelijk niet mogelijk.');
    const response=NextResponse.redirect(data.signedUrl,307);for(const [key,value]of Object.entries(headers))response.headers.set(key,value);return response;
  }catch(error){return NextResponse.json({error:error instanceof AccessError?error.message:'Afbeelding niet beschikbaar.'},{status:error instanceof AccessError?error.status:400,headers});}
}
