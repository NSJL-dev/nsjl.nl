import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {and, eq} from 'drizzle-orm';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {testDatabase} from './database';
import {getPublicContexts, selectPublicContext} from '@/lib/public-context';
import {findPublicMatch, getHomeData, getMatchesData, getNewsArticleData, getNewsData, getPlayerData, getPlayerProfile, getPublicSettings, getSitemapData, getStandData, getStatisticsData, getTeamData} from '@/lib/public-data';
import {PlayerAvatar} from '@/components/public/players';
import {Hero} from '@/components/public/hero';
import {SourceStatus} from '@/components/public/competition';
import {publicMediaUrl} from '@/lib/media';

const state = vi.hoisted(() => ({db: undefined as Database | undefined, failure: false}));
vi.mock('@/db/client', () => ({getDatabase: async () => {
  if (state.failure) throw new Error('TEST_DATABASE_UNAVAILABLE');
  if (!state.db) throw new Error('Isolated database missing');
  return state.db;
}}));
let c: Awaited<ReturnType<typeof testDatabase>>;
let regular: Awaited<ReturnType<typeof getPublicContexts>>[number], summer: typeof regular;
let mike: typeof s.players.$inferSelect, tim: typeof mike;
let report: typeof s.sourceReports.$inferSelect, config: typeof s.sourceConfigs.$inferSelect;
let mikeStat: typeof s.playerSeasonStats.$inferSelect;
let fixtureMatch: typeof s.matches.$inferSelect;
let counter = 0;
async function makeReport(configId: string) {
  const [row] = await c.db.insert(s.sourceReports).values({sourceConfigId: configId, reportType: 'results', discoveredUrl: 'https://example.invalid/test-report.html', reportDatetimeLocal: new Date('2026-10-03T12:00:00Z'), sha256: (++counter).toString(16).padStart(64, '0'), parserVersion: 'isolated-test'}).returning();
  return row;
}
async function makeStats(player: typeof mike | null, teamSeasonId: string, divisionId: string, reportId: string, name: string, ppd: string) {
  if (player) {
    await c.db.insert(s.playerTeamSeasons).values({playerId: player.id, teamSeasonId}).onConflictDoNothing();
    await c.db.insert(s.playerAliases).values({playerId: player.id, teamSeasonId, divisionId, source: 'bullshooter', externalName: name, normalizedName: name.toLowerCase()}).onConflictDoNothing();
  }
  const [external] = await c.db.insert(s.externalPlayers).values({source: 'bullshooter', teamSeasonId, playerId: player?.id, externalName: name, normalizedName: name.toLowerCase(), firstSeenReportId: reportId, lastSeenReportId: reportId}).returning();
  const [stats] = await c.db.insert(s.playerSeasonStats).values({externalPlayerId: external.id, playerId: player?.id, teamSeasonId, sourceReportId: reportId, x01Ppd: ppd, x01Games: 10, x01Wins: 0, cricketMpr: '1.75', cricketGames: 4, cricketWins: null}).returning();
  return stats;
}
beforeAll(async () => {
  // All synthetic records remain in this disposable in-memory database. No provider/importer runs.
  c = await testDatabase(); state.db = c.db;
  const contexts = await getPublicContexts(); regular = contexts.find(v => v.competitionSlug === 'bullshooter-regulier')!; summer = contexts.find(v => v.competitionSlug === 'nsjl-zomer')!;
  [mike] = await c.db.select().from(s.players).where(eq(s.players.slug, 'mike-van-de-voort'));
  [tim] = await c.db.select().from(s.players).where(eq(s.players.slug, 'tim-goossens'));
  [config] = await c.db.select().from(s.sourceConfigs).where(eq(s.sourceConfigs.divisionId, regular.id));
});
afterAll(async () => { await c?.client.close(); });
afterEach(() => vi.unstubAllEnvs());

