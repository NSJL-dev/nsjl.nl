import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {and, eq, sql} from 'drizzle-orm';
import {testDatabase} from './database';
import * as s from '@/db/schema';
import {adminMutation} from '@/lib/admin/mutations';
import {recordName, recordRevision, type ManagedRecord} from '@/lib/admin/record-guard';
import {AccessError} from '@/lib/security';
const mocks = vi.hoisted(() => ({admin: vi.fn(), database: vi.fn(), invalidate: vi.fn()}));
vi.mock('@/lib/auth', () => ({requireAdmin: mocks.admin}));
vi.mock('@/db/client', () => ({getDatabase: mocks.database}));
vi.mock('next/cache', () => ({revalidatePath: mocks.invalidate}));
import {POST} from '@/app/api/admin/[resource]/route';

let c: Awaited<ReturnType<typeof testDatabase>>, actor: string, team: typeof s.teamSeasons.$inferSelect, report: string;
beforeAll(async () => {
  c = await testDatabase(); actor = crypto.randomUUID();
  await c.db.insert(s.users).values({id: actor, name: 'Removal fixture admin', email: 'removal@example.invalid'});
  [team] = await c.db.select().from(s.teamSeasons).where(eq(s.teamSeasons.isPrimaryNsjl, true)).limit(1);
  const [source] = await c.db.select().from(s.sourceConfigs);
  const [r] = await c.db.insert(s.sourceReports).values({sourceConfigId: source.id, reportType: 'results', discoveredUrl: 'https://fixture.example.invalid/removal', reportDatetimeLocal: new Date('2026-10-01T12:00:00Z'), sha256: 'd'.repeat(64), parserVersion: 'removal-fixture'}).returning(); report = r.id;
});
afterAll(async () => {await c?.client.close();});
beforeEach(() => {
  vi.clearAllMocks(); for (const [key, value] of Object.entries({APP_ENV: 'development', APP_URL: 'http://localhost:3000', DATABASE_MODE: 'local', SYNC_ENABLED: 'false'})) vi.stubEnv(key, value);
  vi.stubEnv('VERCEL', undefined); mocks.database.mockResolvedValue(c.db); mocks.admin.mockResolvedValue({user: {id: actor}});
});
afterEach(() => {vi.unstubAllEnvs();});
function actionForm(row: ManagedRecord, action = 'archive') {return {id: row.id, action, expectedRevision: recordRevision(row), confirmedName: recordName(row), ...(action === 'delete' ? {typedName: recordName(row)} : {})};}
async function player(extra: Partial<typeof s.players.$inferInsert> = {}) {
  const id = crypto.randomUUID(); return (await c.db.insert(s.players).values({id, firstName: 'Fixture', lastName: 'Profiel', displayName: `Fixture ${id}`, slug: `fixture-${id}`, isActive: false, ...extra}).returning())[0];
}
async function content(resource: string): Promise<ManagedRecord> {
  const id = crypto.randomUUID();
  if (resource === 'nieuws') return (await c.db.insert(s.newsPosts).values({title: `Nieuws ${id}`, slug: `nieuws-${id}`, excerpt: 'Fixture', content: '<p>Fixture</p>', category: 'Team', status: 'published', publishedAt: new Date()}).returning())[0];
  if (resource === 'agenda') return (await c.db.insert(s.events).values({title: `Agenda ${id}`, startsAt: new Date('2026-12-01T19:00:00Z'), eventType: 'training'}).returning())[0];
  if (resource === 'sponsors') return (await c.db.insert(s.sponsors).values({name: `Sponsor ${id}`}).returning())[0];
  return player({isActive: true});
}
async function stored(resource: string, id: string): Promise<ManagedRecord | undefined> {
  if (resource === 'nieuws') return (await c.db.select().from(s.newsPosts).where(eq(s.newsPosts.id, id)))[0];
  if (resource === 'agenda') return (await c.db.select().from(s.events).where(eq(s.events.id, id)))[0];
  if (resource === 'sponsors') return (await c.db.select().from(s.sponsors).where(eq(s.sponsors.id, id)))[0];
  return (await c.db.select().from(s.players).where(eq(s.players.id, id)))[0];
}
// Existing invariants concern committed actions; denial attempts now have a separate audit.
async function audits(id: string) {return (await c.db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, id))).filter(row => !row.action.endsWith('.delete.denied'));}
async function request(resource: string, body: Record<string, string>, origin = 'http://localhost:3000') {
  return POST(new Request(`http://localhost:3000/api/admin/${resource}`, {method: 'POST', headers: {origin}, body: new URLSearchParams(body)}), {params: Promise.resolve({resource})});
}

