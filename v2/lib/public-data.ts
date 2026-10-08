import 'server-only';
import {cache} from 'react';
import {and, asc, desc, eq, exists, gte, inArray, isNotNull, isNull, lte, or, type SQL} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {getDatabase} from '@/db/client';
import * as s from '@/db/schema';
import {applyOverrides} from './overrides';
import {todayAmsterdam, type SiteData} from './queries';
import {resolvePublicContext, type ContextState, type PublicContext} from './public-context';
export {selectPublicContext, getPublicContexts} from './public-context';

export type PublicData = Omit<SiteData, 'context' | 'report' | 'lastSync' | 'latest' | 'news'> & {
  context: (SiteData['context'] & Partial<PublicContext>) | null;
  contextState?: ContextState;
  report: SiteData['report'] | undefined;
  lastSync: SiteData['lastSync'] | undefined;
  latest: SiteData['latest'] | undefined;
  news: (Omit<SiteData['news'][number], 'content'> & {content?: string})[];
  teamProfiles: SiteData['profiles'];
  completedMatchCount?: number | null;
};
function base(resolution?: Awaited<ReturnType<typeof resolvePublicContext>>): PublicData {
  return {context: resolution?.context ?? null, contexts: resolution?.contexts ?? [], contextState: resolution?.contextState ?? 'missing', profiles: [], teamProfiles: [], standings: [], matches: [], stats: [], news: [], media: [], settings: {}, events: [], sponsors: [], report: undefined, lastSync: undefined, next: undefined, latest: undefined, nsjl: undefined, completedMatchCount: null, today: todayAmsterdam()};
}

const publicNewsPredicate = () => and(eq(s.newsPosts.status, 'published'), isNotNull(s.newsPosts.publishedAt), lte(s.newsPosts.publishedAt, new Date()));
const newsColumns = {id: s.newsPosts.id, title: s.newsPosts.title, slug: s.newsPosts.slug, excerpt: s.newsPosts.excerpt, category: s.newsPosts.category, status: s.newsPosts.status, featuredMediaId: s.newsPosts.featuredMediaId, publishedAt: s.newsPosts.publishedAt, authorId: s.newsPosts.authorId, createdAt: s.newsPosts.createdAt, updatedAt: s.newsPosts.updatedAt};
const readNews = cache(async (limit?: number) => {
  const query = (await getDatabase()).select(newsColumns).from(s.newsPosts).where(publicNewsPredicate()).orderBy(desc(s.newsPosts.publishedAt), asc(s.newsPosts.id)).$dynamic();
  return limit ? query.limit(limit) : query;
});
const readProfiles = cache(async (slug?: string) => {
  const query = (await getDatabase()).select().from(s.players).where(and(eq(s.players.isActive, true), slug ? eq(s.players.slug, slug) : undefined)).orderBy(asc(s.players.sortOrder), asc(s.players.id)).$dynamic();
  return slug ? query.limit(1) : query;
});
export const getPlayerProfile = cache(async (slug: string) => (await readProfiles(slug))[0]);
export const getPublicSettings = cache(async () => Object.fromEntries((await (await getDatabase()).select({key: s.siteSettings.key, value: s.siteSettings.valueText}).from(s.siteSettings).where(inArray(s.siteSettings.key, ['hero_subtitle', 'contact_email', 'home_venue']))).map(v => [v.key, v.value])));
async function readMedia(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return [];
  // Public components use a status-checked route by media ID. Only records with
  // a controlled private original can be served by that route.
  return (await getDatabase()).select().from(s.media).where(and(inArray(s.media.id, unique), eq(s.media.status, 'published'), eq(s.media.bucket, process.env.MEDIA_PRIVATE_BUCKET || 'private-media'), eq(s.media.mimeType, 'image/webp')));
}

