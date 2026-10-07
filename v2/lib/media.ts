import 'server-only';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createClient} from '@supabase/supabase-js';
import {eq} from 'drizzle-orm';
import type {Database} from '@/db/client';
import {media,auditLogs} from '@/db/schema';
import {readEnv} from '@/lib/env';
import {AccessError} from '@/lib/security';
export function storageClient(){const env=readEnv();if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw new AccessError(503,'Supabase Storage is nog niet ingesteld.');return createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function prepareImage(input:Buffer){
  if(input.byteLength>8*1024*1024||!input.byteLength)throw new AccessError(400,'Afbeelding moet tussen 1 byte en 8 MB zijn.');
  const image=sharp(input,{limitInputPixels:36_000_000,animated:false}),meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format??'')||(meta.pages??1)>1)throw new AccessError(400,'Gebruik een stilstaande JPEG-, PNG- of WebP-afbeelding.');
  // Decode/re-encode removes metadata and ignores client-provided filenames/MIME types.
  return image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
}
export async function uploadMedia(db:Database,actor:string,input:Buffer,filename:string,alt:string){
  if(!alt.trim()||alt.length>500)throw new AccessError(400,'Voeg een beschrijving toe (maximaal 500 tekens).');
  const {data,info}=await prepareImage(input),client=storageClient(),env=readEnv(),path=`uploads/${randomUUID()}.webp`;
  const {error}=await client.storage.from(env.MEDIA_PRIVATE_BUCKET).upload(path,data,{contentType:'image/webp',upsert:false});if(error)throw new AccessError(502,'Privé-upload mislukt.');
  try{await db.transaction(async tx=>{const [row]=await tx.insert(media).values({filename:filename.replace(/[^\p{L}\p{N}._ -]/gu,'').slice(0,180)||'afbeelding.webp',storagePath:path,bucket:env.MEDIA_PRIVATE_BUCKET,mimeType:'image/webp',size:data.length,width:info.width,height:info.height,altText:alt.trim(),uploadedBy:actor}).returning();await tx.insert(auditLogs).values({actorUserId:actor,action:'media.upload',entityType:'media',entityId:row.id,summary:'Gecontroleerde afbeelding privé opgeslagen.'});});}catch(error){await client.storage.from(env.MEDIA_PRIVATE_BUCKET).remove([path]);throw error;}
}
export async function changeMedia(db:Database,actor:string,id:string,status:'private'|'published'|'archived',alt:string){
  const [row]=await db.select().from(media).where(eq(media.id,id));if(!row)throw new AccessError(404,'Afbeelding niet gevonden.');
  const client=storageClient(),env=readEnv();
  if(status==='published'){
    const {data,error}=await client.storage.from(env.MEDIA_PRIVATE_BUCKET).download(row.storagePath);if(error||!data)throw new AccessError(502,'Privé-afbeelding niet beschikbaar.');
    const {error:uploadError}=await client.storage.from(env.MEDIA_PUBLIC_BUCKET).upload(row.storagePath,await data.arrayBuffer(),{contentType:'image/webp',upsert:true});if(uploadError)throw new AccessError(502,'Publiceren mislukt.');
  }else{const {error}=await client.storage.from(env.MEDIA_PUBLIC_BUCKET).remove([row.storagePath]);if(error)throw new AccessError(502,'Openbare afgeleide afbeelding kon niet worden ingetrokken.');}
  await db.transaction(async tx=>{await tx.update(media).set({status,altText:alt,updatedAt:new Date()}).where(eq(media.id,id));await tx.insert(auditLogs).values({actorUserId:actor,action:`media.${status}`,entityType:'media',entityId:id,summary:'Mediastatus gewijzigd; privé-origineel behouden.'});});
}
export function publicMediaUrl(path:string){const env=readEnv();return `${env.SUPABASE_URL}/storage/v1/object/public/${env.MEDIA_PUBLIC_BUCKET}/${path}`;}
