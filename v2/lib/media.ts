import 'server-only';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createClient} from '@supabase/supabase-js';
import {and,eq} from 'drizzle-orm';
import type {Database} from '@/db/client';
import {media,auditLogs} from '@/db/schema';
import {readEnv} from '@/lib/env';
import {AccessError} from '@/lib/security';
import {assertAdminActor} from '@/lib/admin/authorization';
import {assertRecordRevision,assertRecordConfirmation} from '@/lib/admin/record-guard';
export const MAX_IMAGE_BYTES=8*1024*1024;
// Leave room for multipart framing within Vercel's 4.5 MB request-body limit.
export const MAX_SERVER_UPLOAD_BYTES=4*1024*1024;
export function storageClient(){const env=readEnv();if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw new AccessError(503,'Supabase Storage is nog niet ingesteld.');return createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function prepareImage(input:Buffer,declaredMime?:string){
  if(input.byteLength>MAX_IMAGE_BYTES||!input.byteLength)throw new AccessError(400,'Afbeelding moet tussen 1 byte en 8 MiB zijn.');
  const image=sharp(input,{limitInputPixels:36_000_000,animated:false}),meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format??'')||(meta.pages??1)>1)throw new AccessError(400,'Gebruik een stilstaande JPEG-, PNG- of WebP-afbeelding.');
  if(declaredMime&&declaredMime!==`image/${meta.format}`)throw new AccessError(400,'Bestandstype en afbeeldingsinhoud komen niet overeen.');
  // Decode/re-encode removes metadata and ignores client-provided filenames/MIME types.
  const output=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
  if(output.data.byteLength>MAX_IMAGE_BYTES)throw new AccessError(400,'De verwerkte afbeelding is te groot.');
  return output;
}
export function safeImageFilename(filename:string){
  const base=(filename.split(/[\\/]/).pop()||'afbeelding').normalize('NFC').replace(/\.[^.]*$/,'').replace(/[^\p{L}\p{N}_ -]/gu,'').trim().slice(0,150)||'afbeelding';
  return `${base}.webp`;
}
export async function uploadMedia(db:Database,actor:string,input:Buffer,filename:string,alt:string,declaredMime?:string){
  await assertAdminActor(db,actor);
  if(!alt.trim()||alt.length>500)throw new AccessError(400,'Voeg een beschrijving toe (maximaal 500 tekens).');
  const {data,info}=await prepareImage(input,declaredMime),client=storageClient(),env=readEnv(),path=`uploads/${randomUUID()}.webp`;
  const {error}=await client.storage.from(env.MEDIA_PRIVATE_BUCKET).upload(path,data,{contentType:'image/webp',cacheControl:'0',upsert:false});if(error)throw new AccessError(502,'Privé-upload mislukt.');
  try{await db.transaction(async tx=>{const [row]=await tx.insert(media).values({filename:safeImageFilename(filename),storagePath:path,bucket:env.MEDIA_PRIVATE_BUCKET,mimeType:'image/webp',size:data.length,width:info.width,height:info.height,altText:alt.trim(),uploadedBy:actor}).returning();await tx.insert(auditLogs).values({actorUserId:actor,action:'media.upload',entityType:'media',entityId:row.id,summary:'Gecontroleerde afbeelding privé opgeslagen.'});});}catch{
    const cleaned=await client.storage.from(env.MEDIA_PRIVATE_BUCKET).remove([path]).catch(()=>({error:true}));
    if(cleaned.error)throw new AccessError(502,'Opslaan mislukt en de privé-upload kon niet worden opgeruimd. Controleer Storage voordat je opnieuw uploadt.');
    throw new AccessError(502,'Opslaan mislukt; de privé-upload is opgeruimd.');
  }
}
type StoredMedia = Pick<typeof media.$inferSelect,'bucket'|'storagePath'|'mimeType'|'size'>;
export async function downloadPrivateMedia(row:StoredMedia):Promise<Buffer>{
  const env=readEnv();
  if(row.bucket!==env.MEDIA_PRIVATE_BUCKET||row.mimeType!=='image/webp'||row.size<=0||row.size>MAX_IMAGE_BYTES)throw new AccessError(400,'Deze afbeelding heeft geen gecontroleerd privé-origineel.');
  // The service credential and Storage response stay on the server. Bypass stale
  // origin caches without issuing a bearer URL to the browser.
  try{
    const {data,error}=await storageClient().storage.from(env.MEDIA_PRIVATE_BUCKET).download(row.storagePath,{cacheNonce:randomUUID()},{cache:'no-store'});
    if(error||!data||data.size<=0||data.size>MAX_IMAGE_BYTES)throw new AccessError(502,'Afbeelding niet beschikbaar.');
    const bytes=Buffer.from(await data.arrayBuffer());
    if(bytes.length!==row.size||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new AccessError(502,'Afbeelding niet beschikbaar.');
    return bytes;
  }catch(error){
    if(error instanceof AccessError)throw error;
    throw new AccessError(502,'Afbeelding niet beschikbaar.');
  }
}
export async function changeMedia(db:Database,actor:string,id:string,status:'private'|'published'|'archived',alt:string,form?:Record<string,unknown>){
  await assertAdminActor(db,actor);
  if(!['private','published','archived'].includes(status)||!alt.trim()||alt.length>500)throw new AccessError(400,'Controleer de status en beschrijving.');
  const env=readEnv();
  try{
    await db.transaction(async tx=>{
      const [row]=await tx.select().from(media).where(eq(media.id,id)).for('update');if(!row)throw new AccessError(404,'Afbeelding niet gevonden.');
      if(form){assertRecordRevision(row,form);if(status==='archived'&&row.status!=='archived')assertRecordConfirmation(row,form);}
      const [intent]=await tx.select({id:auditLogs.id}).from(auditLogs).where(and(eq(auditLogs.entityId,id),eq(auditLogs.action,'media.delete.requested'))).limit(1);
      if(intent)throw new AccessError(409,'Voor deze afbeelding is definitief verwijderen aangevraagd. Publiceren of wijzigen is geblokkeerd; ververs de lijst en rond de verwijdering af.');
      if(row.bucket!==env.MEDIA_PRIVATE_BUCKET||row.mimeType!=='image/webp')throw new AccessError(400,'Deze afbeelding heeft geen gecontroleerd privé-origineel.');
      if(status==='published'&&row.status!=='published'){
        const bytes=await downloadPrivateMedia(row),metadata=await sharp(bytes,{limitInputPixels:36_000_000}).metadata();
        if(!bytes.length||bytes.length>MAX_IMAGE_BYTES||metadata.format!=='webp'||(metadata.pages??1)>1)throw new AccessError(400,'Het privé-origineel is geen geldige WebP-afbeelding.');
      }
      // Publication grants access through /api/media/[id] only. Do not create,
      // move or delete Storage objects here. Old copies need separate approval.
      await tx.update(media).set({status,altText:alt.trim(),updatedAt:new Date()}).where(eq(media.id,id));
      await tx.insert(auditLogs).values({actorUserId:actor,action:`media.${status}`,entityType:'media',entityId:id,summary:'Mediastatus gewijzigd; privé-origineel behouden.'});
    });
  }catch(error){
    if(error instanceof AccessError)throw error;
    throw new AccessError(502,'Mediastatus opslaan mislukt; databasewijzigingen zijn teruggedraaid.');
  }
}
export function publicMediaUrl(mediaId:string){return `/api/media/${encodeURIComponent(mediaId)}`;}

export function assertManagedMediaObject(row:typeof media.$inferSelect){
  if(row.bucket!==readEnv().MEDIA_PRIVATE_BUCKET||row.mimeType!=='image/webp'||!/^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(row.storagePath))throw new AccessError(409,'Alleen originele privé-uploads van deze applicatie kunnen worden verwijderd. Legacybestanden blijven behouden.');
}
export async function assertNoPublicMediaCopy(row:typeof media.$inferSelect){
  assertManagedMediaObject(row);
  try{
    const filename=row.storagePath.slice('uploads/'.length);
    const {data,error}=await storageClient().storage.from(readEnv().MEDIA_PUBLIC_BUCKET).list('uploads',{search:filename,limit:100,offset:0,sortBy:{column:'name',order:'asc'}});
    // Unlike HEAD/exists, list does not confuse legacy HTTP 400 object-not-found
    // responses with permission/transport errors. A truncated result fails closed.
    if(error||!Array.isArray(data)||data.length>=100)throw new AccessError(502,'De controle op oude publieke kopieën is niet gelukt. Er wordt geen bestand verwijderd.');
    if(data.some(object=>object.name===filename))throw new AccessError(409,'Er bestaat nog een oude publieke opslagkopie. Bestandsverwijdering is geblokkeerd; die kopie vereist afzonderlijk gecontroleerd opruimen.');
  }catch(error){if(error instanceof AccessError)throw error;throw new AccessError(502,'De controle op oude publieke kopieën is niet gelukt. Er wordt geen bestand verwijderd.');}
}
export async function removeOriginalMediaFile(row:typeof media.$inferSelect){
  assertManagedMediaObject(row);
  try{
    await assertNoPublicMediaCopy(row);
    const {error}=await storageClient().storage.from(row.bucket).remove([row.storagePath]);
    if(error)throw new AccessError(502,'Bestandsverwijdering is onderbroken. De registratie blijft gearchiveerd; ververs de lijst en bevestig een nieuwe poging.');
  }catch(error){if(error instanceof AccessError)throw error;throw new AccessError(502,'Bestandsverwijdering is onderbroken. De registratie blijft gearchiveerd; ververs de lijst en bevestig een nieuwe poging.');}
}