describe('Safe editorial archiving and isolated profile removal', () => {
  it.each(['nieuws', 'agenda', 'spelers', 'sponsors'])('%s archive preserves the complete record and writes exactly one audit', async resource => {
    const row = await content(resource); await adminMutation(c.db, actor, resource, actionForm(row)); const after = (await stored(resource, row.id))!;
    expect(after).toMatchObject({...row, updatedAt: expect.any(Date), ...('status' in row ? {status: 'archived'} : {isActive: false})});
    expect(await audits(row.id)).toEqual([expect.objectContaining({actorUserId: actor, entityId: row.id, action: `${resource}.archive`})]);
    await expect(adminMutation(c.db, actor, resource, actionForm(row))).rejects.toMatchObject({status: 409});
    expect(await audits(row.id)).toHaveLength(1);
  });
  it('removes only an inactive unlinked player, retaining attached media, old audit and competition data', async () => {
    const [media] = await c.db.insert(s.media).values({filename: 'removal-fixture.webp', storagePath: 'fixture/removal.webp', bucket: 'private-media', mimeType: 'image/webp', size: 24, status: 'private'}).returning();
    const row = await player({photoMediaId: media.id});
    await c.db.insert(s.auditLogs).values({actorUserId: actor, action: 'spelers.save', entityType: 'spelers', entityId: row.id, summary: 'Fixture creation'});
    const before = {media: await c.db.select().from(s.media), teams: await c.db.select().from(s.teamSeasons), standings: await c.db.select().from(s.standings), users: await c.db.select().from(s.users)};
    await adminMutation(c.db, actor, 'spelers', actionForm(row, 'delete'));
    expect(await stored('spelers', row.id)).toBeUndefined();
    expect(await c.db.select().from(s.media)).toEqual(before.media); expect(await c.db.select().from(s.teamSeasons)).toEqual(before.teams);
    expect(await c.db.select().from(s.standings)).toEqual(before.standings); expect(await c.db.select().from(s.users)).toEqual(before.users);
    expect((await audits(row.id)).map(a => a.action).sort()).toEqual(['spelers.delete', 'spelers.save']);
    expect((await audits(row.id)).every(a => !a.summary.includes(row.displayName))).toBe(true);
  });
  it('a visible profile cannot be permanently deleted', async () => {
    const row = await player({isActive: true}); await expect(adminMutation(c.db, actor, 'spelers', actionForm(row, 'delete'))).rejects.toMatchObject({status: 409});
    expect(await stored('spelers', row.id)).toEqual(row); expect(await audits(row.id)).toHaveLength(0);
  });
  it.each(['instellingen', 'koppelingen', 'stand', 'statistieken', 'bronconfiguratie', 'audit'])('permanent deletion of %s is not implemented and is refused', async resource => {
    await expect(adminMutation(c.db, actor, resource, {action: 'delete', id: crypto.randomUUID()})).rejects.toMatchObject({status: 400});
  });
  it.each(['membership', 'alias', 'external', 'stats', 'history', 'legacy'])('refuses a profile with %s records and preserves links and never records a successful deletion', async kind => {
    const row = await player();
    if (['membership', 'stats', 'history'].includes(kind)) await c.db.insert(s.playerTeamSeasons).values({playerId: row.id, teamSeasonId: team.id});
    if (kind === 'alias') await c.db.insert(s.playerAliases).values({playerId: row.id, source: 'fixture', divisionId: team.divisionId, teamSeasonId: team.id, externalName: row.displayName, normalizedName: row.slug});
    if (kind === 'legacy') await c.db.insert(s.legacyPlayerStats).values({playerId: row.id, originFile: 'fixture-only'});
    if (['external', 'stats', 'history'].includes(kind)) {
      const [external] = await c.db.insert(s.externalPlayers).values({playerId: row.id, source: 'fixture', teamSeasonId: team.id, externalName: row.displayName, normalizedName: row.slug}).returning();
      if (kind === 'stats') await c.db.insert(s.playerSeasonStats).values({playerId: row.id, externalPlayerId: external.id, teamSeasonId: team.id, sourceReportId: report, x01Ppd: '20.00'});
      if (kind === 'history') await c.db.insert(s.playerStatsHistory).values({playerId: row.id, externalPlayerId: external.id, teamSeasonId: team.id, sourceReportId: report, cricketMpr: '2.00'});
    }
    async function dependencies() {return Promise.all([c.db.select().from(s.playerTeamSeasons), c.db.select().from(s.playerAliases), c.db.select().from(s.externalPlayers), c.db.select().from(s.playerSeasonStats), c.db.select().from(s.playerStatsHistory), c.db.select().from(s.legacyPlayerStats)]);}
    const before = await dependencies();
    await expect(adminMutation(c.db, actor, 'spelers', actionForm(row, 'delete'))).rejects.toMatchObject({status: 409});
    expect(await stored('spelers', row.id)).toEqual(row); expect(await dependencies()).toEqual(before); expect(await audits(row.id)).toHaveLength(0);
    await expect(adminMutation(c.db, actor, 'spelers', actionForm(row))).rejects.toMatchObject({status: 409}); // Already hidden; no link cleanup.
    expect(await dependencies()).toEqual(before);
  });
  it('archiving a linked visible profile preserves all player context', async () => {
    const row = await player({isActive: true}); const [membership] = await c.db.insert(s.playerTeamSeasons).values({playerId: row.id, teamSeasonId: team.id}).returning();
    await adminMutation(c.db, actor, 'spelers', actionForm(row)); expect((await stored('spelers', row.id))!).toMatchObject({isActive: false});
    expect(await c.db.select().from(s.playerTeamSeasons).where(eq(s.playerTeamSeasons.id, membership.id))).toEqual([membership]);
  });
  it('a future unlisted foreign key still blocks removal without cascading or detaching', async () => {
    const row = await player(); await c.db.execute(sql`create table test_profile_reference (player_id uuid not null references public.players(id))`);
    try {
      await c.db.execute(sql`insert into test_profile_reference (player_id) values (${row.id})`);
      await expect(adminMutation(c.db, actor, 'spelers', actionForm(row, 'delete'))).rejects.toMatchObject({status: 409});
      expect(await stored('spelers', row.id)).toEqual(row); expect(await audits(row.id)).toHaveLength(0);
      expect((await c.db.execute(sql`select count(*)::int as count from test_profile_reference`)).rows[0].count).toBe(1);
    } finally {await c.db.execute(sql`drop table test_profile_reference`);}
  });
  it('audit failure rolls deletion back and preserves pre-existing immutable audits', async () => {
    const row = await player(); await c.db.insert(s.auditLogs).values({actorUserId: actor, action: 'spelers.save', entityType: 'spelers', entityId: row.id, summary: 'Fixture audit'});
    await c.db.execute(sql`create function test_reject_delete_audit() returns trigger language plpgsql as $$begin if new.action = 'spelers.delete' then raise exception 'Fixture audit failure'; end if; return new; end;$$`);
    await c.db.execute(sql`create trigger test_reject_delete_audit before insert on public.audit_logs for each row execute function test_reject_delete_audit()`);
    try {
      await expect(adminMutation(c.db, actor, 'spelers', actionForm(row, 'delete'))).rejects.toThrow();
      expect(await stored('spelers', row.id)).toEqual(row); expect((await audits(row.id)).map(a => a.action)).toEqual(['spelers.save']);
    } finally {await c.db.execute(sql`drop trigger test_reject_delete_audit on public.audit_logs`); await c.db.execute(sql`drop function test_reject_delete_audit()`);}
  });
});