describe('Explicit public competition and membership context', () => {
  it('resolves competition, season, division and stable NSJL team identity', async () => {
    const data = await getStandData();
    expect(data.context?.id).toBe(regular.id);
    expect(data.context?.competitionId).toBe(regular.competitionId);
    expect(data.context?.seasonId).toBe(regular.seasonId);
    expect(data.context?.teamSeasonId).toBe(regular.teamSeasonId);
    expect(data.context?.teamId).toBe(regular.teamId);
    expect(data.contextState).toBe('ready');
  });
  it('a valid empty regular context has no stand, matches, next game, stats or false sync status', async () => {
    const [stand, matches, stats] = await Promise.all([getStandData(), getMatchesData(), getStatisticsData()]);
    expect(stand.standings).toHaveLength(0); expect(matches.matches).toHaveLength(0);
    expect(matches.next).toBeUndefined(); expect(stats.stats).toHaveLength(0);
    expect(stand.report).toBeUndefined(); expect(stand.lastSync).toBeUndefined();
  });
  it('preserves four profiles while excluding Tim from the actual regular roster and aliases', async () => {
    const data = await getTeamData();
    expect(data.profiles).toHaveLength(4);
    expect(data.teamProfiles.map(p => p.id)).not.toContain(tim.id);
    expect(await c.db.select().from(s.playerTeamSeasons).where(and(eq(s.playerTeamSeasons.playerId, tim.id), eq(s.playerTeamSeasons.teamSeasonId, regular.teamSeasonId!)))).toHaveLength(0);
    expect(await c.db.select().from(s.playerAliases).where(and(eq(s.playerAliases.playerId, tim.id), eq(s.playerAliases.teamSeasonId, regular.teamSeasonId!)))).toHaveLength(0);
  });
  it('does not default to the 20 summer records when the regular current season disappears', async () => {
    await c.db.update(s.seasons).set({isCurrent: false}).where(eq(s.seasons.id, regular.seasonId));
    try {
      const data = await getStandData(); expect(data.context).toBeNull(); expect(data.contextState).toBe('missing'); expect(data.standings).toHaveLength(0);
      expect((await getStandData(summer.id)).standings).toHaveLength(20);
    } finally { await c.db.update(s.seasons).set({isCurrent: true}).where(eq(s.seasons.id, regular.seasonId)); }
  });
  it('invalid IDs and ambiguous current NSJL divisions are empty states, not guessed contexts', async () => {
    const data = await getStandData('not-a-uuid'); expect(data.contextState).toBe('invalid'); expect(data.standings).toHaveLength(0);
    expect(selectPublicContext([regular, {...regular, id: crypto.randomUUID(), teamSeasonId: crypto.randomUUID()}])).toBeNull();
  });
  it('a regular division without a confirmed NSJL team remains an empty context without summer fallback', async () => {
    await c.db.update(s.teamSeasons).set({isPrimaryNsjl: false}).where(eq(s.teamSeasons.id, regular.teamSeasonId!));
    try {
      const data = await getHomeData();
      expect(data.context?.id).toBe(regular.id); expect(data.context?.teamSeasonId).toBeNull();
      expect(data.teamProfiles).toHaveLength(0); expect(data.matches).toHaveLength(0); expect(data.stats).toHaveLength(0); expect(data.nsjl).toBeUndefined();
    } finally { await c.db.update(s.teamSeasons).set({isPrimaryNsjl: true}).where(eq(s.teamSeasons.id, regular.teamSeasonId!)); }
  });
  it('current rosters exclude former and not-yet-joined members, retaining their profiles', async () => {
    const job = (await c.db.select().from(s.players).where(eq(s.players.slug, 'job-van-de-voort')))[0];
    await c.db.update(s.playerTeamSeasons).set({leftOn: '2000-01-01'}).where(and(eq(s.playerTeamSeasons.playerId, job.id), eq(s.playerTeamSeasons.teamSeasonId, regular.teamSeasonId!)));
    await c.db.update(s.playerTeamSeasons).set({joinedOn: '2999-01-01'}).where(and(eq(s.playerTeamSeasons.playerId, mike.id), eq(s.playerTeamSeasons.teamSeasonId, regular.teamSeasonId!)));
    try {
      const data = await getTeamData(); expect(data.teamProfiles.map(p => p.id)).not.toContain(job.id); expect(data.teamProfiles.map(p => p.id)).not.toContain(mike.id); expect(data.profiles).toHaveLength(4);
      expect((await getPlayerData(mike.slug)).teamProfiles).toHaveLength(0);
    } finally {
      await c.db.update(s.playerTeamSeasons).set({joinedOn: null, leftOn: null}).where(eq(s.playerTeamSeasons.teamSeasonId, regular.teamSeasonId!));
    }
  });
});

