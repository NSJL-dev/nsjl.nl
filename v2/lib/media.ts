import 'server-only';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createClient} from '@supabase/supabase-js';
import {eq} from 'drizzle-orm';
import type {Database} from '@/db/client';
import {media,auditLogs} from '@/db/schema';
import {readEnv} from '@/lib/env';
import {AccessError} from '@/lib/security';
import {assertAdminActor} from '@/lib/admin/authorization';
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
  const {error}=await client.storage.from(env.MEDIA_PRIVATE_BUCKET).upload(path,data,{contentType:'image/webp',upsert:false});if(error)throw new AccessError(502,'Privé-upload mislukt.');
  try{await db.transaction(async tx=>{const [row]=await tx.insert(media).values({filename:safeImageFilename(filename),storagePath:path,bucket:env.MEDIA_PRIVATE_BUCKET,mimeType:'image/webp',size:data.length,width:info.width,height:info.height,altText:alt.trim(),uploadedBy:actor}).returning();await tx.insert(auditLogs).values({actorUserId:actor,action:'media.upload',entityType:'media',entityId:row.id,summary:'Gecontroleerde afbeelding privé opgeslagen.'});});}catch{
    const cleaned=await client.storage.from(env.MEDIA_PRIVATE_BUCKET).remove([path]).catch(()=>({error:true}));
    if(cleaned.error)throw new AccessError(502,'Opslaan mislukt en de privé-upload kon niet worden opgeruimd. Controleer Storage voordat je opnieuw uploadt.');
    throw new AccessError(502,'Opslaan mislukt; de privé-upload is opgeruimd.');
  }
}
export async function changeMedia(db:Database,actor:string,id:string,status:'private'|'published'|'archived',alt:string){
  await assertAdminActor(db,actor);
  if(!['private','published','archived'].includes(status)||!alt.trim()||alt.length>500)throw new AccessError(400,'Controleer de status en beschrijving.');
  const client=storageClient(),env=readEnv();
  let createdPublic=false,removedPublic=false,path='';const backup:{publicCopy:Blob|null}={publicCopy:null};
  try{
    await db.transaction(async tx=>{
      const [row]=await tx.select().from(media).where(eq(media.id,id)).for('update');if(!row)throw new AccessError(404,'Afbeelding niet gevonden.');
      if(row.bucket!==env.MEDIA_PRIVATE_BUCKET||row.mimeType!=='image/webp')throw new AccessError(400,'Deze afbeelding heeft geen gecontroleerd privé-origineel.');
      path=row.storagePath;
      if(status==='published'&&row.status!=='published'){
        const original=await client.storage.from(env.MEDIA_PRIVATE_BUCKET).download(path);if(original.error||!original.data)throw new AccessError(502,'Privé-afbeelding niet beschikbaar.');
        const bytes=Buffer.from(await original.data.arrayBuffer()),metadata=await sharp(bytes,{limitInputPixels:36_000_000}).metadata();
        if(!bytes.length||bytes.length>MAX_IMAGE_BYTES||metadata.format!=='webp'||(metadata.pages??1)>1)throw new AccessError(400,'Het privé-origineel is geen geldige WebP-afbeelding.');
        const uploaded=await client.storage.from(env.MEDIA_PUBLIC_BUCKET).upload(path,bytes,{contentType:'image/webp',upsert:false});if(uploaded.error)throw new AccessError(502,'Publiceren mislukt; bestaande bestanden worden niet overschreven.');
        createdPublic=true;
      }else if(status!=='published'){
        if(row.status==='published'){
          const copy=await client.storage.from(env.MEDIA_PUBLIC_BUCKET).download(path);if(copy.error||!copy.data)throw new AccessError(502,'Publieke kopie kon niet veilig worden ingetrokken.');backup.publicCopy=copy.data;
        }
        const removed=await client.storage.from(env.MEDIA_PUBLIC_BUCKET).remove([path]);if(removed.error)throw new AccessError(502,'Publieke kopie kon niet worden ingetrokken.');
        removedPublic=row.status==='published';
      }
      await tx.update(media).set({status,altText:alt.trim(),updatedAt:new Date()}).where(eq(media.id,id));
      await tx.insert(auditLogs).values({actorUserId:actor,action:`media.${status}`,entityType:'media',entityId:id,summary:'Mediastatus gewijzigd; privé-origineel behouden.'});
    });
  }catch(error){
    if(createdPublic){const cleanup=await client.storage.from(env.MEDIA_PUBLIC_BUCKET).remove([path]).catch(()=>({error:true}));if(cleanup.error)throw new AccessError(502,'Publicatie mislukt en de publieke kopie kon niet worden opgeruimd. Controleer Storage.');}
    if(removedPublic&&backup.publicCopy){const restored=await client.storage.from(env.MEDIA_PUBLIC_BUCKET).upload(path,await backup.publicCopy.arrayBuffer(),{contentType:'image/webp',upsert:false}).catch(()=>({error:true}));if(restored.error)throw new AccessError(502,'Intrekken mislukt en de oorspronkelijke publieke kopie kon niet worden hersteld. Controleer Storage.');}
    if(error instanceof AccessError)throw error;
    throw new AccessError(502,'Mediastatus opslaan mislukt; databasewijzigingen zijn teruggedraaid.');
  }
}
export function publicMediaUrl(path:string){const env=readEnv();return `${env.SUPABASE_URL}/storage/v1/object/public/${env.MEDIA_PUBLIC_BUCKET}/${path}`;}
