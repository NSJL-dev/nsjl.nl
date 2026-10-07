import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {assertOrigin,AccessError} from '@/lib/security';
import {readEnv} from '@/lib/env';
import {getDatabase} from '@/db/client';
import {enforceRateLimit} from '@/lib/rate-limit';
import {uploadMedia,MAX_SERVER_UPLOAD_BYTES} from '@/lib/media';
export const runtime='nodejs';
export async function POST(request:Request){try{
  assertOrigin(request.headers.get('origin'),readEnv().APP_URL);const {user}=await requireAdmin(true),db=await getDatabase();await enforceRateLimit(db,'media-upload',user.id,20,3600);
  const length=Number(request.headers.get('content-length'));if(length>MAX_SERVER_UPLOAD_BYTES+128*1024)throw new AccessError(413,'Kies een afbeelding van maximaal 4 MiB.');
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||!file.size||file.size>MAX_SERVER_UPLOAD_BYTES)throw new AccessError(400,'Kies een afbeelding van maximaal 4 MiB.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new AccessError(400,'Gebruik JPEG, PNG of WebP.');
  await uploadMedia(db,user.id,Buffer.from(await file.arrayBuffer()),file.name,String(form.get('altText')??''),file.type);const response=NextResponse.redirect(new URL('/admin/media?message=Priv%C3%A9%20opgeslagen',request.url),303);response.headers.set('Cache-Control','private, no-store');return response;
}catch(error){return NextResponse.json({error:error instanceof AccessError?error.message:'De afbeelding kon niet worden verwerkt.'},{status:error instanceof AccessError?error.status:400,headers:{'Cache-Control':'private, no-store'}});}}
