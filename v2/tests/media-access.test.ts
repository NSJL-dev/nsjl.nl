import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import sharp from 'sharp';
import {testDatabase} from './database';
import * as s from '@/db/schema';
import {AccessError} from '@/lib/security';

const mocks=vi.hoisted(()=>({admin:vi.fn(),database:vi.fn(),from:vi.fn(),download:vi.fn(),upload:vi.fn(),remove:vi.fn(),signed:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAdmin:mocks.admin}));
vi.mock('@/db/client',()=>({getDatabase:mocks.database}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({storage:{from:mocks.from}})}));
import {GET as preview} from '@/app/api/admin/media/[id]/route';
import {GET as publicImage} from '@/app/api/media/[id]/route';
import {uploadMedia,changeMedia,publicMediaUrl,MAX_IMAGE_BYTES} from '@/lib/media';

let c:Awaited<ReturnType<typeof testDatabase>>,actor:string,input:Buffer;
const objects=new Map<string,Buffer>();
const context=(id:string)=>({params:Promise.resolve({id})});
const request=(url:string,headers?:HeadersInit)=>new Request('http://localhost:3000'+url,{headers});
function noStore(response:Response){
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('cdn-cache-control')).toBe('no-store');
  expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('etag')).toBeNull();
  expect(response.headers.get('last-modified')).toBeNull();
  expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
}
async function image(status:'private'|'published'|'archived'='private'){
  await uploadMedia(c.db,actor,input,'fixture.webp','Een testafbeelding','image/webp');
  const [row]=await c.db.select().from(s.media).where(eq(s.media.bucket,'private-media'));
  if(status!=='private')await changeMedia(c.db,actor,row.id,status,'Een testafbeelding');
  vi.clearAllMocks();
  return row;
}
beforeAll(async()=>{
  c=await testDatabase();actor=crypto.randomUUID();
  await c.db.insert(s.users).values({id:actor,name:'Media route admin',email:'media-route@example.invalid'});
  input=await sharp({create:{width:40,height:20,channels:3,background:'#2563eb'}}).webp().toBuffer();
});
afterAll(async()=>{await c?.client.close();});
beforeEach(async()=>{
  for(const [key,value]of Object.entries({APP_ENV:'development',APP_URL:'http://localhost:3000',DATABASE_MODE:'local',SYNC_ENABLED:'false',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'fixture-server-key'}))vi.stubEnv(key,value);
  vi.stubEnv('VERCEL',undefined);vi.clearAllMocks();objects.clear();
  await c.db.delete(s.media).where(eq(s.media.bucket,'private-media'));
  // The auth helper is tested separately; these routes must invoke its full
  // server-side admin/MFA gate on every request, before touching Storage.
  mocks.admin.mockReset().mockResolvedValue({user:{id:actor}});
  mocks.database.mockReset().mockResolvedValue(c.db);
  mocks.download.mockReset().mockImplementation(async(path:string)=>{
    const bytes=objects.get('private-media/'+path);
    return bytes?{data:new Blob([new Uint8Array(bytes)],{type:'image/webp'}),error:null}:{data:null,error:{message:'missing'}};
  });
  mocks.upload.mockReset().mockImplementation(async(path:string,bytes:Buffer)=>{objects.set('private-media/'+path,Buffer.from(bytes));return {error:null};});
  mocks.remove.mockReset().mockImplementation(async(paths:string[])=>{for(const path of paths)objects.delete('private-media/'+path);return {error:null};});
  mocks.signed.mockReset().mockImplementation(()=>{throw new Error('Signed links are forbidden in this fixture.');});
  mocks.from.mockReset().mockImplementation(()=>({download:mocks.download,upload:mocks.upload,remove:mocks.remove,createSignedUrl:mocks.signed}));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});

