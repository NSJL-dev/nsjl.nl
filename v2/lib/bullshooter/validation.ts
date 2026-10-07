import { normalizeName, NSJL_NAME } from './parser';
import { SourceError, type ResultsReport, type ScheduleReport, type ResultRow } from './types';
export function pairingKey(week:number,teamA:string,teamB:string){return `${week}:${[normalizeName(teamA),normalizeName(teamB)].sort().join('|')}`;}
export function validateBundle(results:ResultsReport,schedule:ScheduleReport,expected:{leagueCode:string;seasonName:string;division:string;previousReportDate?:string;previousTeamCount?:number;previousScheduleDate?:string}){
  for(const report of [results,schedule]){
    if(report.meta.leagueCode!==expected.leagueCode||report.meta.seasonName!==expected.seasonName)throw new SourceError('SEASON_REVIEW_REQUIRED','Andere league of ander seizoen aangetroffen; contextreview nodig');
    if(report.meta.sourceDivision!==expected.division)throw new SourceError('DIVISION_MISMATCH','Verkeerde divisie');
  }
  if(expected.previousReportDate&&results.meta.reportDateLocal<expected.previousReportDate)throw new SourceError('OLD_REPORT','Ouder report overschrijft geen nieuwere gegevens');
  if(expected.previousScheduleDate&&schedule.meta.reportDateLocal<expected.previousScheduleDate)throw new SourceError('OLD_REPORT','Ouder schema overschrijft geen nieuwere gegevens');
  if(!results.standings.some(t=>normalizeName(t.team)===normalizeName(NSJL_NAME)))throw new SourceError('NSJL_NOT_FOUND','NSJL ontbreekt in stand');
  if(!schedule.teams.some(t=>normalizeName(t)===normalizeName(NSJL_NAME)))throw new SourceError('NSJL_NOT_FOUND','NSJL ontbreekt in schema');
  if(expected.previousTeamCount&&results.standings.length<Math.max(1,expected.previousTeamCount*.6))throw new SourceError('UNEXPECTED_TEAM_DROP','Onverwacht grote daling van standregels');
  const roster=new Set(schedule.teams.map(normalizeName));
  if(results.standings.some(r=>!roster.has(normalizeName(r.team))))throw new SourceError('ROSTER_MISMATCH','Standteam ontbreekt in roster');
  if(new Set(results.standings.map(r=>normalizeName(r.team))).size!==results.standings.length)throw new SourceError('DUPLICATE_TEAM','Dubbel team in stand');
  const keys=schedule.matches.map(m=>pairingKey(m.week,m.home,m.away));
  if(new Set(keys).size!==keys.length)throw new SourceError('AMBIGUOUS_PAIRING','Dubbele ronde/team-pairing vraagt review');
  const grouped=new Map<string,ResultRow[]>();
  for(const r of results.results){
    const key=pairingKey(r.week,r.team,r.against);if(!keys.includes(key))throw new SourceError('UNMATCHED_RESULT','Uitslag heeft geen bekende schemapairing');
    const list=grouped.get(key)||[];
    const duplicate=list.find(x=>normalizeName(x.team)===normalizeName(r.team));
    if(duplicate&&JSON.stringify(duplicate)!==JSON.stringify(r))throw new SourceError('CONFLICTING_RESULT','Tegenstrijdige dubbele uitslag');
    if(!duplicate)list.push(r);grouped.set(key,list);
  }
  for(const list of grouped.values()){
    if(list.length>2)throw new SourceError('CONFLICTING_RESULT','Te veel uitslagperspectieven');
    if(list.length===2&&(list[0].date!==list[1].date||list[0].wins!==list[1].losses||list[1].wins!==list[0].losses))throw new SourceError('CONFLICTING_RESULT','Tegenstrijdige uitslagperspectieven');
  }
  for(const stat of [...results.x01,...results.cricket])if(!roster.has(normalizeName(stat.team)))throw new SourceError('PLAYER_TEAM_UNKNOWN','Statistiekteam ontbreekt in roster');
  return {resultGroups:grouped,warnings:[...results.warnings,...schedule.warnings,...(schedule.teams.length>results.standings.length?['Team zonder uitslag blijft in het roster.']:[])]};
}