describe('Revision, confirmation and authorization gates', () => {
  it.each(['archive', 'delete'])('%s requires both a valid current revision and the exact confirmed name', async action => {
    const row = await player({isActive: action === 'archive'}), valid = actionForm(row, action);
    for (const bad of [{...valid, expectedRevision: undefined}, {...valid, expectedRevision: 'bad'}, {...valid, expectedRevision: '0'.repeat(64)}, {...valid, confirmedName: undefined}, {...valid, confirmedName: 'Different fixture'}]) {
      await expect(adminMutation(c.db, actor, 'spelers', bad)).rejects.toBeInstanceOf(AccessError);
    }
    expect(await stored('spelers', row.id)).toEqual(row); expect(await audits(row.id)).toHaveLength(0);
  });
  it('content changes with the same timestamp invalidate a revision', async () => {
    const row = await player(); const changed = {...row, bio: 'Edited independently'}; expect(recordRevision(changed)).not.toBe(recordRevision(row));
    await c.db.update(s.players).set({bio: changed.bio}).where(eq(s.players.id, row.id));
    await expect(adminMutation(c.db, actor, 'spelers', actionForm(row, 'delete'))).rejects.toMatchObject({status: 409}); expect(await audits(row.id)).toHaveLength(0);
  });
  it('missing revisions on edits are refused rather than overwriting archived items', async () => {
    const row = await player(); await expect(adminMutation(c.db, actor, 'spelers', {id: row.id, displayName: row.displayName, firstName: row.firstName, lastName: row.lastName, sortOrder: 0, isActive: 'on'})).rejects.toMatchObject({status: 400});
    expect(await stored('spelers', row.id)).toEqual(row);
  });
  it('an old edit cannot republish a profile after its archive', async () => {
    const row = await player({isActive: true}); await adminMutation(c.db, actor, 'spelers', actionForm(row));
    await expect(adminMutation(c.db, actor, 'spelers', {...actionForm(row), action: 'save', firstName: row.firstName, lastName: row.lastName, displayName: row.displayName, sortOrder: 0, isActive: 'on'})).rejects.toMatchObject({status: 409});
    expect((await stored('spelers', row.id))!).toMatchObject({isActive: false}); expect(await audits(row.id)).toHaveLength(1);
  });
  it.each(['nieuws', 'spelers', 'sponsors'])('archiving %s via editor fields cannot bypass confirmation', async resource => {
    const row = await content(resource);
    const fields = resource === 'nieuws' && 'excerpt' in row ? {title: row.title, slug: row.slug, excerpt: row.excerpt, content: row.content, category: row.category, status: 'archived'}
      : resource === 'spelers' && 'displayName' in row ? {displayName: row.displayName, firstName: row.firstName, lastName: row.lastName, sortOrder: row.sortOrder}
      : 'name' in row ? {name: row.name, sortOrder: row.sortOrder} : {};
    const form = {id: row.id, expectedRevision: recordRevision(row), action: 'save', ...fields};
    await expect(adminMutation(c.db, actor, resource, form)).rejects.toMatchObject({status: 400}); expect(await stored(resource, row.id)).toEqual(row);
    await adminMutation(c.db, actor, resource, {...form, confirmedName: recordName(row)}); expect((await audits(row.id))[0].action).toBe(`${resource}.archive`);
  });
  it('editing an archived agenda item does not silently publish it again', async () => {
    const row = (await content('agenda')) as typeof s.events.$inferSelect; await adminMutation(c.db, actor, 'agenda', actionForm(row));
    const archived = (await stored('agenda', row.id))!;
    await adminMutation(c.db, actor, 'agenda', {id: row.id, expectedRevision: recordRevision(archived), title: 'Edited archived fixture', startsAt: row.startsAt.toISOString(), eventType: row.eventType});
    expect((await stored('agenda', row.id))!).toMatchObject({isActive: false, title: 'Edited archived fixture'});
  });
  it.each(['archive', 'delete'])('two concurrent %s requests commit at most one action/audit', async action => {
    const row = await player({isActive: action === 'archive'}), form = actionForm(row, action);
    const results = await Promise.allSettled([adminMutation(c.db, actor, 'spelers', form), adminMutation(c.db, actor, 'spelers', form)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await audits(row.id)).toHaveLength(1);
  });
  it.each(['inactive', 'editor', 'unregistered'])('%s actors cannot remove a profile directly', async kind => {
    const row = await player(), id = crypto.randomUUID(); if (kind !== 'unregistered') await c.db.insert(s.users).values({id, name: 'Denied fixture', email: `${id}@example.invalid`, role: kind === 'editor' ? 'editor' : 'admin', isActive: kind !== 'inactive'});
    await expect(adminMutation(c.db, id, 'spelers', actionForm(row, 'delete'))).rejects.toMatchObject({status: 403}); expect(await stored('spelers', row.id)).toEqual(row); expect(await audits(row.id)).toHaveLength(0);
  });
  it.each([401, 403])('HTTP %i authorization/MFA rejection precedes deletion and database access', async status => {
    mocks.admin.mockRejectedValueOnce(new AccessError(status, 'Beheer/MFA vereist')); const response = await request('spelers', {id: crypto.randomUUID(), action: 'delete'});
    expect(response.status).toBe(status); expect(mocks.admin).toHaveBeenCalledWith(true); expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.invalidate).not.toHaveBeenCalled(); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each(['https://foreign.example.invalid', 'null', ''])('foreign or absent Origin %s cannot archive/delete', async origin => {
    expect((await request('spelers', {id: crypto.randomUUID(), action: 'delete'}, origin)).status).toBe(403); expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it('HTTP deletion refreshes the list with a safe success message and invalidates public routes', async () => {
    const row = await player(); const response = await request('spelers', actionForm(row, 'delete'));
    expect(response.status).toBe(303); expect(new URL(response.headers.get('location')!).searchParams.get('message')).toBe('Profiel verwijderd');
    expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(mocks.invalidate).toHaveBeenCalledWith('/team', 'layout'); expect(mocks.invalidate).toHaveBeenCalledWith('/admin', 'layout'); expect(await stored('spelers', row.id)).toBeUndefined();
    const duplicate = await request('spelers', actionForm(row, 'delete')); expect(duplicate.status).toBe(404); expect(await audits(row.id)).toHaveLength(1);
  });
  it('HTTP archive keeps the record and returns an archive-specific list message', async () => {
    const row = await content('agenda'); const response = await request('agenda', actionForm(row));
    expect(response.status).toBe(303); expect(new URL(response.headers.get('location')!).searchParams.get('message')).toBe('Gearchiveerd'); expect(mocks.invalidate).toHaveBeenCalledWith('/agenda', 'layout'); expect((await stored('agenda', row.id))!).toMatchObject({isActive: false});
  });
  it('blocked HTTP removal produces a useful error without invalidating caches or logging success', async () => {
    const row = await player(); await c.db.insert(s.legacyPlayerStats).values({playerId: row.id, originFile: 'blocked-fixture'});
    const response = await request('spelers', actionForm(row, 'delete')); expect(response.status).toBe(409); expect((await response.json()).error).toContain('blijft behouden'); expect(mocks.invalidate).not.toHaveBeenCalled(); expect(await audits(row.id)).toHaveLength(0);
  });
  it('all known player foreign keys retain NO ACTION and no deferred or cascade rules', async () => {
    const result = await c.db.execute(sql`select confdeltype, condeferrable from pg_constraint where contype = 'f' and confrelid = 'public.players'::regclass`);
    expect(result.rows).toHaveLength(6); for (const row of result.rows) {expect(row.confdeltype).toBe('a'); expect(row.condeferrable).toBe(false);}
  });
  it('no sync is enabled or performed by the removal workflows', async () => {
    expect(await c.db.select().from(s.sourceConfigs).where(eq(s.sourceConfigs.enabled, true))).toHaveLength(0); expect(await c.db.select().from(s.syncRuns)).toHaveLength(0);
    expect(await c.db.select().from(s.users).where(and(eq(s.users.id, actor), eq(s.users.role, 'admin'), eq(s.users.isActive, true)))).toHaveLength(1);
  });
});