describe('Private media always stays inside an authorized admin request',()=>{
  it('returns validated image bytes for an admin with MFA, without exposing a Storage URL',async()=>{
    const row=await image(),url='/api/admin/media/'+row.id;
    const response=await preview(request(url),context(row.id));
    expect(response.status).toBe(200);noStore(response);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(objects.get('private-media/'+row.storagePath));
    expect(mocks.admin).toHaveBeenCalledWith(true);expect(mocks.from).toHaveBeenCalledWith('private-media');
    expect(mocks.download).toHaveBeenCalledWith(row.storagePath,{cacheNonce:expect.any(String)},{cache:'no-store'});
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(JSON.stringify([...response.headers])).not.toContain('fixture-server-key');
    expect(JSON.stringify([...response.headers])).not.toContain('supabase.co');
  });
  it.each([
    ['no login',401],['expired session',401],['inactive account',403],['wrong role',403],['insufficient MFA',403],
  ])('denies %s before accessing database or Storage',async(_state,status)=>{
    mocks.admin.mockRejectedValueOnce(new AccessError(status,'Toegang geweigerd.'));
    const response=await preview(request('/api/admin/media/fixture'),context(crypto.randomUUID()));
    expect(response.status).toBe(status);noStore(response);
    expect(mocks.database).not.toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.signed).not.toHaveBeenCalled();expect(response.headers.get('content-type')).not.toBe('image/webp');
  });
  it('rechecks the same URL after logout instead of reusing the previous authorized response',async()=>{
    const row=await image(),url='/api/admin/media/'+row.id;
    expect((await preview(request(url),context(row.id))).status).toBe(200);
    const reads=mocks.download.mock.calls.length;
    mocks.admin.mockRejectedValueOnce(new AccessError(401,'Log eerst in.'));
    const response=await preview(request(url,{'If-None-Match':'fixture-old','Range':'bytes=0-63'}),context(row.id));
    expect(response.status).toBe(401);noStore(response);expect(mocks.admin).toHaveBeenCalledTimes(2);
    expect(mocks.download).toHaveBeenCalledTimes(reads);expect(response.headers.get('content-type')).not.toBe('image/webp');
  });
  it('uses a new cache nonce for each private Storage read',async()=>{
    const row=await image(),url='/api/admin/media/'+row.id;
    await preview(request(url),context(row.id));await preview(request(url),context(row.id));
    expect(mocks.download.mock.calls[0][1].cacheNonce).not.toBe(mocks.download.mock.calls[1][1].cacheNonce);
    expect(mocks.signed).not.toHaveBeenCalled();
  });
});