async function readOverrides(ids: {matches?: string[]; teams?: string[]; stats?: string[]}) {
  const conditions: SQL[] = [];
  if (ids.matches?.length) conditions.push(inArray(s.dataOverrides.matchId, ids.matches));
  if (ids.teams?.length) conditions.push(inArray(s.dataOverrides.teamSeasonId, ids.teams));
  if (ids.stats?.length) conditions.push(inArray(s.dataOverrides.playerStatId, ids.stats));
  if (!conditions.length) return [];
  return (await getDatabase()).select().from(s.dataOverrides).where(and(eq(s.dataOverrides.isActive, true), or(...conditions))).orderBy(asc(s.dataOverrides.createdAt), asc(s.dataOverrides.id));
}
function indexedOverrides(rows: Awaited<ReturnType<typeof readOverrides>>, key: 'matchId' | 'teamSeasonId' | 'playerStatId') {
  const result = new Map<string, typeof rows>();
  for (const row of rows) { const id = row[key]; if (id) { const values = result.get(id) ?? []; values.push(row); result.set(id, values); } }
  return result;
}
const readSource = cache(async (context: PublicContext | null) => {
  if (!context || context.source !== 'bullshooter') return {report: undefined, lastSync: undefined};
  const [row] = await (await getDatabase()).select({report: s.sourceReports, run: s.syncRuns}).from(s.syncRuns)
    .innerJoin(s.sourceConfigs, eq(s.syncRuns.sourceConfigId, s.sourceConfigs.id))
    .innerJoin(s.sourceReports, and(eq(s.sourceReports.id, s.syncRuns.resultReportId), eq(s.sourceReports.sourceConfigId, s.sourceConfigs.id)))
    .where(and(eq(s.sourceConfigs.divisionId, context.id), eq(s.sourceConfigs.provider, 'bullshooter'), inArray(s.syncRuns.status, ['success', 'warning']), isNotNull(s.syncRuns.finishedAt), eq(s.sourceReports.status, 'accepted'), eq(s.sourceReports.reportType, 'results')))
    .orderBy(desc(s.syncRuns.finishedAt), desc(s.syncRuns.startedAt), asc(s.syncRuns.id)).limit(1);
  return {report: row?.report, lastSync: row?.run};
});
async function acceptedReport(reportId: typeof s.standings.sourceReportId) {
  const db = await getDatabase();
  return (context: PublicContext) => exists(db.select({id: s.sourceReports.id}).from(s.sourceReports).innerJoin(s.sourceConfigs, eq(s.sourceReports.sourceConfigId, s.sourceConfigs.id)).where(and(eq(s.sourceReports.id, reportId), eq(s.sourceReports.status, 'accepted'), eq(s.sourceReports.reportType, 'results'), eq(s.sourceConfigs.divisionId, context.id), eq(s.sourceConfigs.provider, 'bullshooter'))));
}
const readStandings = cache(async (context: PublicContext | null, onlyNsjl = false) => {
  if (!context || (onlyNsjl && !context.teamSeasonId)) return [];
  const reportFilter = context.source === 'bullshooter' ? (await acceptedReport(s.standings.sourceReportId))(context) : undefined;
  const rows = await (await getDatabase()).select({id: s.standings.id, teamSeasonId: s.teamSeasons.id, teamId: s.teams.id, name: s.teams.name, position: s.standings.position, games: s.standings.games, wins: s.standings.wins, losses: s.standings.losses, winPercentage: s.standings.winPercentage}).from(s.standings)
    .innerJoin(s.teamSeasons, eq(s.standings.teamSeasonId, s.teamSeasons.id)).innerJoin(s.teams, eq(s.teamSeasons.teamId, s.teams.id))
    .where(and(eq(s.teamSeasons.divisionId, context.id), reportFilter, onlyNsjl && context.teamSeasonId ? eq(s.teamSeasons.id, context.teamSeasonId) : undefined)).orderBy(asc(s.standings.position), asc(s.teams.id));
  const overrides = indexedOverrides(await readOverrides({teams: rows.map(r => r.teamSeasonId)}), 'teamSeasonId');
  return rows.map(row => applyOverrides({...row, isNsjl: row.teamSeasonId === context.teamSeasonId && row.teamId === context.teamId}, overrides.get(row.teamSeasonId) ?? []));
});
function membershipDateFilter(context: PublicContext) {
  // Current rosters use an inclusive membership interval; archives use season overlap.
  if (context.isCurrent && context.seasonStatus !== 'archived') {
    const today = todayAmsterdam();
    return and(or(isNull(s.playerTeamSeasons.joinedOn), lte(s.playerTeamSeasons.joinedOn, today)), or(isNull(s.playerTeamSeasons.leftOn), gte(s.playerTeamSeasons.leftOn, today)));
  }
  return and(context.endsAt ? or(isNull(s.playerTeamSeasons.joinedOn), lte(s.playerTeamSeasons.joinedOn, context.endsAt)) : undefined, context.startsAt ? or(isNull(s.playerTeamSeasons.leftOn), gte(s.playerTeamSeasons.leftOn, context.startsAt)) : undefined);
}
const readRoster = cache(async (context: PublicContext | null) => {
  if (!context?.teamSeasonId) return [];
  return (await (await getDatabase()).select({profile: s.players}).from(s.playerTeamSeasons).innerJoin(s.players, eq(s.playerTeamSeasons.playerId, s.players.id)).where(and(eq(s.playerTeamSeasons.teamSeasonId, context.teamSeasonId), eq(s.players.isActive, true), membershipDateFilter(context))).orderBy(asc(s.players.sortOrder), asc(s.players.id))).map(row => row.profile);
});
const readStats = cache(async (context: PublicContext | null, playerId?: string) => {
  if (!context?.teamSeasonId || context.source !== 'bullshooter') return [];
  const db = await getDatabase();
  const membership = exists(db.select({id: s.playerTeamSeasons.id}).from(s.playerTeamSeasons).where(and(eq(s.playerTeamSeasons.playerId, s.players.id), eq(s.playerTeamSeasons.teamSeasonId, context.teamSeasonId))));
  const playerAlias = exists(db.select({id: s.playerAliases.id}).from(s.playerAliases).where(and(eq(s.playerAliases.playerId, s.players.id), eq(s.playerAliases.teamSeasonId, context.teamSeasonId), eq(s.playerAliases.divisionId, context.id), eq(s.playerAliases.source, s.externalPlayers.source), eq(s.playerAliases.normalizedName, s.externalPlayers.normalizedName))));
  const rows = await db.select({stats: s.playerSeasonStats, externalName: s.externalPlayers.externalName, linkedPlayerId: s.players.id, playerName: s.players.displayName, slug: s.players.slug}).from(s.playerSeasonStats)
    .innerJoin(s.externalPlayers, and(eq(s.playerSeasonStats.externalPlayerId, s.externalPlayers.id), eq(s.externalPlayers.teamSeasonId, context.teamSeasonId)))
    .innerJoin(s.sourceReports, eq(s.playerSeasonStats.sourceReportId, s.sourceReports.id)).innerJoin(s.sourceConfigs, eq(s.sourceReports.sourceConfigId, s.sourceConfigs.id))
    .leftJoin(s.players, and(eq(s.players.id, s.playerSeasonStats.playerId), eq(s.players.id, s.externalPlayers.playerId), eq(s.players.isActive, true), membership, playerAlias))
    .where(and(eq(s.playerSeasonStats.teamSeasonId, context.teamSeasonId), eq(s.externalPlayers.source, 'bullshooter'), eq(s.sourceConfigs.provider, 'bullshooter'), eq(s.sourceConfigs.divisionId, context.id), eq(s.sourceReports.reportType, 'results'), eq(s.sourceReports.status, 'accepted'), playerId ? eq(s.players.id, playerId) : undefined))
    .orderBy(desc(s.playerSeasonStats.x01Ppd), asc(s.externalPlayers.id));
  const overrides = indexedOverrides(await readOverrides({stats: rows.map(row => row.stats.id)}), 'playerStatId');
  return rows.map(row => ({externalName: row.externalName, playerName: row.playerName, slug: row.slug, stats: {...applyOverrides(row.stats, overrides.get(row.stats.id) ?? []), playerId: row.linkedPlayerId}}));
});
const hts = alias(s.teamSeasons, 'public_home_membership'), ats = alias(s.teamSeasons, 'public_away_membership');
const ht = alias(s.teams, 'public_home_team'), at = alias(s.teams, 'public_away_team');
const matchColumns = {id: s.matches.id, slug: s.matches.slug, scheduledDate: s.matches.scheduledDate, playedDate: s.matches.playedDate, startTime: s.matches.startTime, week: s.matches.weekNumber, home: s.matches.homeTeamSeasonId, away: s.matches.awayTeamSeasonId, homeName: ht.name, awayName: at.name, homeScore: s.matches.homeScore, awayScore: s.matches.awayScore, status: s.matches.status, venue: s.venues.name, notes: s.matches.notes};
const readMatches = cache(async (context: PublicContext | null, slug?: string) => {
  if (!context?.teamSeasonId) return [];
  const rows = await (await getDatabase()).select(matchColumns).from(s.matches)
    .leftJoin(hts, and(eq(s.matches.homeTeamSeasonId, hts.id), eq(hts.divisionId, context.id)))
    .leftJoin(ats, and(eq(s.matches.awayTeamSeasonId, ats.id), eq(ats.divisionId, context.id)))
    .leftJoin(ht, eq(hts.teamId, ht.id)).leftJoin(at, eq(ats.teamId, at.id)).leftJoin(s.venues, eq(s.matches.venueId, s.venues.id))
    .where(and(eq(s.matches.divisionId, context.id), or(eq(hts.id, context.teamSeasonId), eq(ats.id, context.teamSeasonId)), slug ? eq(s.matches.slug, slug) : undefined))
    .orderBy(asc(s.matches.scheduledDate), asc(s.matches.weekNumber), asc(s.matches.id));
  const overrides = indexedOverrides(await readOverrides({matches: rows.map(row => row.id)}), 'matchId');
  return rows.map(row => applyOverrides({...row, homeNsjl: row.home === context.teamSeasonId, awayNsjl: row.away === context.teamSeasonId}, overrides.get(row.id) ?? []));
});
function withMatches(data: PublicData, matches: PublicData['matches']) {
  const dated = matches.filter(m => ['scheduled', 'postponed'].includes(m.status) && m.scheduledDate && m.scheduledDate >= data.today).sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!));
  const completed = matches.filter(m => m.status === 'completed');
  // A schedule or the report's Games total cannot establish a count of played team matches.
  return {...data, matches, next: dated[0], latest: completed.sort((a, b) => (b.playedDate || b.scheduledDate || '').localeCompare(a.playedDate || a.scheduledDate || ''))[0], completedMatchCount: completed.length ? completed.length : null};
}