describe('Official statistics and source status, using synthetic database fixtures', () => {
  it('scopes the same person to their exact team, season and division', async () => {
    report = await makeReport(config.id);
    mikeStat = await makeStats(mike, regular.teamSeasonId!, regular.id, report.id, mike.displayName, '15.25');
    const [otherTeam] = await c.db.insert(s.teams).values({name: 'Saloon testteam', normalizedName: 'saloon testteam', slug: 'saloon-testteam'}).returning();
    const [saloon] = await c.db.insert(s.teamSeasons).values({teamId: otherTeam.id, divisionId: regular.id}).returning();
    await makeStats(tim, saloon.id, regular.id, report.id, tim.displayName, '99.99');
    const [oldSeason] = await c.db.insert(s.seasons).values({competitionId: regular.competitionId, name: '2025/2026', status: 'archived', isCurrent: false}).returning();
    const [oldDivision] = await c.db.insert(s.divisions).values({seasonId: oldSeason.id, name: 'Historische testdivisie', slug: 'historisch-test'}).returning();
    const [oldTeam] = await c.db.insert(s.teamSeasons).values({teamId: regular.teamId!, divisionId: oldDivision.id, isPrimaryNsjl: true}).returning();
    const [oldConfig] = await c.db.insert(s.sourceConfigs).values({divisionId: oldDivision.id, provider: 'bullshooter', resultsEntryUrl: config.resultsEntryUrl, scheduleEntryUrl: config.scheduleEntryUrl, expectedLeagueCode: 'TEST-OLD', expectedSourceDivision: 'A', enabled: false}).returning();
    const oldReport = await makeReport(oldConfig.id);
    await makeStats(mike, oldTeam.id, oldDivision.id, oldReport.id, mike.displayName, '22.22');
    const [otherDivision] = await c.db.insert(s.divisions).values({seasonId: regular.seasonId, name: 'Andere testdivisie', slug: 'andere-test'}).returning();
    const [divisionTeam] = await c.db.insert(s.teamSeasons).values({teamId: regular.teamId!, divisionId: otherDivision.id}).returning();
    const [divisionConfig] = await c.db.insert(s.sourceConfigs).values({divisionId: otherDivision.id, provider: 'bullshooter', resultsEntryUrl: config.resultsEntryUrl, scheduleEntryUrl: config.scheduleEntryUrl, expectedLeagueCode: 'TEST-OTHER', expectedSourceDivision: 'A', enabled: false}).returning();
    const divisionReport = await makeReport(divisionConfig.id);
    await makeStats(mike, divisionTeam.id, otherDivision.id, divisionReport.id, mike.displayName, '44.44');
    const data = await getStatisticsData(regular.id);
    expect(data.stats).toHaveLength(1); expect(data.stats[0].stats.x01Ppd).toBe('15.25');
    expect((await getPlayerData(mike.slug, oldDivision.id)).stats[0].stats.x01Ppd).toBe('22.22');
    expect((await getPlayerData(tim.slug, regular.id)).stats).toHaveLength(0);
    expect((await getPlayerData(tim.slug, regular.id)).teamProfiles).toHaveLength(0);
    expect((await getStatisticsData(summer.id)).stats).toHaveLength(0);
  });
  it('an accepted report without a completed successful run is not advertised as a successful sync', async () => {
    const data = await getStandData(regular.id); expect(data.report).toBeUndefined(); expect(data.lastSync).toBeUndefined();
    expect(renderToStaticMarkup(createElement(SourceStatus, {data}))).toContain('Nog geen geslaagde synchronisatie bevestigd');
  });
  it('shows an unmapped NSJL external player under their source identity, without linking a profile', async () => {
    await makeStats(null, regular.teamSeasonId!, regular.id, report.id, 'Unknown fixture player', '18.75');
    const data = await getStatisticsData(regular.id), row = data.stats.find(v => v.externalName === 'Unknown fixture player')!;
    expect(row.stats.playerId).toBeNull(); expect(row.slug).toBeNull(); expect(row.playerName).toBeNull();
  });
  it('requires a matching scoped player alias before attaching official figures to a profile', async () => {
    await c.db.delete(s.playerAliases).where(and(eq(s.playerAliases.playerId, mike.id), eq(s.playerAliases.teamSeasonId, regular.teamSeasonId!)));
    try {
      const data = await getStatisticsData(regular.id), row = data.stats.find(v => v.stats.id === mikeStat.id)!;
      expect(row.stats.playerId).toBeNull(); expect(row.slug).toBeNull();
      expect((await getPlayerData(mike.slug, regular.id)).stats).toHaveLength(0);
    } finally { await c.db.insert(s.playerAliases).values({playerId: mike.id, teamSeasonId: regular.teamSeasonId!, divisionId: regular.id, source: 'bullshooter', externalName: mike.displayName, normalizedName: mike.displayName.toLowerCase()}); }
  });
  it('requires explicit team membership even when an alias and external person link exist', async () => {
    const [membership] = await c.db.select().from(s.playerTeamSeasons).where(and(eq(s.playerTeamSeasons.playerId, mike.id), eq(s.playerTeamSeasons.teamSeasonId, regular.teamSeasonId!)));
    await c.db.delete(s.playerTeamSeasons).where(eq(s.playerTeamSeasons.id, membership.id));
    try {
      expect((await getPlayerData(mike.slug, regular.id)).stats).toHaveLength(0);
      const row = (await getStatisticsData(regular.id)).stats.find(v => v.stats.id === mikeStat.id)!;
      expect(row.stats.playerId).toBeNull(); expect(row.slug).toBeNull();
    } finally { await c.db.insert(s.playerTeamSeasons).values(membership); }
  });
  it('rejects a report from a different division even when the player/team references match', async () => {
    const [foreignReport] = await c.db.select().from(s.sourceReports).where(eq(s.sourceReports.sourceConfigId, (await c.db.select().from(s.sourceConfigs).where(eq(s.sourceConfigs.expectedLeagueCode, 'TEST-OTHER')))[0].id));
    await c.db.update(s.playerSeasonStats).set({sourceReportId: foreignReport.id}).where(eq(s.playerSeasonStats.id, mikeStat.id));
    try { expect((await getPlayerData(mike.slug, regular.id)).stats).toHaveLength(0); }
    finally { await c.db.update(s.playerSeasonStats).set({sourceReportId: report.id}).where(eq(s.playerSeasonStats.id, mikeStat.id)); }
  });
  it('keeps missing metrics as null and does not average or aggregate PPD/MPR', async () => {
    const row = (await getPlayerData(mike.slug, regular.id)).stats[0].stats;
    expect(row.x01Ppd).toBe('15.25'); expect(row.cricketMpr).toBe('1.75');
    expect(row.x01Wins).toBe(0); expect(row.cricketWins).toBeNull(); expect(row.x01Hats).toBeNull();
  });
  it('only accepted successful/warning runs can supply source status; newer failures cannot replace it', async () => {
    await c.db.insert(s.syncRuns).values({sourceConfigId: config.id, status: 'success', triggerType: 'isolated-test', resultReportId: report.id, finishedAt: new Date('2026-10-04T12:00:00Z')});
    await c.db.insert(s.syncRuns).values({sourceConfigId: config.id, status: 'failed', triggerType: 'isolated-test', resultReportId: report.id, finishedAt: new Date('2026-10-05T12:00:00Z')});
    const data = await getStandData(regular.id); expect(data.report?.id).toBe(report.id); expect(data.lastSync?.status).toBe('success'); expect(data.lastSync?.finishedAt?.toISOString()).toBe('2026-10-04T12:00:00.000Z');
    const html = renderToStaticMarkup(createElement(SourceStatus, {data}));
    expect(html).toContain('Gecontroleerd op 4 oktober 2026'); expect(html).not.toContain('5 oktober 2026');
  });
  it('NSJL highlighting uses the stable identity even after the display name changes', async () => {
    await c.db.insert(s.standings).values({teamSeasonId: regular.teamSeasonId!, position: 1, games: 20, wins: 12, losses: 8, winPercentage: '60.00', sourceReportId: report.id});
    await c.db.update(s.teams).set({name: 'NSJL gewijzigde testnaam'}).where(eq(s.teams.id, regular.teamId!));
    try {
      const data = await getStandData(regular.id); expect(data.standings).toHaveLength(1); expect(data.nsjl?.teamSeasonId).toBe(regular.teamSeasonId); expect(data.nsjl?.name).toBe('NSJL gewijzigde testnaam');
      expect((await getStandData(summer.id)).standings).toHaveLength(20);
    } finally { await c.db.update(s.teams).set({name: regular.teamName!}).where(eq(s.teams.id, regular.teamId!)); }
  });
});

