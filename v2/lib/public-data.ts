import 'server-only';
import {cache} from 'react';
import {and, asc, desc, eq, lte} from 'drizzle-orm';
import {getDatabase} from '@/db/client';
import * as s from '@/db/schema';
import {getContexts, getSiteData, todayAmsterdam, type SiteData} from './queries';

export type PublicData = Omit<SiteData, 'context' | 'report' | 'lastSync' | 'latest'> & {
  context: SiteData['context'] | null;
  report: SiteData['report'] | undefined;
  lastSync: SiteData['lastSync'] | undefined;
  latest: SiteData['latest'] | undefined;
  teamProfiles: SiteData['profiles'];
};

// Public rendering must not silently substitute summer data for a regular season.
export function selectPublicContext(contexts: SiteData['contexts'], requested?: string) {
  return (requested ? contexts.find(c => c.id === requested) : contexts.find(c => c.competitionSlug === 'bullshooter-regulier' && c.isCurrent)) ?? null;
}

export const getPublicData = cache(async (requested?: string): Promise<PublicData> => {
  const db = await getDatabase(), contexts = await getContexts();
  const context = selectPublicContext(contexts, requested);
  if (context) {
    const data = await getSiteData(context.id);
    const memberships = await db.select({playerId: s.playerTeamSeasons.playerId})
      .from(s.playerTeamSeasons).innerJoin(s.teamSeasons, eq(s.playerTeamSeasons.teamSeasonId, s.teamSeasons.id))
      .where(and(eq(s.teamSeasons.divisionId, context.id), eq(s.teamSeasons.isPrimaryNsjl, true)));
    const ids = new Set(memberships.map(m => m.playerId));
    return {...data, teamProfiles: data.profiles.filter(p => ids.has(p.id))};
  }
  // Content remains accessible even if there are no seeded competition contexts.
  const [profiles, news, media, settings] = await Promise.all([
    db.select().from(s.players).where(eq(s.players.isActive, true)).orderBy(asc(s.players.sortOrder)),
    db.select().from(s.newsPosts).where(and(eq(s.newsPosts.status, 'published'), lte(s.newsPosts.publishedAt, new Date()))).orderBy(desc(s.newsPosts.publishedAt)),
    db.select().from(s.media).where(eq(s.media.status, 'published')),
    db.select().from(s.siteSettings),
  ]);
  return {context: null, contexts, profiles, teamProfiles: [], news, media, settings: Object.fromEntries(settings.map(v => [v.key, v.valueText])), standings: [], matches: [], stats: [], events: [], sponsors: [], report: undefined, lastSync: undefined, next: undefined, latest: undefined, nsjl: undefined, today: todayAmsterdam()};
});

export const getLegacyProfileStats = cache(async (playerId: string) =>
  (await getDatabase()).select().from(s.legacyPlayerStats).where(eq(s.legacyPlayerStats.playerId, playerId)));

export const findPublicMatch = cache(async (slug: string) => {
  for (const context of await getContexts()) {
    const data = await getPublicData(context.id), match = data.matches.find(m => m.slug === slug);
    if (match) return {data, match};
  }
  return null;
});
