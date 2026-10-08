import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {and, eq, sql} from 'drizzle-orm';
import * as s from '@/db/schema';
import {testDatabase} from './database';
import {adminMutation} from '@/lib/admin/mutations';
import {recordName, recordRevision, type ManagedRecord} from '@/lib/admin/record-guard';
const http = vi.hoisted(() => ({admin: vi.fn(), database: vi.fn(), invalidate: vi.fn()}));
vi.mock('@/lib/auth', () => ({requireAdmin: http.admin}));
vi.mock('@/db/client', () => ({getDatabase: http.database}));
vi.mock('next/cache', () => ({revalidatePath: http.invalidate}));
import {POST} from '@/app/api/admin/[resource]/route';
import {AccessError} from '@/lib/security';
let c: Awaited<ReturnType<typeof testDatabase>>, actor: string, division: string, report: string;
beforeAll(async () => {
  c = await testDatabase(); actor = crypto.randomUUID(); await c.db.insert(s.users).values({id: actor, name: 'Deletion fixture', email: 'deletion-fixture@example.invalid'});
  [division] = (await c.db.select().from(s.divisions).limit(1)).map(row => row.id);
  const [config] = await c.db.select().from(s.sourceConfigs);
  [report] = (await c.db.insert(s.sourceReports).values({sourceConfigId: config.id, reportType: 'results', discoveredUrl: 'https://fixture.example.invalid/deletion', reportDatetimeLocal: new Date(), sha256: '5'.repeat(64), parserVersion: 'fixture'}).returning()).map(row => row.id);
});
afterAll(async () => {await c?.client.close();});
beforeEach(() => {
  vi.clearAllMocks(); http.database.mockResolvedValue(c.db); http.admin.mockResolvedValue({user: {id: actor}});
  for (const [key, value] of Object.entries({APP_ENV: 'development', APP_URL: 'http://localhost:3000', DATABASE_MODE: 'local', SYNC_ENABLED: 'false'})) vi.stubEnv(key, value); vi.stubEnv('VERCEL', undefined);
});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs();});
function form(row: ManagedRecord, action = 'delete') {return {id: row.id, action, expectedRevision: recordRevision(row), confirmedName: recordName(row), typedName: recordName(row)};}
async function editorial(resource: string, mediaId?: string): Promise<ManagedRecord> {
  const id = crypto.randomUUID();
  if (resource === 'nieuws') return (await c.db.insert(s.newsPosts).values({id, title: `Nieuws ${id}`, slug: `nieuws-${id}`, excerpt: 'Fixture', content: '<p>Fixture</p>', category: 'Team', status: 'archived', featuredMediaId: mediaId}).returning())[0];
  if (resource === 'agenda') return (await c.db.insert(s.events).values({id, title: `Agenda ${id}`, startsAt: new Date('2026-12-01T19:00:00Z'), eventType: 'training', isActive: false}).returning())[0];
  return (await c.db.insert(s.sponsors).values({id, name: `Sponsor ${id}`, isActive: false, logoMediaId: mediaId}).returning())[0];
}
async function stored(resource: string, id: string) {
  if (resource === 'nieuws') return (await c.db.select().from(s.newsPosts).where(eq(s.newsPosts.id, id)))[0];
  if (resource === 'agenda') return (await c.db.select().from(s.events).where(eq(s.events.id, id)))[0];
  return (await c.db.select().from(s.sponsors).where(eq(s.sponsors.id, id)))[0];
}
async function audits(id: string, action: string) {return c.db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, id), eq(s.auditLogs.action, action)));}
async function media() {return (await c.db.insert(s.media).values({filename: 'shared-fixture.webp', storagePath: `uploads/${crypto.randomUUID()}.webp`, bucket: 'private-media', mimeType: 'image/webp', size: 24, status: 'published'}).returning())[0];}
async function manual(extra: Partial<typeof s.matches.$inferInsert> = {}) {
  const id = crypto.randomUUID(); return (await c.db.insert(s.matches).values({slug: `manual-${id}`, divisionId: division, roundKey: id, importKey: id, source: 'manual', status: 'cancelled', ...extra}).returning())[0];
}
async function request(resource: string, body: Record<string, string>) {return POST(new Request(`http://localhost:3000/api/admin/${resource}`, {method: 'POST', headers: {origin: 'http://localhost:3000'}, body: new URLSearchParams(body)}), {params: Promise.resolve({resource})});}
describe('Explicit permanent deletion without collateral data loss', () => {
  it.each(['nieuws', 'agenda', 'sponsors'])('deletes only archived %s and preserves other records, media and old audit', async resource => {
    const image = await media(), row = await editorial(resource, image.id), other = await editorial(resource, image.id);
    await c.db.insert(s.auditLogs).values({actorUserId: actor, action: `${resource}.save`, entityType: resource, entityId: row.id, summary: 'Fixture creation'});
    const teams = await c.db.select().from(s.teamSeasons), stands = await c.db.select().from(s.standings), users = await c.db.select().from(s.users);
    await adminMutation(c.db, actor, resource, form(row)); expect(await stored(resource, row.id)).toBeUndefined(); expect(await stored(resource, other.id)).toEqual(other);
    expect((await c.db.select().from(s.media).where(eq(s.media.id, image.id)))[0]).toEqual(image); expect(await c.db.select().from(s.teamSeasons)).toEqual(teams); expect(await c.db.select().from(s.standings)).toEqual(stands); expect(await c.db.select().from(s.users)).toEqual(users);
    expect(await audits(row.id, `${resource}.save`)).toHaveLength(1); expect(await audits(row.id, `${resource}.delete`)).toHaveLength(1);
  });
  it.each(['nieuws', 'agenda', 'sponsors'])('%s requires archival before permanent removal', async resource => {
    const row = await editorial(resource); if (resource === 'nieuws') await c.db.update(s.newsPosts).set({status: 'draft'}).where(eq(s.newsPosts.id, row.id)); else if (resource === 'agenda') await c.db.update(s.events).set({isActive: true}).where(eq(s.events.id, row.id)); else await c.db.update(s.sponsors).set({isActive: true}).where(eq(s.sponsors.id, row.id));
    const current = (await stored(resource, row.id))!; await expect(adminMutation(c.db, actor, resource, form(current))).rejects.toMatchObject({status: 409}); expect(await stored(resource, row.id)).toEqual(current); expect(await audits(row.id, `${resource}.delete.denied`)).toHaveLength(1);
  });
  it.each([undefined, '', 'verkeerde naam', ' Sponsor fixture '])('requires the exact typed name (%s)', async typedName => {
    const row = await editorial('sponsors'); await expect(adminMutation(c.db, actor, 'sponsors', {...form(row), typedName})).rejects.toMatchObject({status: 400}); expect(await stored('sponsors', row.id)).toEqual(row); expect(await audits(row.id, 'sponsors.delete')).toHaveLength(0);
  });
  it('checks both identifier confirmation and full current revision', async () => {
    const row = await editorial('nieuws'); await expect(adminMutation(c.db, actor, 'nieuws', {...form(row), confirmedName: 'Andere naam'})).rejects.toMatchObject({status: 400});
    await c.db.update(s.newsPosts).set({excerpt: 'Concurrent edit', updatedAt: row.updatedAt}).where(eq(s.newsPosts.id, row.id));
    await expect(adminMutation(c.db, actor, 'nieuws', form(row))).rejects.toMatchObject({status: 409}); expect((await stored('nieuws', row.id))!).toMatchObject({excerpt: 'Concurrent edit'});
  });
  it.each(['nieuws', 'agenda', 'sponsors'])('serializes duplicate/concurrent %s deletes with one success audit', async resource => {
    const row = await editorial(resource), results = await Promise.allSettled([adminMutation(c.db, actor, resource, form(row)), adminMutation(c.db, actor, resource, form(row))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(await audits(row.id, `${resource}.delete`)).toHaveLength(1); expect(await audits(row.id, `${resource}.delete.denied`)).toHaveLength(1);
  });
  it('rolls back record deletion if its success audit cannot commit', async () => {
    const row = await editorial('agenda'), original = c.db.transaction.bind(c.db);
    vi.spyOn(c.db, 'transaction').mockImplementationOnce(callback => original(async tx => {await callback(tx); throw new Error('Fixture commit failure');}));
    await expect(adminMutation(c.db, actor, 'agenda', form(row))).rejects.toThrow(); expect(await stored('agenda', row.id)).toEqual(row); expect(await audits(row.id, 'agenda.delete')).toHaveLength(0); expect(await audits(row.id, 'agenda.delete.denied')).toHaveLength(1);
  });
  it.each(['no action', 'cascade', 'set null'])('a future news relation with ON DELETE %s cannot damage linked records', async rule => {
    const row = await editorial('nieuws');
    await c.db.execute(sql.raw(`create table test_news_dependency (news_id uuid references public.news_posts(id) on delete ${rule})`));
    try {
      await c.db.execute(sql`insert into test_news_dependency values (${row.id})`);
      await expect(adminMutation(c.db,actor,'nieuws',form(row))).rejects.toMatchObject({status:409});
      expect(await stored('nieuws',row.id)).toEqual(row); expect((await c.db.execute(sql`select news_id from test_news_dependency`)).rows).toEqual([{news_id:row.id}]);
      expect(await audits(row.id,'nieuws.delete')).toHaveLength(0);
    } finally {await c.db.execute(sql`drop table test_news_dependency`);}
  });
  it('denial audits contain neither submitted names/content nor raw exceptions', async () => {
    const row = await editorial('sponsors'); await expect(adminMutation(c.db, actor, 'sponsors', {...form(row), typedName: 'PRIVATE INPUT MARKER'})).rejects.toThrow();
    const [audit] = await audits(row.id, 'sponsors.delete.denied'); expect(audit.actorUserId).toBe(actor); expect(audit.summary).not.toContain('PRIVATE INPUT MARKER'); expect(audit.summary).not.toContain(recordName(row));
  });
  it.each(['inactive', 'editor', 'unregistered'])('rejects a %s actor before deletion', async kind => {
    const row = await editorial('agenda'), id = crypto.randomUUID(); if (kind !== 'unregistered') await c.db.insert(s.users).values({id, name: 'Denied actor', email: `${id}@example.invalid`, isActive: kind !== 'inactive', role: kind === 'editor' ? 'editor' : 'admin'});
    await expect(adminMutation(c.db, id, 'agenda', form(row))).rejects.toMatchObject({status: 403}); expect(await stored('agenda', row.id)).toEqual(row);
  });
  it.each([401, 403])('HTTP admin/MFA %i rejection occurs before database or Storage access', async status => {
    http.admin.mockRejectedValueOnce(new AccessError(status, 'Beheer/MFA vereist')); expect((await request('sponsors', {action: 'delete', id: crypto.randomUUID()})).status).toBe(status); expect(http.database).not.toHaveBeenCalled(); expect(http.admin).toHaveBeenCalledWith(true);
  });
  it('redirects deletion to refreshed admin list and invalidates sponsor/public data', async () => {
    const row = await editorial('sponsors'), response = await request('sponsors', form(row)); expect(response.status).toBe(303); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(new URL(response.headers.get('location')!).searchParams.get('message')).toBe('Item definitief verwijderd'); expect(http.invalidate).toHaveBeenCalledWith('/sponsors', 'layout');
  });
  it.each(['spelers', 'nieuws', 'sponsors'] as const)('detaches only the selected %s media link, preserving the shared file and other references', async resource => {
    const image = await media(), other = await editorial('sponsors', image.id);
    const row = resource === 'spelers' ? (await c.db.insert(s.players).values({displayName: 'Detach fixture', firstName: 'Detach', lastName: 'Fixture', slug: `detach-${crypto.randomUUID()}`, photoMediaId: image.id}).returning())[0] : await editorial(resource, image.id);
    await adminMutation(c.db, actor, resource, {...form(row, 'detach'), expectedMediaId: image.id});
    const current = resource === 'spelers' ? (await c.db.select().from(s.players).where(eq(s.players.id, row.id)))[0] : await stored(resource, row.id);
    expect(current).toBeDefined(); expect('photoMediaId' in current! ? current.photoMediaId : 'featuredMediaId' in current! ? current.featuredMediaId : 'logoMediaId' in current! ? current.logoMediaId : undefined).toBeNull();
    expect(await stored('sponsors', other.id)).toEqual(other); expect((await c.db.select().from(s.media).where(eq(s.media.id, image.id)))[0]).toEqual(image); expect(await audits(row.id, `${resource}.detach`)).toHaveLength(1);
  });
  it('rejects a detach of a replaced image or incorrect typed identity', async () => {
    const image = await media(), row = await editorial('sponsors', image.id);
    await expect(adminMutation(c.db, actor, 'sponsors', {...form(row, 'detach'), expectedMediaId: crypto.randomUUID()})).rejects.toMatchObject({status: 409});
    await expect(adminMutation(c.db, actor, 'sponsors', {...form(row, 'detach'), expectedMediaId: image.id, typedName: ''})).rejects.toMatchObject({status: 400}); expect(await stored('sponsors', row.id)).toEqual(row);
  });
  it('removes only a cancelled manual match without touching competition/team records', async () => {
    const match = await manual(), context = await c.db.select().from(s.divisions), teams = await c.db.select().from(s.teamSeasons);
    await adminMutation(c.db, actor, 'wedstrijden', form(match)); expect(await c.db.select().from(s.matches).where(eq(s.matches.id, match.id))).toHaveLength(0); expect(await c.db.select().from(s.divisions)).toEqual(context); expect(await c.db.select().from(s.teamSeasons)).toEqual(teams); expect(await audits(match.id, 'wedstrijden.delete')).toHaveLength(1);
  });
  it.each([{source: 'bullshooter'}, {source: 'legacy'}, {status: 'scheduled'}, {homeScore: 0}, {awayScore: 1}, {playedDate: '2026-10-01'}, {resultReportId: 'REPORT'}, {scheduleReportId: 'REPORT'}, {externalIdentifier: 'linked'}] as const)('blocks match with unsafe provenance/result %j', async extra => {
    const values = {...extra, ...('resultReportId' in extra ? {resultReportId: report} : {}), ...('scheduleReportId' in extra ? {scheduleReportId: report} : {})};
    const match = await manual(values as Partial<typeof s.matches.$inferInsert>); await expect(adminMutation(c.db, actor, 'wedstrijden', form(match))).rejects.toMatchObject({status: 409}); expect((await c.db.select().from(s.matches).where(eq(s.matches.id, match.id)))[0]).toEqual(match);
  });
  it.each(['override', 'result'])('blocks a manual match with %s references without unlinking them', async kind => {
    const match = await manual(); if (kind === 'override') await c.db.insert(s.dataOverrides).values({matchId: match.id, fieldName: 'notes', textValue: 'Fixture correction', reason: 'Fixture reason', createdBy: actor, isActive: false});
    else {const [team] = await c.db.select().from(s.teamSeasons).limit(1); await c.db.insert(s.matchResultSides).values({matchId: match.id, teamSeasonId: team.id, games: 1, wins: 1, losses: 0, forfeits: 0, sourceReportId: report});}
    await expect(adminMutation(c.db, actor, 'wedstrijden', form(match))).rejects.toMatchObject({status: 409}); expect(await c.db.select().from(s.matches).where(eq(s.matches.id, match.id))).toHaveLength(1);
    expect(kind === 'override' ? await c.db.select().from(s.dataOverrides).where(eq(s.dataOverrides.matchId, match.id)) : await c.db.select().from(s.matchResultSides).where(eq(s.matchResultSides.matchId, match.id))).toHaveLength(1);
  });
  it.each(['stand', 'statistieken', 'koppelingen', 'instellingen', 'bronconfiguratie', 'audit', 'accounts'])('excludes sensitive %s from generic removal', async resource => {
    await expect(adminMutation(c.db, actor, resource, {action: 'delete', id: crypto.randomUUID()})).rejects.toMatchObject({status: 400});
  });
  it('leaves synchronization disabled and never starts an import', async () => {
    expect(await c.db.select().from(s.sourceConfigs).where(eq(s.sourceConfigs.enabled, true))).toHaveLength(0); expect(await c.db.select().from(s.syncRuns)).toHaveLength(0);
  });
});
