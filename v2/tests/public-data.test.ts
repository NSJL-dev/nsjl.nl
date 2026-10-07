import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {eq} from 'drizzle-orm';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {testDatabase} from './database';
import {getLegacyProfileStats, getHomeData, getTeamData, getNewsData, selectPublicContext} from '@/lib/public-data';

const state = vi.hoisted(() => ({db: undefined as Database | undefined}));
vi.mock('@/db/client', () => ({getDatabase: async () => {
  if (!state.db) throw new Error('Isolated test database not configured');
  return state.db;
}}));
let seeded: Awaited<ReturnType<typeof testDatabase>>, empty: PGlite;
// Preserve the original cross-page assertions using the new dedicated queries.
async function getPublicData(requested?: string) {
  const [home, team, news] = await Promise.all([getHomeData(requested), getTeamData(requested), getNewsData()]);
  return {...home, profiles: team.profiles, teamProfiles: team.teamProfiles, news: news.news};
}
beforeAll(async () => { seeded = await testDatabase(); state.db = seeded.db; });
afterAll(async () => { await seeded?.client.close(); await empty?.close(); });

describe('Public presentation queries in an isolated database', () => {
  it('uses regular competition without leaking the 20 summer standings', async () => {
    const data = await getPublicData();
    expect(data.context?.competitionSlug).toBe('bullshooter-regulier');
    expect(data.standings).toHaveLength(0);
    expect(data.report).toBeUndefined();
  });
  it('separates internal profiles from the selected NSJL roster, including Tim', async () => {
    const data = await getPublicData();
    expect(data.profiles.map(p => p.slug)).toContain('tim-goossens');
    expect(data.teamProfiles.map(p => p.slug)).not.toContain('tim-goossens');
    expect(data.teamProfiles).toHaveLength(3);
    expect(data.stats).toHaveLength(0);
  });
  it('only shows summer standings after an explicit context selection', async () => {
    const initial = await getPublicData(), summer = initial.contexts.find(c => c.competitionSlug === 'nsjl-zomer')!;
    const data = await getPublicData(summer.id);
    expect(data.context?.id).toBe(summer.id);
    expect(data.standings).toHaveLength(20);
    expect(data.teamProfiles).toHaveLength(0);
  });
  it('an invalid context has an empty competition view and retains real content', async () => {
    const data = await getPublicData('unrecognised-context');
    expect(data.context).toBeNull();
    expect(data.standings).toHaveLength(0);
    expect(data.profiles).toHaveLength(4);
    expect(data.news).toHaveLength(3);
  });
  it('never substitutes summer when the regular current context is missing', () => {
    const contexts = [{id: 'summer', division: 'Koppels', season: '2026', competition: 'Zomer', competitionSlug: 'nsjl-zomer', isCurrent: true}];
    expect(selectPublicContext(contexts)).toBeNull();
    expect(selectPublicContext(contexts, 'summer')?.id).toBe('summer');
    expect(selectPublicContext(contexts, 'absent')).toBeNull();
  });
  it('keeps unverified legacy figures separate from official stats', async () => {
    const data = await getPublicData(), tim = data.profiles.find(p => p.slug === 'tim-goossens')!;
    const rows = await getLegacyProfileStats(tim.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].verificationStatus).toBe('unverified');
    expect(data.stats).toHaveLength(0);
  });
  it('does not reveal news drafts or private media', async () => {
    await seeded.db.insert(s.newsPosts).values({title: 'Private draft', slug: 'private-draft', excerpt: 'Private', content: 'Private', category: 'Team', status: 'draft'});
    await seeded.db.insert(s.media).values({filename: 'private.webp', storagePath: 'private.webp', bucket: 'private-media', mimeType: 'image/webp', size: 100, status: 'private'});
    const data = await getPublicData();
    expect(data.news.some(p => p.slug === 'private-draft')).toBe(false);
    expect(data.media).toHaveLength(0);
  });
  it('does not write a source report, sync run or enable synchronisation', async () => {
    await getPublicData();
    expect(await seeded.db.select().from(s.sourceReports)).toHaveLength(0);
    expect(await seeded.db.select().from(s.syncRuns)).toHaveLength(0);
    expect(await seeded.db.select().from(s.sourceConfigs).where(eq(s.sourceConfigs.enabled, true))).toHaveLength(0);
  });
  it('renders an entirely unseeded database as empty data without throwing', async () => {
    empty = new PGlite(); await empty.waitReady;
    const db = drizzle(empty, {schema: s}); await migrate(db, {migrationsFolder: './drizzle'});
    state.db = db as unknown as Database;
    try {
      const data = await getPublicData();
      expect(data.context).toBeNull();
      expect(data.contexts).toHaveLength(0);
      expect(data.standings).toHaveLength(0);
      expect(data.news).toHaveLength(0);
      expect(data.profiles).toHaveLength(0);
    } finally { state.db = seeded.db; }
  });
});
