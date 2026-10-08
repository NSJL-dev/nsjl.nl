import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {and, eq, sql} from 'drizzle-orm';
import * as s from '@/db/schema';
import {testDatabase} from './database';
import {adminMutation} from '@/lib/admin/mutations';
import {changeMedia} from '@/lib/media';
import {recordRevision} from '@/lib/admin/record-guard';
const storage = vi.hoisted(() => ({from: vi.fn(), remove: vi.fn(), list: vi.fn()}));
vi.mock('@supabase/supabase-js', () => ({createClient: () => ({storage: {from: storage.from}})}));
let c: Awaited<ReturnType<typeof testDatabase>>, actor: string;
const objects = new Map<string, Buffer>();
function form(row: typeof s.media.$inferSelect) {return {id: row.id, action: 'delete', expectedRevision: recordRevision(row), confirmedName: row.filename, typedName: row.filename};}
async function fixture(extra: Partial<typeof s.media.$inferInsert> = {}) {
  const [row] = await c.db.insert(s.media).values({filename: 'wegwerp-fixture.webp', storagePath: `uploads/${crypto.randomUUID()}.webp`, bucket: 'private-media', mimeType: 'image/webp', size: 24, status: 'archived', uploadedBy: actor, ...extra}).returning();
  objects.set(`${row.bucket}/${row.storagePath}`, Buffer.from('RIFF00000000WEBPfixture')); return row;
}
async function current(id: string) {return (await c.db.select().from(s.media).where(eq(s.media.id, id)))[0];}
async function audit(id: string, action: string) {return c.db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, id), eq(s.auditLogs.action, action)));}
beforeAll(async () => {c = await testDatabase(); actor = crypto.randomUUID(); await c.db.insert(s.users).values({id: actor, name: 'Media deletion fixture', email: 'media-delete@example.invalid'});});
afterAll(async () => {await c?.client.close();});
beforeEach(() => {
  vi.clearAllMocks(); objects.clear();
  for (const [key, value] of Object.entries({APP_ENV: 'development', APP_URL: 'http://localhost:3000', DATABASE_MODE: 'local', SYNC_ENABLED: 'false', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SECRET_KEY: 'fixture-not-a-real-storage-key'})) vi.stubEnv(key, value); vi.stubEnv('VERCEL', undefined);
  storage.list.mockImplementation(async (bucket:string, folder:string, options:{search:string}) => ({data:[...objects.keys()].filter(key=>key.startsWith(`${bucket}/${folder}/`)).map(key=>({name:key.slice(`${bucket}/${folder}/`.length)})).filter(object=>object.name.includes(options.search)),error:null}));
  storage.remove.mockImplementation(async (bucket: string, paths: string[]) => {for (const path of paths) objects.delete(`${bucket}/${path}`); return {error: null, data: []};});
  storage.from.mockImplementation((bucket: string) => ({list: (folder:string, options:{search:string}) => storage.list(bucket,folder,options), remove: (paths: string[]) => storage.remove(bucket, paths)}));
});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs();});
describe('Archived, unreferenced media deletion with durable intent and safe retries', () => {
  it('removes only the selected original and registration, preserving unrelated objects and audit', async () => {
    const row = await fixture(), other = await fixture({filename: 'behouden.webp'});
    await c.db.insert(s.auditLogs).values({actorUserId: actor, action: 'media.upload', entityType: 'media', entityId: row.id, summary: 'Fixture upload'});
    await adminMutation(c.db, actor, 'media', form(row)); expect(await current(row.id)).toBeUndefined(); expect(await current(other.id)).toEqual(other);
    expect(objects.has(`private-media/${row.storagePath}`)).toBe(false); expect(objects.has(`private-media/${other.storagePath}`)).toBe(true);
    expect(storage.remove).toHaveBeenCalledExactlyOnceWith('private-media', [row.storagePath]); expect(await audit(row.id, 'media.delete.requested')).toHaveLength(1); expect(await audit(row.id, 'media.delete')).toHaveLength(1); expect(await audit(row.id, 'media.upload')).toHaveLength(1);
  });
  it.each(['private', 'published'])('refuses %s media before any Storage write', async status => {
    const row = await fixture({status}); await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 409}); expect(await current(row.id)).toEqual(row); expect(storage.remove).not.toHaveBeenCalled();
  });
  it.each(['spelers', 'nieuws', 'sponsors', 'instellingen'])('blocks even hidden %s references without deleting/unlinking them', async kind => {
    const row = await fixture();
    if (kind === 'spelers') await c.db.insert(s.players).values({displayName: 'Hidden fixture', firstName: 'Hidden', lastName: 'Fixture', slug: `hidden-${row.id}`, photoMediaId: row.id, isActive: false});
    else if (kind === 'nieuws') await c.db.insert(s.newsPosts).values({title: 'Archived fixture', slug: `archived-${row.id}`, excerpt: 'Fixture', content: 'Fixture', category: 'Team', status: 'archived', featuredMediaId: row.id});
    else if (kind === 'sponsors') await c.db.insert(s.sponsors).values({name: 'Inactive logo fixture', isActive: false, logoMediaId: row.id});
    else await c.db.insert(s.siteSettings).values({key: `fixture-${row.id}`, valueMediaId: row.id});
    await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 409}); expect(await current(row.id)).toEqual(row); expect(objects.has(`private-media/${row.storagePath}`)).toBe(true); expect(storage.from).not.toHaveBeenCalled(); expect(await audit(row.id, 'media.delete.denied')).toHaveLength(1);
  });
  it.each([{bucket: 'published-media'}, {storagePath: 'legacy/file.webp'}, {storagePath: '../../shared.webp'}, {mimeType: 'image/png'}])('retains non-owned or unsafe file %j', async extra => {
    const row = await fixture(extra); await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 409}); expect(await current(row.id)).toEqual(row); expect(storage.from).not.toHaveBeenCalled();
  });
  it('blocks a legacy public copy and removes neither copy nor private original', async () => {
    const row = await fixture(); objects.set(`published-media/${row.storagePath}`, Buffer.from('legacy fixture'));
    await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 409}); expect(await current(row.id)).toEqual(row); expect(objects.size).toBe(2); expect(storage.remove).not.toHaveBeenCalled(); expect(await audit(row.id, 'media.delete.requested')).toHaveLength(0);
  });
  it.each([400, 401, 403, 500])('fails closed when legacy-copy listing returns %i', async status => {
    const row = await fixture(); storage.list.mockResolvedValue({data: null, error: {status}}); await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 502}); expect(storage.remove).not.toHaveBeenCalled(); expect(await current(row.id)).toEqual(row);
  });
  it('requires typed identity and current revision before touching Storage', async () => {
    const row = await fixture(); await expect(adminMutation(c.db, actor, 'media', {...form(row), typedName: 'wrong'})).rejects.toMatchObject({status: 400}); await expect(adminMutation(c.db, actor, 'media', {...form(row), expectedRevision: '0'.repeat(64)})).rejects.toMatchObject({status: 409}); expect(storage.from).not.toHaveBeenCalled();
  });
  it('blocks a future unreviewed foreign key before touching the physical file', async () => {
    const row = await fixture(); await c.db.execute(sql`create table test_future_media_use (media_id uuid references public.media(id))`);
    try {
      await c.db.execute(sql`insert into test_future_media_use values (${row.id})`);
      await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status:409});
      expect(storage.from).not.toHaveBeenCalled(); expect(await current(row.id)).toEqual(row);
      expect((await c.db.execute(sql`select count(*)::int as count from test_future_media_use`)).rows[0].count).toBe(1);
    } finally {await c.db.execute(sql`drop table test_future_media_use`);}
  });
  it('blocks truncated Storage inventory instead of assuming a public copy is absent', async () => {
    const row=await fixture(); storage.list.mockResolvedValue({data:Array.from({length:100},(_,i)=>({name:`other-${i}.webp`})),error:null});
    await expect(adminMutation(c.db,actor,'media',form(row))).rejects.toMatchObject({status:502}); expect(storage.remove).not.toHaveBeenCalled(); expect(await current(row.id)).toEqual(row);
  });
  it('rejects an unregistered actor before touching Storage', async () => {
    const row = await fixture(); await expect(adminMutation(c.db, crypto.randomUUID(), 'media', form(row))).rejects.toMatchObject({status: 403}); expect(storage.from).not.toHaveBeenCalled(); expect(await current(row.id)).toEqual(row);
  });
  it('commits no intent and removes no bytes if the first transaction fails', async () => {
    const row = await fixture(), original = c.db.transaction.bind(c.db);
    vi.spyOn(c.db, 'transaction').mockImplementationOnce(callback => original(async tx => {await callback(tx); throw new Error('Fixture intent commit failure');}));
    await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toThrow(); expect(await current(row.id)).toEqual(row); expect(storage.remove).not.toHaveBeenCalled(); expect(await audit(row.id, 'media.delete.requested')).toHaveLength(0);
  });
  it('Storage failure preserves the archive/intent, blocks republishing and permits a new confirmed retry', async () => {
    const row = await fixture(); storage.remove.mockResolvedValueOnce({data: null, error: {message: 'PRIVATE EXCEPTION MARKER'}});
    await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 502}); const pending = (await current(row.id))!;
    expect(pending.status).toBe('archived'); expect(objects.has(`private-media/${row.storagePath}`)).toBe(true); expect(await audit(row.id, 'media.delete')).toHaveLength(0);
    await expect(changeMedia(c.db, actor, row.id, 'published', 'Fixture')).rejects.toMatchObject({status: 409});
    await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 409});
    const allAudit = await c.db.select().from(s.auditLogs); expect(JSON.stringify(allAudit)).not.toContain('PRIVATE EXCEPTION MARKER');
    await adminMutation(c.db, actor, 'media', form(pending)); expect(await current(row.id)).toBeUndefined(); expect(await audit(row.id, 'media.delete')).toHaveLength(1);
  });
  it('a DB failure after Storage deletion leaves a durable, frozen archive and retry completes idempotently', async () => {
    const row = await fixture(), original = c.db.transaction.bind(c.db); let transactions = 0;
    vi.spyOn(c.db, 'transaction').mockImplementation(callback => original(async tx => {const result = await callback(tx); if (++transactions === 2) throw new Error('Fixture final commit failure'); return result;}));
    await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 502}); const pending = (await current(row.id))!;
    expect(pending.status).toBe('archived'); expect(objects.has(`private-media/${row.storagePath}`)).toBe(false); expect(await audit(row.id, 'media.delete')).toHaveLength(0); expect(await audit(row.id, 'media.delete.requested')).toHaveLength(1);
    await expect(changeMedia(c.db, actor, row.id, 'private', 'Fixture')).rejects.toMatchObject({status: 409});
    await adminMutation(c.db, actor, 'media', form(pending)); expect(await current(row.id)).toBeUndefined(); expect(await audit(row.id, 'media.delete')).toHaveLength(1);
  });
  it('concurrent requests perform one physical deletion and one success audit', async () => {
    const row = await fixture(), results = await Promise.allSettled([adminMutation(c.db, actor, 'media', form(row)), adminMutation(c.db, actor, 'media', form(row))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(storage.remove).toHaveBeenCalledTimes(1); expect(await audit(row.id, 'media.delete')).toHaveLength(1);
  });
  it('an uncompleted recent intent refuses another attempt until the lease expires', async () => {
    const row = await fixture(); await c.db.insert(s.auditLogs).values({actorUserId: actor, action: 'media.delete.requested', entityType: 'media', entityId: row.id, summary: 'Synthetic interrupted fixture'});
    await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 409}); expect(storage.remove).not.toHaveBeenCalled();
  });
  it('an old crashed intent can be resumed after renewed identity confirmation', async () => {
    const row = await fixture(); await c.db.insert(s.auditLogs).values({actorUserId: actor, action: 'media.delete.requested', entityType: 'media', entityId: row.id, occurredAt: new Date(Date.now() - 16 * 60_000), summary: 'Synthetic interrupted fixture'});
    await adminMutation(c.db, actor, 'media', form(row)); expect(await current(row.id)).toBeUndefined(); expect(await audit(row.id, 'media.delete')).toHaveLength(1);
  });
  it('rechecks late references after durable intent, before deleting any bytes', async () => {
    const row = await fixture(), original = c.db.transaction.bind(c.db); let transactions = 0;
    vi.spyOn(c.db, 'transaction').mockImplementation(async callback => {const result = await original(callback); if (++transactions === 1) await c.db.insert(s.sponsors).values({name: 'Late reference fixture', logoMediaId: row.id, isActive: false}); return result;});
    await expect(adminMutation(c.db, actor, 'media', form(row))).rejects.toMatchObject({status: 409}); expect((await current(row.id))!.status).toBe('archived'); expect(storage.remove).not.toHaveBeenCalled(); expect(await c.db.select().from(s.sponsors).where(eq(s.sponsors.logoMediaId, row.id))).toHaveLength(1);
  });
});
