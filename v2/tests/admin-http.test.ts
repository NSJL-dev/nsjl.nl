import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {testDatabase} from './database';
import {users,newsPosts,auditLogs,media} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {AccessError} from '@/lib/security';
const mocks=vi.hoisted(()=>({admin:vi.fn(),database:vi.fn(),upload:vi.fn(),invalidate:vi.fn(),signed:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAdmin:mocks.admin}));
vi.mock('@/db/client',()=>({getDatabase:mocks.database}));
vi.mock('@/lib/media',async original=>({...await original<typeof import('@/lib/media')>(),uploadMedia:mocks.upload,storageClient:()=>({storage:{from:()=>({createSignedUrl:mocks.signed})}})}));
vi.mock('next/cache',()=>({revalidatePath:mocks.invalidate}));
import {POST as mutate} from '@/app/api/admin/[resource]/route';
import {POST as upload} from '@/app/api/admin/media/upload/route';
import {POST as manualSync} from '@/app/api/admin/sync/route';
import {GET as preview} from '@/app/api/admin/media/[id]/route';
let c:Awaited<ReturnType<typeof testDatabase>>,actor:string;
function request(path:string,body:BodyInit=new URLSearchParams({key:'hero_subtitle',valueText:'Test'}),origin='http://localhost:3000'){return new Request(`http://localhost:3000${path}`,{method:'POST',headers:{origin},body});}
function context(resource:string){return {params:Promise.resolve({resource})};}
beforeAll(async()=>{c=await testDatabase();actor=crypto.randomUUID();await c.db.insert(users).values({id:actor,name:'HTTP admin',email:'http-admin@example.invalid'});mocks.database.mockResolvedValue(c.db);});
afterAll(async()=>{await c?.client.close();});
beforeEach(()=>{for(const [key,value]of Object.entries({APP_ENV:'development',APP_URL:'http://localhost:3000',DATABASE_MODE:'local',SYNC_ENABLED:'false'}))vi.stubEnv(key,value);vi.stubEnv('VERCEL',undefined);vi.clearAllMocks();mocks.database.mockResolvedValue(c.db);mocks.admin.mockResolvedValue({user:{id:actor}});mocks.upload.mockResolvedValue(undefined);mocks.signed.mockResolvedValue({data:{signedUrl:'https://fixture.supabase.co/storage/v1/object/sign/private-media/fixture.webp'},error:null});});
afterEach(()=>{vi.unstubAllEnvs();});
describe('Authorization is required on every administrative write route',()=>{
  it.each(['nieuws','spelers','instellingen','agenda','sponsors','media','koppelingen','wedstrijden','stand','statistieken'])('unauthenticated %s write is denied before database access',async resource=>{mocks.admin.mockRejectedValueOnce(new AccessError(401,'Log eerst in.'));expect((await mutate(request(`/api/admin/${resource}`),context(resource))).status).toBe(401);expect(mocks.database).not.toHaveBeenCalled();});
  it('an AAL1 session cannot mutate news',async()=>{mocks.admin.mockRejectedValueOnce(new AccessError(403,'Tweestapsverificatie vereist'));expect((await mutate(request('/api/admin/nieuws'),context('nieuws'))).status).toBe(403);expect(mocks.database).not.toHaveBeenCalled();});
  it('foreign, missing or opaque Origin is denied before authorization',async()=>{for(const origin of ['https://evil.example.invalid','','null'])expect((await mutate(request('/api/admin/instellingen',undefined,origin),context('instellingen'))).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
  it('an authorized request persists a draft and its audit, then invalidates public caches',async()=>{const r=await mutate(request('/api/admin/nieuws',new URLSearchParams({title:'HTTP bericht',excerpt:'Samenvatting',content:'<p>Hallo</p>',category:'Team',status:'draft'})),context('nieuws'));expect(r.status).toBe(303);expect(mocks.admin).toHaveBeenCalledWith(true);const [row]=await c.db.select().from(newsPosts).where(eq(newsPosts.slug,'http-bericht'));expect(row.status).toBe('draft');expect((await c.db.select().from(auditLogs).where(eq(auditLogs.entityId,row.id)))[0].actorUserId).toBe(actor);expect(mocks.invalidate).toHaveBeenCalledWith('/team','layout');expect(r.headers.get('cache-control')).toBe('private, no-store');});
  it('unauthorized upload never reaches database or Storage',async()=>{mocks.admin.mockRejectedValueOnce(new AccessError(401,'Log eerst in.'));expect((await upload(request('/api/admin/media/upload'))).status).toBe(401);expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.database).not.toHaveBeenCalled();});
  it('upload rejects missing files and unapproved MIME types',async()=>{expect((await upload(request('/api/admin/media/upload'))).status).toBe(400);const body=new FormData();body.set('file',new File(['fixture'],'x.svg',{type:'image/svg+xml'}));expect((await upload(request('/api/admin/media/upload',body))).status).toBe(400);expect(mocks.upload).not.toHaveBeenCalled();});
  it('upload enforces its server payload limit before reading the file',async()=>{const r=request('/api/admin/media/upload');r.headers.set('content-length',String(5*1024*1024));expect((await upload(r)).status).toBe(413);expect(mocks.upload).not.toHaveBeenCalled();});
  it('authorized WebP upload passes declared MIME and alt text to the validating server helper',async()=>{const body=new FormData();body.set('file',new File(['fixture-bytes'],'x.webp',{type:'image/webp'}));body.set('altText','Een dartbord');const r=await upload(request('/api/admin/media/upload',body));expect(r.status).toBe(303);expect(mocks.upload).toHaveBeenCalledWith(c.db,actor,Buffer.from('fixture-bytes'),'x.webp','Een dartbord','image/webp');});
  it('private preview requires AAL2 before accessing Storage',async()=>{mocks.admin.mockRejectedValueOnce(new AccessError(403,'MFA vereist'));expect((await preview(new Request('http://localhost:3000/api/admin/media/fixture'),{params:Promise.resolve({id:crypto.randomUUID()})})).status).toBe(403);expect(mocks.signed).not.toHaveBeenCalled();});
  it('private preview is an uncached sixty-second read link issued only for a registered image',async()=>{const [row]=await c.db.insert(media).values({filename:'fixture.webp',storagePath:'fixture.webp',bucket:'private-media',mimeType:'image/webp',size:32,status:'private'}).returning();const r=await preview(new Request(`http://localhost:3000/api/admin/media/${row.id}`),{params:Promise.resolve({id:row.id})});expect(r.status).toBe(307);expect(mocks.signed).toHaveBeenCalledWith('fixture.webp',60);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('referrer-policy')).toBe('no-referrer');});
  it('missing private image never issues a read link',async()=>{const r=await preview(new Request('http://localhost:3000/api/admin/media/fixture'),{params:Promise.resolve({id:crypto.randomUUID()})});expect(r.status).toBe(404);expect(mocks.signed).not.toHaveBeenCalled();});
  it('even a valid admin cannot run a disabled manual sync',async()=>{expect((await manualSync(request('/api/admin/sync'))).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.database).not.toHaveBeenCalled();});
});