describe('Match, news, media and settings binding', () => {
  it('scopes home/away matches and preserves unknown time and future scores', async () => {
    const [opponent] = await c.db.select().from(s.teamSeasons).where(eq(s.teamSeasons.teamId, (await c.db.select().from(s.teams).where(eq(s.teams.slug, 'saloon-testteam')))[0].id));
    [fixtureMatch] = await c.db.insert(s.matches).values({slug: 'public-fixture-game', divisionId: regular.id, roundKey: '3', importKey: 'fixture-3', source: 'bullshooter', weekNumber: 3, scheduledDate: '2999-10-08', homeTeamSeasonId: opponent.id, awayTeamSeasonId: regular.teamSeasonId!, scheduleReportId: null}).returning();
    const data = await getMatchesData(regular.id); expect(data.matches).toHaveLength(1); expect(data.matches[0].homeNsjl).toBe(false); expect(data.matches[0].awayNsjl).toBe(true); expect(data.next?.slug).toBe(fixtureMatch.slug); expect(data.matches[0].startTime).toBeNull(); expect(data.matches[0].homeScore).toBeNull();
    expect((await getMatchesData(summer.id)).matches).toHaveLength(0);
  });
  it('never translates a standing Games total or a future schedule into played team matches', async () => {
    const data = await getHomeData(regular.id);
    expect(data.nsjl?.games).toBe(20); expect(data.completedMatchCount).toBeNull();
    const html = renderToStaticMarkup(createElement(Hero, {data}));
    expect(html).toContain('Wedstrijden gespeeld</dt><dd>—</dd>');
  });
  it('uses constant-query slug lookup, independent of the number of contexts', async () => {
    const spy = vi.spyOn(c.client, 'query');
    try {
      const found = await findPublicMatch(fixtureMatch.slug);
      expect(found?.data.context?.id).toBe(regular.id); expect(found?.match.awayNsjl).toBe(true);
      expect(spy.mock.calls.length).toBeLessThanOrEqual(6);
      const text = spy.mock.calls.map(([query]) => String(query)).join(' ');
      expect(text).not.toContain('"news_posts"'); expect(text).not.toContain('"players"');
    } finally { spy.mockRestore(); }
  });
  it('sitemap includes published content and scoped matches across archived seasons', async () => {
    const historic = (await getPublicContexts()).find(ctx => ctx.season === '2025/2026')!;
    await c.db.insert(s.matches).values({slug: 'archived-fixture-game', divisionId: historic.id, roundKey: '1', importKey: 'archived-fixture-game', source: 'bullshooter', homeTeamSeasonId: historic.teamSeasonId!, status: 'completed', playedDate: '2025-10-01'});
    const data = await getSitemapData(); expect(data.profiles).toHaveLength(4); expect(data.news).toHaveLength(3);
    expect(data.matches.map(m => m.slug)).toEqual(expect.arrayContaining([fixtureMatch.slug, 'archived-fixture-game']));
    const found = await findPublicMatch('archived-fixture-game'); expect(found?.data.context?.id).toBe(historic.id);
    expect(renderToStaticMarkup(createElement(SourceStatus, {data: found!.data}))).toContain('Historische Bullshootergegevens');
  });
  it('news excludes drafts, archives, future publications and missing publication dates', async () => {
    for (const [slug, status, publishedAt] of [['draft-fixture', 'draft', new Date('2020-01-01')], ['archived-fixture', 'archived', new Date('2020-01-01')], ['future-fixture', 'published', new Date('2999-01-01')], ['undated-fixture', 'published', null]] as const) {
      await c.db.insert(s.newsPosts).values({slug, status, publishedAt, title: slug, excerpt: 'Isolated fixture', content: 'Isolated fixture', category: 'Team'});
      expect((await getNewsArticleData(slug)).news).toHaveLength(0);
    }
    expect((await getNewsData()).news).toHaveLength(3);
  });
  it('news overview reads no competition, player or sync data and omits article bodies', async () => {
    const spy = vi.spyOn(c.client, 'query');
    try {
      const data = await getNewsData(); expect(data.news[0].content).toBeUndefined();
      const text = spy.mock.calls.map(([query]) => String(query)).join(' ');
      for (const table of ['competitions', 'standings', 'matches', 'players', 'sync_runs', 'source_reports']) expect(text).not.toContain('"' + table + '"');
      expect(text).not.toContain('"content"');
      expect((await getNewsArticleData(data.news[0].slug)).news[0].content).toBeDefined();
    } finally { spy.mockRestore(); }
  });
  it('stand pages do not fetch profiles, news or media', async () => {
    const spy = vi.spyOn(c.client, 'query');
    try {
      await getStandData(regular.id);
      const text = spy.mock.calls.map(([query]) => String(query)).join(' ');
      for (const table of ['players', 'news_posts', 'media', 'events', 'sponsors']) expect(text).not.toContain('"' + table + '"');
    } finally { spy.mockRestore(); }
  });
  it('home uses existing public settings and does not expose unrelated settings', async () => {
    await c.db.update(s.siteSettings).set({valueText: 'Beheerbare bestaande hero-inhoud'}).where(eq(s.siteSettings.key, 'hero_subtitle'));
    await c.db.insert(s.siteSettings).values({key: 'internal_test_setting', valueText: 'Not public'});
    const settings = await getPublicSettings(); expect(settings.hero_subtitle).toBe('Beheerbare bestaande hero-inhoud'); expect(settings.contact_email).toBe('info@nsjl.nl'); expect(settings).not.toHaveProperty('internal_test_setting');
    expect((await getHomeData(regular.id)).settings).toEqual(settings);
  });
  it('missing, private, archived and wrongly bucketed photos resolve to the existing initials fallback', async () => {
    const [media] = await c.db.insert(s.media).values({filename: 'test.webp', storagePath: 'test.webp', bucket: 'private-media', mimeType: 'image/webp', size: 100, status: 'private'}).returning();
    await c.db.update(s.players).set({photoMediaId: media.id}).where(eq(s.players.id, mike.id));
    try {
      for (const update of [{status: 'private', bucket: 'private-media'}, {status: 'archived', bucket: 'private-media'}, {status: 'published', bucket: 'unrelated-private-bucket'}]) {
        await c.db.update(s.media).set(update).where(eq(s.media.id, media.id));
        const data = await getPlayerData(mike.slug, regular.id); expect(data.media).toHaveLength(0);
        expect(renderToStaticMarkup(createElement(PlayerAvatar, {profile: data.profiles[0], data}))).toContain('foto ontbreekt');
      }
    }
    finally { await c.db.update(s.players).set({photoMediaId: null}).where(eq(s.players.id, mike.id)); }
  });
  it('published derivatives use the public URL while their private original is retained', async () => {
    vi.stubEnv('APP_ENV', 'development'); vi.stubEnv('DATABASE_MODE', 'local'); vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'fixture-public-key');
    vi.stubEnv('MEDIA_PUBLIC_BUCKET', 'published-media'); vi.stubEnv('MEDIA_PRIVATE_BUCKET', 'private-media');
    const [media] = await c.db.insert(s.media).values({filename: 'published.webp', storagePath: 'uploads/published.webp', bucket: 'private-media', mimeType: 'image/webp', size: 100, status: 'published'}).returning();
    await c.db.update(s.players).set({photoMediaId: media.id}).where(eq(s.players.id, mike.id));
    try {
      const data = await getPlayerData(mike.slug, regular.id); expect(data.media).toHaveLength(1);
      expect(publicMediaUrl(data.media[0].storagePath)).toBe('https://example.supabase.co/storage/v1/object/public/published-media/uploads/published.webp');
    } finally { await c.db.update(s.players).set({photoMediaId: null}).where(eq(s.players.id, mike.id)); }
  });
  it('player metadata reads a profile without loading any competition or statistics', async () => {
    const spy = vi.spyOn(c.client, 'query');
    try {
      expect((await getPlayerProfile(tim.slug))?.id).toBe(tim.id);
      expect(spy.mock.calls.length).toBe(1);
      const text = spy.mock.calls.map(([query]) => String(query)).join(' ');
      for (const table of ['competitions', 'player_season_stats', 'source_reports', 'sync_runs', 'media', 'news_posts']) expect(text).not.toContain('"' + table + '"');
    } finally { spy.mockRestore(); }
  });
  it('database failures propagate as real errors instead of pretending the data is empty', async () => {
    state.failure = true;
    try {
      await expect(getStandData()).rejects.toThrow('TEST_DATABASE_UNAVAILABLE');
      await expect(getNewsData()).rejects.toThrow('TEST_DATABASE_UNAVAILABLE');
      await expect(getPlayerData(mike.slug)).rejects.toThrow('TEST_DATABASE_UNAVAILABLE');
    } finally { state.failure = false; }
  });
});
