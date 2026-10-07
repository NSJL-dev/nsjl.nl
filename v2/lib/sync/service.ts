import 'server-only';
import { and, eq, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '@/db/client';
import * as s from '@/db/schema';
import { parseResults, parseSchedule, normalizeName, NSJL_NAME, PARSER_VERSION } from '@/lib/bullshooter/parser';
import { pairingKey, validateBundle } from '@/lib/bullshooter/validation';
import { SourceError, type SourceBundle, type PlayerStatRow } from '@/lib/bullshooter/types';
import type { CompetitionDataProvider } from '@/lib/bullshooter/provider';

export type SyncOutcome={runId:string;status:'success'|'warning'|'failed';created:number;updated:number;skipped:number;warnings:string[];errorCode?:string;message:string};
export function slugify(value:string){return normalizeName(value).normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
export function scopedPlayerAlias(aliases:{normalizedName:string;teamSeasonId:string;playerId:string}[],name:string,teamSeasonId:string){return aliases.find(a=>a.teamSeasonId===teamSeasonId&&a.normalizedName===normalizeName(name))?.playerId??null;}
type StatsInsert=typeof s.playerSeasonStats.$inferInsert;
export function metricsToColumns(x01:PlayerStatRow|undefined,cricket:PlayerStatRow|undefined):Partial<StatsInsert>{
  const output:Record<string,string|number|null>={};
  const xMap:Record<string,string>={PPD:'x01Ppd',Games:'x01Games',Wins:'x01Wins',Hats:'x01Hats','3BD':'x013bd',Ton80:'x01Ton80',HTon:'x01Hton',LTon:'x01Lton'};
  for(let n=6;n<=15;n++)xMap[`${n}DO`]=`x01${n}do`;
  const cMap:Record<string,string>={MPR:'cricketMpr',Games:'cricketGames',Wins:'cricketWins',Assists:'cricketAssists',Hats:'cricketHats',WHorse:'cricketWhorse'};
  for(let n=5;n<=9;n++)cMap[`${n}MR`]=`cricket${n}mr`;
  for(const [row,map]of [[x01,xMap],[cricket,cMap]]as const)for(const [key,col]of Object.entries(map)){
    const value=row?.metrics[key]??null;output[col]=value!==null&&['PPD','MPR'].includes(key)?value.toFixed(2):value;
  }
  return output;
}
type Options={actorUserId?:string;trigger:'manual'|'cron'|'audit-seed';cooldownMs?:number;invalidate?:()=>Promise<void>};

export async function synchronize(db:Database,sourceConfigId:string,provider:CompetitionDataProvider,options:Options):Promise<SyncOutcome>{
  const now=new Date(),runId=randomUUID();
  const context=await db.select({config:s.sourceConfigs,seasonName:s.seasons.name}).from(s.sourceConfigs).innerJoin(s.divisions,eq(s.sourceConfigs.divisionId,s.divisions.id)).innerJoin(s.seasons,eq(s.divisions.seasonId,s.seasons.id)).where(eq(s.sourceConfigs.id,sourceConfigId));
  if(!context[0])throw new SourceError('SOURCE_NOT_CONFIGURED','Competitiebron niet geconfigureerd');
  const {config,seasonName}=context[0];
  if(options.trigger==='cron'&&!config.enabled)throw new SourceError('SYNC_DISABLED','Automatische synchronisatie uitgeschakeld');
  await db.insert(s.syncRuns).values({id:runId,sourceConfigId,triggerType:options.trigger,actorUserId:options.actorUserId??null});
  const acquired=await db.insert(s.syncLocks).values({sourceConfigId,ownerRunId:runId,leaseUntil:new Date(now.valueOf()+180000)}).onConflictDoUpdate({target:s.syncLocks.sourceConfigId,set:{ownerRunId:runId,leaseUntil:new Date(now.valueOf()+180000)},setWhere:sql`${s.syncLocks.leaseUntil}<now()`}).returning();
  if(!acquired.length){
    await db.update(s.syncRuns).set({status:'warning',finishedAt:new Date(),errorCode:'SYNC_BUSY',errorMessage:'Andere synchronisatie is bezig'}).where(eq(s.syncRuns.id,runId));
    return {runId,status:'warning',created:0,updated:0,skipped:0,warnings:['Andere synchronisatie is bezig'],errorCode:'SYNC_BUSY',message:'Synchronisatie is al bezig.'};
  }
  try{
    const [previousRun]=await db.select().from(s.syncRuns).where(and(eq(s.syncRuns.sourceConfigId,sourceConfigId),sql`${s.syncRuns.resultReportId} is not null`)).orderBy(desc(s.syncRuns.finishedAt)).limit(1);
    if(previousRun?.finishedAt&&now.valueOf()-previousRun.finishedAt.valueOf()<(options.cooldownMs??600000))throw new SourceError('SYNC_COOLDOWN','Bron onlangs gecontroleerd; probeer later opnieuw');
    const bundle=await provider.fetchBundle();
    const result=await applyBundle(db,config,seasonName,bundle,runId);
    let invalidationWarning:string|undefined;
    try{await options.invalidate?.();}catch{invalidationWarning='Import geslaagd; cachevernieuwing mislukt; dynamische pagina’s lezen de nieuwe gegevens rechtstreeks.';}
    const warnings=[...result.warnings,...(invalidationWarning?[invalidationWarning]:[])];
    const status=warnings.some(w=>w.includes('Ongekoppeld')||w.includes('cachevernieuwing'))?'warning':'success';
    await db.update(s.syncRuns).set({status,finishedAt:new Date(),resultReportId:result.resultsId,scheduleReportId:result.scheduleId,recordsFound:result.found,recordsCreated:result.created,recordsUpdated:result.updated,recordsSkipped:result.skipped,errorMessage:warnings.join('\n')||null}).where(eq(s.syncRuns.id,runId));
    return {runId,status,created:result.created,updated:result.updated,skipped:result.skipped,warnings,message:result.created+result.updated===0?'Geen nieuwe gegevens gevonden.':'Competitiegegevens bijgewerkt.'};
  }catch(error){
    const code=error instanceof SourceError?error.code:'SYNC_FAILED';
    const message=error instanceof SourceError?error.message:'Synchronisatie mislukt. De laatste geldige gegevens zijn behouden.';
    await db.update(s.syncRuns).set({status:code==='SYNC_COOLDOWN'?'warning':'failed',finishedAt:new Date(),errorCode:code,errorMessage:message}).where(eq(s.syncRuns.id,runId));
    return {runId,status:code==='SYNC_COOLDOWN'?'warning':'failed',created:0,updated:0,skipped:0,warnings:[],errorCode:code,message};
  }finally{await db.delete(s.syncLocks).where(and(eq(s.syncLocks.sourceConfigId,sourceConfigId),eq(s.syncLocks.ownerRunId,runId)));}
}

async function applyBundle(db:Database,config:typeof s.sourceConfigs.$inferSelect,seasonName:string,bundle:SourceBundle,runId:string){
  const results=parseResults(bundle.results.html),schedule=parseSchedule(bundle.schedule.html);
  const [previous]=await db.select().from(s.sourceReports).where(and(eq(s.sourceReports.sourceConfigId,config.id),eq(s.sourceReports.reportType,'results'))).orderBy(desc(s.sourceReports.reportDatetimeLocal)).limit(1);
  const [previousSchedule]=await db.select().from(s.sourceReports).where(and(eq(s.sourceReports.sourceConfigId,config.id),eq(s.sourceReports.reportType,'schedule'))).orderBy(desc(s.sourceReports.reportDatetimeLocal)).limit(1);
  const previousStandings=await db.select({id:s.standings.id}).from(s.standings).innerJoin(s.teamSeasons,eq(s.standings.teamSeasonId,s.teamSeasons.id)).where(eq(s.teamSeasons.divisionId,config.divisionId));
  const validation=validateBundle(results,schedule,{leagueCode:config.expectedLeagueCode,seasonName,division:config.expectedSourceDivision,previousReportDate:previous?.reportDatetimeLocal.toISOString().slice(0,19),previousTeamCount:previousStandings.length,previousScheduleDate:previousSchedule?.reportDatetimeLocal.toISOString().slice(0,19)});
  return db.transaction(async tx=>{
    const [lease]=await tx.select().from(s.syncLocks).where(and(eq(s.syncLocks.sourceConfigId,config.id),eq(s.syncLocks.ownerRunId,runId)));
    if(!lease||lease.leaseUntil.valueOf()<Date.now())throw new SourceError('LOCK_EXPIRED','Synchronisatielease verlopen');
    let created=0,updated=0,skipped=0;const warnings=[...validation.warnings];
    async function sourceReport(kind:'results'|'schedule'){
      const fetched=bundle[kind],meta=kind==='results'?results.meta:schedule.meta;
      const existing=await tx.select().from(s.sourceReports).where(and(eq(s.sourceReports.sourceConfigId,config.id),eq(s.sourceReports.reportType,kind),eq(s.sourceReports.sha256,fetched.sha256)));
      if(existing[0])return {record:existing[0],unchanged:existing[0].parserVersion===PARSER_VERSION};
      const [record]=await tx.insert(s.sourceReports).values({sourceConfigId:config.id,reportType:kind,discoveredUrl:fetched.url,reportDatetimeLocal:new Date(`${meta.reportDateLocal}Z`),sha256:fetched.sha256,parserVersion:PARSER_VERSION}).returning();created++;
      return {record,unchanged:false};
    }
    const rr=await sourceReport('results'),sr=await sourceReport('schedule');
    if(rr.unchanged&&sr.unchanged)return {created:0,updated:0,skipped:results.standings.length+results.results.length+results.x01.length+results.cricket.length+schedule.matches.length,warnings:[],found:results.standings.length+schedule.matches.length,resultsId:rr.record.id,scheduleId:sr.record.id};
    const [division]=await tx.select().from(s.divisions).where(eq(s.divisions.id,config.divisionId));
    const [season]=await tx.select().from(s.seasons).where(eq(s.seasons.id,division.seasonId));
    const teamMap=new Map<string,string>();
    const aliases=await tx.select().from(s.teamAliases).where(and(eq(s.teamAliases.divisionId,config.divisionId),eq(s.teamAliases.source,'bullshooter')));
    for(const a of aliases)teamMap.set(a.normalizedName,a.teamSeasonId);
    const venues=new Map<string,string>();
    for(const a of await tx.select().from(s.venueAliases).where(and(eq(s.venueAliases.competitionId,season.competitionId),eq(s.venueAliases.source,'bullshooter'))))venues.set(a.normalizedName,a.venueId);
    async function venue(name:string|null){
      if(!name)return null;const normalized=normalizeName(name);if(venues.has(normalized))return venues.get(normalized)!;
      const [v]=await tx.insert(s.venues).values({name}).returning();await tx.insert(s.venueAliases).values({competitionId:season.competitionId,source:'bullshooter',externalName:name,normalizedName:normalized,venueId:v.id});venues.set(normalized,v.id);created++;return v.id;
    }
    for(const name of schedule.teams){
      const normalized=normalizeName(name);if(teamMap.has(normalized))continue;
      const slug=`${slugify(name)}-${slugify(config.expectedLeagueCode)}`;
      let [team]=await tx.select().from(s.teams).where(eq(s.teams.slug,slug));
      if(!team){[team]=await tx.insert(s.teams).values({name,normalizedName:normalized,slug,isNsjl:normalized===normalizeName(NSJL_NAME)}).returning();created++;}
      const [ts]=await tx.insert(s.teamSeasons).values({teamId:team.id,divisionId:config.divisionId,isPrimaryNsjl:normalized===normalizeName(NSJL_NAME)}).onConflictDoUpdate({target:[s.teamSeasons.teamId,s.teamSeasons.divisionId],set:{updatedAt:new Date()}}).returning();
      await tx.insert(s.teamAliases).values({divisionId:config.divisionId,teamSeasonId:ts.id,source:'bullshooter',externalName:name,normalizedName:normalized});teamMap.set(normalized,ts.id);created++;
    }
    const matchMap=new Map<string,typeof s.matches.$inferSelect>();
    for(const m of await tx.select().from(s.matches).where(eq(s.matches.divisionId,config.divisionId)))matchMap.set(m.importKey,m);
    // Reconcile all known pairings even when a source group is unchanged: identity never includes date.
    for(const row of schedule.matches){
      const key=pairingKey(row.week,row.home,row.away),home=teamMap.get(normalizeName(row.home))!,away=teamMap.get(normalizeName(row.away))!;
      const existing=matchMap.get(key);const venueId=await venue(row.venue);
      const homeSchedule=await tx.select().from(s.teamSeasons).where(eq(s.teamSeasons.id,home));
      if(!homeSchedule[0].venueId&&venueId)await tx.update(s.teamSeasons).set({venueId}).where(eq(s.teamSeasons.id,home));
      if(existing&&!sr.unchanged){
        const moved=existing.scheduledDate!==row.date;
        const [m]=await tx.update(s.matches).set({scheduledDate:row.date,startTime:row.startTime,venueId,notes:row.notes,scheduleReportId:sr.record.id,status:moved&&existing.status!=='completed'?'postponed':existing.status,updatedAt:new Date(),syncedAt:new Date()}).where(eq(s.matches.id,existing.id)).returning();matchMap.set(key,m);updated++;
      }else if(!existing){
        const [m]=await tx.insert(s.matches).values({slug:`${slugify(config.expectedLeagueCode)}-week-${row.week}-${slugify(row.home)}-${slugify(row.away)}`,divisionId:config.divisionId,weekNumber:row.week,roundKey:String(row.week),importKey:key,scheduledDate:row.date,startTime:row.startTime,homeTeamSeasonId:home,awayTeamSeasonId:away,venueId,notes:row.notes,source:'bullshooter',scheduleReportId:sr.record.id}).returning();matchMap.set(key,m);created++;
      }else skipped++;
    }
    if(!rr.unchanged){
      for(const row of results.standings){
        const teamSeasonId=teamMap.get(normalizeName(row.team))!;
        const {team:_team,...values}=row;const fields={...values,winPercentage:row.winPercentage.toFixed(2),teamSeasonId,sourceReportId:rr.record.id,syncedAt:new Date()};
        const [existing]=await tx.select().from(s.standings).where(eq(s.standings.teamSeasonId,teamSeasonId));
        await tx.insert(s.standings).values(fields).onConflictDoUpdate({target:s.standings.teamSeasonId,set:{...fields,updatedAt:new Date()}});if(existing)updated++;else created++;
        await tx.insert(s.standingsHistory).values(fields).onConflictDoNothing();
      }
      for(const [key,sides]of validation.resultGroups){
        const match=matchMap.get(key)!;
        const homeName=schedule.matches.find(m=>pairingKey(m.week,m.home,m.away)===key)!.home;
        const homeSide=sides.find(r=>normalizeName(r.team)===normalizeName(homeName));const first=sides[0];
        const homeScore=homeSide?.wins??first.losses,awayScore=homeSide?.losses??first.wins;
        await tx.update(s.matches).set({homeScore,awayScore,playedDate:first.date,status:'completed',resultReportId:rr.record.id,syncedAt:new Date(),updatedAt:new Date()}).where(eq(s.matches.id,match.id));updated++;
        for(const side of sides){const fields={matchId:match.id,teamSeasonId:teamMap.get(normalizeName(side.team))!,games:side.games,wins:side.wins,losses:side.losses,forfeits:side.forfeits,sourceReportId:rr.record.id};await tx.insert(s.matchResultSides).values(fields).onConflictDoUpdate({target:[s.matchResultSides.matchId,s.matchResultSides.teamSeasonId],set:fields});}
      }
      const playerAliases=await tx.select().from(s.playerAliases).where(and(eq(s.playerAliases.divisionId,config.divisionId),eq(s.playerAliases.source,'bullshooter')));
      const persons=new Map<string,{x01?:PlayerStatRow;cricket?:PlayerStatRow}>();
      for(const [game,rows]of [['x01',results.x01],['cricket',results.cricket]]as const)for(const row of rows){
        const key=`${normalizeName(row.team)}|${normalizeName(row.player)}`;const p=persons.get(key)||{};if(p[game])throw new SourceError('DUPLICATE_PLAYER','Dubbele bronpersoonstatistieken');p[game]=row;persons.set(key,p);
      }
      for(const person of persons.values()){
        const row=person.x01??person.cricket!,teamSeasonId=teamMap.get(normalizeName(row.team))!;
        const playerId=scopedPlayerAlias(playerAliases,row.player,teamSeasonId);
        const [membership]=playerId?await tx.select().from(s.playerTeamSeasons).where(and(eq(s.playerTeamSeasons.playerId,playerId),eq(s.playerTeamSeasons.teamSeasonId,teamSeasonId))):[];
        if(playerId&&!membership)throw new SourceError('MAPPING_REVIEW_REQUIRED','Alias heeft geen expliciet teamlidmaatschap');
        const [existing]=await tx.select().from(s.externalPlayers).where(and(eq(s.externalPlayers.source,'bullshooter'),eq(s.externalPlayers.teamSeasonId,teamSeasonId),eq(s.externalPlayers.normalizedName,normalizeName(row.player))));
        const fields={source:'bullshooter',teamSeasonId,externalName:row.player,normalizedName:normalizeName(row.player),playerId,lastSeenReportId:rr.record.id};
        let external:typeof s.externalPlayers.$inferSelect;
        if(existing){[external]=await tx.update(s.externalPlayers).set({...fields,updatedAt:new Date()}).where(eq(s.externalPlayers.id,existing.id)).returning();}else{[external]=await tx.insert(s.externalPlayers).values({...fields,firstSeenReportId:rr.record.id}).returning();created++;}
        const stats={...metricsToColumns(person.x01,person.cricket),externalPlayerId:external.id,playerId,teamSeasonId,sourceReportId:rr.record.id,syncedAt:new Date()};
        await tx.insert(s.playerSeasonStats).values(stats).onConflictDoUpdate({target:s.playerSeasonStats.externalPlayerId,set:{...stats,updatedAt:new Date()}});await tx.insert(s.playerStatsHistory).values(stats).onConflictDoNothing();
        if(!playerId&&normalizeName(row.team)===normalizeName(NSJL_NAME))warnings.push(`Ongekoppeld: ${row.player}`);
      }
    }
    const [leaseAfter]=await tx.select().from(s.syncLocks).where(and(eq(s.syncLocks.sourceConfigId,config.id),eq(s.syncLocks.ownerRunId,runId)));
    if(!leaseAfter||leaseAfter.leaseUntil.valueOf()<Date.now())throw new SourceError('LOCK_EXPIRED','Synchronisatielease verlopen; wijzigingen teruggedraaid');
    return {created,updated,skipped,warnings,found:results.standings.length+results.results.length+results.x01.length+results.cricket.length+schedule.matches.length,resultsId:rr.record.id,scheduleId:sr.record.id};
  });
}