export const getStandData = cache(async (requested?: string): Promise<PublicData> => {
  const resolution = await resolvePublicContext(requested), [standings, source] = await Promise.all([readStandings(resolution.context), readSource(resolution.context)]);
  return {...base(resolution), standings, nsjl: standings.find(row => row.isNsjl), ...source};
});
export const getMatchesData = cache(async (requested?: string): Promise<PublicData> => {
  const resolution = await resolvePublicContext(requested), [matches, source] = await Promise.all([readMatches(resolution.context), readSource(resolution.context)]);
  return withMatches({...base(resolution), ...source}, matches);
});
export const getStatisticsData = cache(async (requested?: string): Promise<PublicData> => {
  const resolution = await resolvePublicContext(requested), [standings, stats, source] = await Promise.all([readStandings(resolution.context, true), readStats(resolution.context), readSource(resolution.context)]);
  return {...base(resolution), stats, nsjl: standings.find(row => row.isNsjl), ...source};
});
export const getTeamData = cache(async (requested?: string): Promise<PublicData> => {
  const resolution = await resolvePublicContext(requested), [profiles, teamProfiles, stats] = await Promise.all([readProfiles(), readRoster(resolution.context), readStats(resolution.context)]);
  return {...base(resolution), profiles, teamProfiles, stats, media: await readMedia(profiles.map(p => p.photoMediaId))};
});
export const getHomeData = cache(async (requested?: string): Promise<PublicData> => {
  const resolution = await resolvePublicContext(requested);
  const [standings, matches, teamProfiles, stats, news, settings, source] = await Promise.all([readStandings(resolution.context), readMatches(resolution.context), readRoster(resolution.context), readStats(resolution.context), readNews(3), getPublicSettings(), readSource(resolution.context)]);
  const media = await readMedia([...teamProfiles.map(p => p.photoMediaId), ...news.map(n => n.featuredMediaId)]);
  return withMatches({...base(resolution), standings, nsjl: standings.find(row => row.isNsjl), profiles: teamProfiles, teamProfiles, stats, news, settings, media, ...source}, matches);
});
export const getNewsData = cache(async (): Promise<PublicData> => {
  const news = await readNews();
  return {...base(), news, media: await readMedia(news.map(n => n.featuredMediaId))};
});