describe('Public media checks publication for each uncached request',()=>{
  it('publishing permits a public GET without creating or reading a public Storage copy',async()=>{
    const row=await image();await changeMedia(c.db,actor,row.id,'published','Test');vi.clearAllMocks();
    const response=await publicImage(request(publicMediaUrl(row.id)),context(row.id));
    expect(response.status).toBe(200);noStore(response);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(objects.get('private-media/'+row.storagePath));
    expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.from.mock.calls).toEqual([['private-media']]);
    expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.signed).not.toHaveBeenCalled();
  });
  it.each(['private','archived'] as const)('withdrawing to %s denies the exact same warmed URL, including query strings and conditional requests',async status=>{
    const row=await image('published'),url=publicMediaUrl(row.id),original=Buffer.from(objects.get('private-media/'+row.storagePath)!);
    expect((await publicImage(request(url),context(row.id))).status).toBe(200);
    await changeMedia(c.db,actor,row.id,status,'Test');vi.clearAllMocks();
    for(const suffix of ['', '?cacheNonce=fixture', '?status=published&token=fixture']){
      const response=await publicImage(request(url+suffix,{'If-None-Match':'fixture-old','Range':'bytes=0-63'}),context(row.id));
      expect(response.status).toBe(404);noStore(response);expect(response.headers.get('content-type')).not.toBe('image/webp');
    }
    expect(mocks.from).not.toHaveBeenCalled();expect(objects.get('private-media/'+row.storagePath)).toEqual(original);
    expect((await c.db.select().from(s.media).where(eq(s.media.id,row.id)))[0]).toMatchObject({id:row.id,bucket:row.bucket,storagePath:row.storagePath,status});
  });
  it('refuses bytes when withdrawal commits while the Storage download is in flight',async()=>{
    const row=await image('published');
    let finish!:(response:{data:Blob;error:null})=>void,enter!:()=>void;
    const entered=new Promise<void>(resolve=>{enter=resolve;});
    mocks.download.mockImplementationOnce(()=>{enter();return new Promise(resolve=>{finish=resolve;});});
    const pending=publicImage(request(publicMediaUrl(row.id)),context(row.id));
    await entered;await changeMedia(c.db,actor,row.id,'private','Test');
    finish({data:new Blob([new Uint8Array(objects.get('private-media/'+row.storagePath)!)],{type:'image/webp'}),error:null});
    const response=await pending;expect(response.status).toBe(404);noStore(response);
    expect(response.headers.get('content-type')).not.toBe('image/webp');
  });
  it('does not expose a private row even when a historical public copy still exists',async()=>{
    const row=await image();objects.set('published-media/'+row.storagePath,Buffer.from('Historical public copy'));
    const snapshot=new Map(objects),response=await publicImage(request(publicMediaUrl(row.id)),context(row.id));
    expect(response.status).toBe(404);expect(mocks.from).not.toHaveBeenCalled();expect(objects).toEqual(snapshot);
  });
  it.each(['private','archived'] as const)('never reads Storage for an initially %s image',async status=>{
    const row=await image(status),response=await publicImage(request(publicMediaUrl(row.id)),context(row.id));
    expect(response.status).toBe(404);noStore(response);expect(mocks.from).not.toHaveBeenCalled();
  });
  it('invalid and unknown IDs are denied without revealing object names',async()=>{
    for(const id of ['not-a-media-id',crypto.randomUUID()]){
      const response=await publicImage(request('/api/media/'+id),context(id));expect(response.status).toBe(404);noStore(response);
    }
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([{bucket:'published-media'},{bucket:'unrelated-bucket'},{mimeType:'image/png'}])('does not serve records without a controlled private WebP original: %j',async fields=>{
    const row=await image('published');await c.db.update(s.media).set(fields).where(eq(s.media.id,row.id));
    const response=await publicImage(request(publicMediaUrl(row.id)),context(row.id));
    expect(response.status).toBe(404);noStore(response);expect(mocks.from).not.toHaveBeenCalled();
    await c.db.update(s.media).set({bucket:row.bucket,mimeType:row.mimeType}).where(eq(s.media.id,row.id));
  });
  it('a genuine database failure returns an uncached server error without raw exception details',async()=>{
    mocks.database.mockRejectedValueOnce(new Error('Fixture internal connection details'));
    const response=await publicImage(request('/api/media/fixture'),context(crypto.randomUUID()));
    expect(response.status).toBe(500);noStore(response);expect(await response.text()).not.toContain('Fixture internal');expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('Storage failures do not release redirects, credentials or unvalidated bytes',()=>{
  it.each(['empty','malformed','wrong-size','oversized'] as const)('rejects a %s Storage body',async kind=>{
    const row=await image('published'),original=objects.get('private-media/'+row.storagePath)!;
    const bytes=kind==='empty'?Buffer.alloc(0):kind==='malformed'?Buffer.alloc(original.length):kind==='wrong-size'?original.subarray(0,original.length-1):Buffer.alloc(MAX_IMAGE_BYTES+1);
    mocks.download.mockResolvedValueOnce({data:new Blob([new Uint8Array(bytes)],{type:'image/webp'}),error:null});
    const response=await publicImage(request(publicMediaUrl(row.id)),context(row.id));
    expect(response.status).toBe(502);noStore(response);expect(response.headers.get('content-type')).not.toBe('image/webp');expect(mocks.signed).not.toHaveBeenCalled();
  });
  it('keeps raw download exceptions out of the response and logs',async()=>{
    const row=await image(),warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),error=vi.spyOn(console,'error').mockImplementation(()=>{});
    mocks.download.mockRejectedValueOnce(new Error('Fixture server key and internal details'));
    const response=await preview(request('/api/admin/media/'+row.id),context(row.id));
    expect(response.status).toBe(502);noStore(response);expect(await response.text()).not.toContain('Fixture server');
    expect(warn).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(mocks.signed).not.toHaveBeenCalled();
  });
});
