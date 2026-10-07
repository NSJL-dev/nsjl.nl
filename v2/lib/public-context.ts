import 'server-only';
import {cache} from 'react';
import {and, asc, desc, eq} from 'drizzle-orm';
import {getDatabase} from '@/db/client';
import * as s from '@/db/schema';
import type {SiteData} from './queries';

export type PublicContext = SiteData['context'] & {
  competitionId: string; seasonId: string; source: string; seasonStatus: string;
  startsAt: string | null; endsAt: string | null;
  teamId: string | null; teamSeasonId: string | null; teamName: string | null;
};
export type ContextState = 'ready' | 'missing' | 'invalid' | 'ambiguous';

export const getPublicContexts = cache(async (): Promise<PublicContext[]> => {
  const rows = await (await getDatabase()).select({
    id: s.divisions.id, division: s.divisions.name, seasonId: s.seasons.id,
    season: s.seasons.name, isCurrent: s.seasons.isCurrent, seasonStatus: s.seasons.status,
    startsAt: s.seasons.startsAt, endsAt: s.seasons.endsAt,
    competitionId: s.competitions.id, competition: s.competitions.name,
    competitionSlug: s.competitions.slug, source: s.competitions.source,
    teamId: s.teams.id, teamName: s.teams.name, teamSeasonId: s.teamSeasons.id,
  }).from(s.divisions).innerJoin(s.seasons, eq(s.divisions.seasonId, s.seasons.id))
    .innerJoin(s.competitions, eq(s.seasons.competitionId, s.competitions.id))
    .leftJoin(s.teamSeasons, and(eq(s.teamSeasons.divisionId, s.divisions.id), eq(s.teamSeasons.isPrimaryNsjl, true)))
    .leftJoin(s.teams, and(eq(s.teams.id, s.teamSeasons.teamId), eq(s.teams.isNsjl, true)))
    .orderBy(asc(s.competitions.slug), desc(s.seasons.name), asc(s.divisions.name), asc(s.divisions.id));
  // A primary flag on a non-NSJL identity is not sufficient evidence.
  return rows.map(row => ({...row, teamSeasonId: row.teamId ? row.teamSeasonId : null}));
});

type SelectableContext = Pick<PublicContext, 'id' | 'competitionSlug' | 'isCurrent'> & Partial<Pick<PublicContext, 'seasonStatus' | 'teamSeasonId'>>;
export function selectPublicContext<T extends SelectableContext>(contexts: T[], requested?: string): T | null {
  if (requested) return contexts.find(c => c.id === requested) ?? null;
  const regular = contexts.filter(c => c.competitionSlug === 'bullshooter-regulier' && c.isCurrent && c.seasonStatus !== 'archived');
  const withTeam = regular.filter(c => c.teamSeasonId);
  // Never guess between several NSJL divisions, or fall back to summer.
  return withTeam.length === 1 ? withTeam[0] : withTeam.length > 1 ? null : regular.length === 1 ? regular[0] : null;
}

export const resolvePublicContext = cache(async (requested?: string) => {
  const contexts = await getPublicContexts(), context = selectPublicContext(contexts, requested);
  const candidates = contexts.filter(c => c.competitionSlug === 'bullshooter-regulier' && c.isCurrent && c.seasonStatus !== 'archived');
  const contextState: ContextState = context ? 'ready' : requested ? 'invalid' : candidates.length > 1 ? 'ambiguous' : 'missing';
  return {context, contexts, contextState};
});