// Editorial sponsors do not need competition data, player data or sync history.
export const getSponsorsData = cache(async () => {
  const sponsors = await (await getDatabase()).select({
    id: s.sponsors.id, name: s.sponsors.name, description: s.sponsors.description,
    websiteUrl: s.sponsors.websiteUrl, logoMediaId: s.sponsors.logoMediaId, sortOrder: s.sponsors.sortOrder,
  }).from(s.sponsors).where(eq(s.sponsors.isActive, true)).orderBy(asc(s.sponsors.sortOrder), asc(s.sponsors.name), asc(s.sponsors.id));
  return {sponsors, media: await readMedia(sponsors.map(sponsor => sponsor.logoMediaId))};
});
export type PublicSponsorsData = Awaited<ReturnType<typeof getSponsorsData>>;
// Active agenda records are public in the existing model. Do not expose creator
// IDs, administration timestamps or unrelated competition/admin data.
export const getAgendaData = cache(async () => (await getDatabase()).select({
  id: s.events.id, title: s.events.title, description: s.events.description,
  startsAt: s.events.startsAt, endsAt: s.events.endsAt,
  location: s.events.location, eventType: s.events.eventType,
}).from(s.events).where(eq(s.events.isActive, true)).orderBy(asc(s.events.startsAt), asc(s.events.id)));

