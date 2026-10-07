import 'server-only';
import {and,eq,desc,asc,or,lte,sql} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {getDatabase} from '@/db/client';
import * as s from '@/db/schema';
import {applyOverrides} from './overrides';

export function todayAmsterdam(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-');}
export async function getContexts(){
  return (await getDatabase()).select({id:s.divisions.id,division:s.divisions.name,season:s.seasons.name,competition:s.competitions.name,competitionSlug:s.competitions.slug,isCurrent:s.seasons.isCurrent}).from(s.divisions).innerJoin(s.seasons,eq(s.divisions.seasonId,s.seasons.id)).innerJoin(s.competitions,eq(s.seasons.competitionId,s.competitions.id)).orderBy(asc(s.competitions.slug),desc(s.seasons.name));
}
export async function getSiteData(contextId?:string){
  const db=await getDatabase(),contexts=await getContexts();const context=contexts.find(c=>c.id===contextId)||contexts.find(c=>c.competitionSlug==='bullshooter-regulier'&&c.isCurrent)||contexts[0];
  if(!context)throw new Error('Geen competitiecontext beschikbaar voor beheer.');
  const hts=alias(s.teamSeasons,'home_membership'),ats=alias(s.teamSeasons,'away_membership'),ht=alias(s.teams,'home_team'),at=alias(s.teams,'away_team');
  const [standingRows,matchRows,profiles,statRows,news,events,sponsors,settings,reports,runs,overrides,publishedMedia]=await Promise.all([
    db.select({id:s.standings.id,teamSeasonId:s.teamSeasons.id,name:s.teams.name,isNsjl:s.teamSeasons.isPrimaryNsjl,position:s.standings.position,games:s.standings.games,wins:s.standings.wins,losses:s.standings.losses,winPercentage:s.standings.winPercentage}).from(s.standings).innerJoin(s.teamSeasons,eq(s.standings.teamSeasonId,s.teamSeasons.id)).innerJoin(s.teams,eq(s.teamSeasons.teamId,s.teams.id)).where(eq(s.teamSeasons.divisionId,context.id)).orderBy(asc(s.standings.position)),
    db.select({id:s.matches.id,slug:s.matches.slug,scheduledDate:s.matches.scheduledDate,playedDate:s.matches.playedDate,startTime:s.matches.startTime,week:s.matches.weekNumber,home:s.matches.homeTeamSeasonId,away:s.matches.awayTeamSeasonId,homeName:ht.name,awayName:at.name,homeNsjl:hts.isPrimaryNsjl,awayNsjl:ats.isPrimaryNsjl,homeScore:s.matches.homeScore,awayScore:s.matches.awayScore,status:s.matches.status,venue:s.venues.name,notes:s.matches.notes}).from(s.matches).leftJoin(hts,eq(s.matches.homeTeamSeasonId,hts.id)).leftJoin(ats,eq(s.matches.awayTeamSeasonId,ats.id)).leftJoin(ht,eq(hts.teamId,ht.id)).leftJoin(at,eq(ats.teamId,at.id)).leftJoin(s.venues,eq(s.matches.venueId,s.venues.id)).where(and(eq(s.matches.divisionId,context.id),or(eq(hts.isPrimaryNsjl,true),eq(ats.isPrimaryNsjl,true)))).orderBy(asc(s.matches.scheduledDate)),
    db.select().from(s.players).where(eq(s.players.isActive,true)).orderBy(asc(s.players.sortOrder)),
    db.select({stats:s.playerSeasonStats,externalName:s.externalPlayers.externalName,playerName:s.players.displayName,slug:s.players.slug}).from(s.playerSeasonStats).innerJoin(s.teamSeasons,eq(s.playerSeasonStats.teamSeasonId,s.teamSeasons.id)).innerJoin(s.externalPlayers,eq(s.playerSeasonStats.externalPlayerId,s.externalPlayers.id)).leftJoin(s.players,eq(s.playerSeasonStats.playerId,s.players.id)).where(and(eq(s.teamSeasons.divisionId,context.id),eq(s.teamSeasons.isPrimaryNsjl,true))).orderBy(desc(s.playerSeasonStats.x01Ppd)),
    db.select().from(s.newsPosts).where(and(eq(s.newsPosts.status,'published'),lte(s.newsPosts.publishedAt,new Date()))).orderBy(desc(s.newsPosts.publishedAt)),
    db.select().from(s.events).where(eq(s.events.isActive,true)).orderBy(asc(s.events.startsAt)),
    db.select().from(s.sponsors).where(eq(s.sponsors.isActive,true)).orderBy(asc(s.sponsors.sortOrder)),
    db.select().from(s.siteSettings),
    db.select({report:s.sourceReports}).from(s.sourceReports).innerJoin(s.sourceConfigs,eq(s.sourceReports.sourceConfigId,s.sourceConfigs.id)).where(and(eq(s.sourceConfigs.divisionId,context.id),eq(s.sourceReports.reportType,'results'))).orderBy(desc(s.sourceReports.reportDatetimeLocal)).limit(1),
    db.select().from(s.syncRuns).innerJoin(s.sourceConfigs,eq(s.syncRuns.sourceConfigId,s.sourceConfigs.id)).where(and(eq(s.sourceConfigs.divisionId,context.id),sql`${s.syncRuns.resultReportId} is not null`)).orderBy(desc(s.syncRuns.finishedAt)).limit(1),
    db.select().from(s.dataOverrides).where(eq(s.dataOverrides.isActive,true)),
    db.select().from(s.media).where(eq(s.media.status,'published')),
  ]);
  const standings=standingRows.map(row=>applyOverrides(row,overrides.filter(o=>o.teamSeasonId===row.teamSeasonId)));
  const matches=matchRows.map(row=>applyOverrides(row,overrides.filter(o=>o.matchId===row.id)));
  const stats=statRows.map(row=>({...row,stats:applyOverrides(row.stats,overrides.filter(o=>o.playerStatId===row.stats.id))}));
  const today=todayAmsterdam();const next=matches.find(m=>['scheduled','postponed'].includes(m.status)&&m.scheduledDate&&m.scheduledDate>=today);
  const latest=matches.filter(m=>m.status==='completed').sort((a,b)=>(b.playedDate||'').localeCompare(a.playedDate||''))[0];
  return {media:publishedMedia,context,contexts,standings,matches,profiles,stats,news,events,sponsors,settings:Object.fromEntries(settings.map(v=>[v.key,v.valueText])),report:reports[0]?.report,lastSync:runs[0]?.sync_runs,next,latest,nsjl:standings.find(t=>t.isNsjl),today};
}
export type SiteData=Awaited<ReturnType<typeof getSiteData>>;
export async function getAdminData(){
  const db=await getDatabase();const [site,runs,configs,unmapped,aliases,legacy,media,posts,events,sponsors,settings,allPlayers,allUsers]=await Promise.all([
    getSiteData(),db.select().from(s.syncRuns).orderBy(desc(s.syncRuns.startedAt)).limit(40),db.select().from(s.sourceConfigs),
    db.select({external:s.externalPlayers,team:s.teams.name,division:s.divisions.name}).from(s.externalPlayers).innerJoin(s.teamSeasons,eq(s.externalPlayers.teamSeasonId,s.teamSeasons.id)).innerJoin(s.teams,eq(s.teamSeasons.teamId,s.teams.id)).innerJoin(s.divisions,eq(s.teamSeasons.divisionId,s.divisions.id)).where(sql`${s.externalPlayers.playerId} is null`).orderBy(asc(s.teams.name)),
    db.select().from(s.playerAliases),db.select({stats:s.legacyPlayerStats,name:s.players.displayName}).from(s.legacyPlayerStats).innerJoin(s.players,eq(s.legacyPlayerStats.playerId,s.players.id)),
    db.select().from(s.media),db.select().from(s.newsPosts).orderBy(desc(s.newsPosts.createdAt)),db.select().from(s.events),db.select().from(s.sponsors),db.select().from(s.siteSettings),db.select().from(s.players),db.select().from(s.users),
  ]);
  return {site,runs,configs,unmapped,aliases,legacy,media,posts,events,sponsors,settings,allPlayers,allUsers};
}
