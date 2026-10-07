import {stagingOnly} from './environment';
import {storageClient} from '../lib/media';
import {readEnv} from '../lib/env';
stagingOnly();const c=storageClient(),e=readEnv();
for(const [id,isPublic]of [[e.MEDIA_PRIVATE_BUCKET,false],[e.MEDIA_PUBLIC_BUCKET,true]]as const){const {data}=await c.storage.getBucket(id);if(data){if(data.public!==isPublic)throw new Error('Bestaande bucket heeft afwijkend privacybeleid; handmatige review nodig.');continue;}const {error}=await c.storage.createBucket(id,{public:isPublic,fileSizeLimit:8*1024*1024,allowedMimeTypes:['image/webp']});if(error)throw new Error('Aanmaken stagingbucket mislukt.');}
console.log('Afzonderlijke privé- en openbare mediabuckets gereed. Browser-uploads krijgen geen schrijfpolicy.');