export const getNewsArticleData = cache(async (slug: string): Promise<PublicData> => {
  const news = await (await getDatabase()).select().from(s.newsPosts).where(and(publicNewsPredicate(), eq(s.newsPosts.slug, slug))).limit(1);
  return {...base(), news, media: await readMedia(news.map(n => n.featuredMediaId))};
});
export const getLegacyProfileStats = cache(async (playerId: string) => (await getDatabase()).select().from(s.legacyPlayerStats).where(eq(s.legacyPlayerStats.playerId, playerId)));
export const getPlayerData = cache(async (slug: string, requested?: string): Promise<PublicData> => {
  const [resolution, profiles] = await Promise.all([resolvePublicContext(requested), readProfiles(slug)]);
  const profile = profiles[0];
  if (!profile) return {...base(resolution), profiles};
  const [stats, media, membership, source] = await Promise.all([
    readStats(resolution.context, profile.id), readMedia([profile.photoMediaId]),
    resolution.context?.teamSeasonId ? (await getDatabase()).select({id: s.playerTeamSeasons.id}).from(s.playerTeamSeasons).where(and(eq(s.playerTeamSeasons.playerId, profile.id), eq(s.playerTeamSeasons.teamSeasonId, resolution.context.teamSeasonId), membershipDateFilter(resolution.context))).limit(1) : [],
    readSource(resolution.context),
  ]);
  return {...base(resolution), profiles, teamProfiles: membership.length ? profiles : [], stats, media, ...source};
});
export const findPublicMatch = cache(async (slug: string) => {
  const [identity] = await (await getDatabase()).select({divisionId: s.matches.divisionId}).from(s.matches).where(eq(s.matches.slug, slug)).limit(1);
  if (!identity) return null;
  const resolution = await resolvePublicContext(identity.divisionId);
  const [matches, source] = await Promise.all([readMatches(resolution.context, slug), readSource(resolution.context)]);
  return matches[0] ? {match: matches[0], data: {...base(resolution), ...source}} : null;
});
export const getSitemapData = cache(async () => {
  const db = await getDatabase(), primary = alias(s.teamSeasons, 'sitemap_primary');
  const [profiles, news, matches] = await Promise.all([
    db.select({slug: s.players.slug}).from(s.players).where(eq(s.players.isActive, true)),
    db.select({slug: s.newsPosts.slug}).from(s.newsPosts).where(publicNewsPredicate()),
    db.select({slug: s.matches.slug}).from(s.matches).innerJoin(primary, and(eq(primary.divisionId, s.matches.divisionId), eq(primary.isPrimaryNsjl, true), or(eq(primary.id, s.matches.homeTeamSeasonId), eq(primary.id, s.matches.awayTeamSeasonId)))).innerJoin(s.teams, and(eq(s.teams.id, primary.teamId), eq(s.teams.isNsjl, true))),
  ]);
  return {profiles, news, matches};
});
