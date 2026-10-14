import * as cheerio from 'cheerio';
import { SourceError, type ReportMeta, type ResultsReport, type ScheduleReport, type PlayerStatRow } from './types';

export const PARSER_VERSION = 'nsjl-leagueleader-2.0.0';
export const NSJL_NAME = 'No Skill Just Luck';
export function normalizeName(value: string) { return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('nl-NL'); }
export function sourceDate(value: string): string {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new SourceError('INVALID_DATE', `Ongeldige brondatum: ${value}`);
  const [, month, day, year] = m;
  const iso = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0,10) !== iso) throw new SourceError('INVALID_DATE','Brondatum bestaat niet');
  return iso;
}
function number(value: string | undefined, field: string, integer = true): number {
  if (!value?.trim() || !/^(?:\d+)(?:\.\d+)?$/.test(value.trim())) throw new SourceError('INVALID_NUMBER', `Ongeldige waarde voor ${field}`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isSafeInteger(n))) throw new SourceError('INVALID_NUMBER', `Ongeldige waarde voor ${field}`);
  return n;
}
type Table = { headers: string[]; rows: Record<string,string>[] };
type RawRow = { cells: string[]; spanned: boolean };
type RawTable = { headers: string[]; headerSpanned: boolean; rows: RawRow[] };
function document(html: string) {
  if (!html.trim()) throw new SourceError('EMPTY_DOCUMENT','Lege bronpagina');
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  const content = $('body').text().replace(/\s+/g,' ');
  if (/Unable to display report|Invalid shared report|captcha|Access denied/i.test(content)) throw new SourceError('SOURCE_ERROR_PAGE','Bron geeft een fout- of toegangspagina');
  const tables: RawTable[] = [];
  $('table').each((_, table) => {
    const rows = $(table).find('tr').filter((_,r)=>$(r).closest('table')[0]===table).toArray().map(r=>{
      const cells=$(r).children('th, td').toArray();
      return {cells:cells.map(c=>$(c).text().replace(/\s+/g,' ').trim()),spanned:cells.some(c=>['colspan','rowspan'].some(a=>$(c).attr(a)!==undefined&&$(c).attr(a)!=='1'))};
    });
    const headers = rows[0]?.cells || [];
    if (headers.length < 2) return;
    // Preserve every row. Only selected data tables are decoded and validated;
    // layout tables must not hide a damaged row in a selected report table.
    tables.push({headers,headerSpanned:rows[0].spanned,rows:rows.slice(1)});
  });
  return {$,content,tables};
}
function metadata(doc: ReturnType<typeof document>, kind: 'results' | 'schedule'): ReportMeta {
  const title = doc.$('h2').first().text().replace(/\s+/g,' ').trim();
  const expected = kind==='results' ? 'Location Stats Report' : 'Schedule Report';
  const league = title.match(new RegExp(`^${expected} for ([A-Z0-9]+) - (.+)$`));
  const stamp = doc.content.match(/Report Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}):(\d{2})\s+([AP]M)/i);
  const division = doc.content.match(/Division:?\s+([A-Z])\b/);
  if (!league || !stamp || !division) throw new SourceError('UNKNOWN_STRUCTURE','Reportmetadata of structuur niet herkend');
  const shortSeason=league[2].match(/\b(\d{2})(\d{2})\b/);
  if (!shortSeason) throw new SourceError('UNKNOWN_SEASON','Seizoen niet herkenbaar');
  const seasonName=`20${shortSeason[1]}/20${shortSeason[2]}`;
  if (Number(shortSeason[2])!==Number(shortSeason[1])+1) throw new SourceError('UNKNOWN_SEASON','Ongeldig competitiejaar');
  const hour=Number(stamp[2]);const minute=Number(stamp[3]);
  if(hour<1||hour>12||minute>59)throw new SourceError('INVALID_DATE','Ongeldige reporttijd');
  const reportDateLocal=`${sourceDate(stamp[1])}T${String(hour%12+(stamp[4].toUpperCase()==='PM'?12:0)).padStart(2,'0')}:${stamp[3]}:00`;
  return {leagueCode:league[1],leagueName:league[2],seasonName,sourceDivision:division[1],reportDateLocal,reportTimezone:null};
}
function select(tables:RawTable[],required:string[],divisionDivider?:string):Table {
  const matches=tables.filter(t=>required.every(h=>t.headers.includes(h)));
  if(matches.length!==1)throw new SourceError('UNKNOWN_STRUCTURE',`Verwachte tabel ontbreekt of is dubbel: ${required.join(', ')}`);
  const table=matches[0];
  if(table.headerSpanned||table.headers.some(h=>!h)||new Set(table.headers).size!==table.headers.length)throw new SourceError('INVALID_TABLE_HEADER','Onvolledige of dubbele tabelkolommen');
  const rows:Table['rows']=[];
  for(const row of table.rows){
    // The audited standings report contains this exact one-cell divider.
    // It is a known structural row, not a player/team row to discard silently.
    if(divisionDivider&&row.cells.length===1&&row.cells[0]===`Division: ${divisionDivider}`&&!row.spanned)continue;
    if(row.spanned||row.cells.length!==table.headers.length)throw new SourceError('INCOMPLETE_SOURCE_ROW','Onvolledige of gewijzigde bronrij; import geweigerd');
    rows.push(Object.fromEntries(table.headers.map((h,i)=>[h,row.cells[i]])));
  }
  return {headers:table.headers,rows};
}
export const X01_COLUMNS=['PPD','Games','Wins','Hats','3BD','Ton80','HTon','LTon','6DO','7DO','8DO','9DO','10DO','11DO','12DO','13DO','14DO','15DO'];
export const CRICKET_COLUMNS=['MPR','Games','Wins','Assists','Hats','WHorse','5MR','6MR','7MR','8MR','9MR'];
function stats(t:Table,columns:string[],warnings:string[]):PlayerStatRow[] {
  const unavailable=columns.filter(c=>!t.headers.includes(c));
  if(unavailable.length)warnings.push(`Niet aangeboden statistiekkolommen: ${unavailable.join(', ')}`);
  return t.rows.map(r=>{
    if(!r.Player||!r.Team)throw new SourceError('INVALID_PLAYER','Speler of team ontbreekt');
    const games=number(r.Games,'Games');
    const metrics=Object.fromEntries(columns.filter(c=>t.headers.includes(c)).map(c=>{
      const average=['PPD','MPR'].includes(c);
      // A blank cell is damaged/ambiguous input. Explicit unknown averages
      // are allowed only without played games; counts always require numbers.
      const value=average&&games===0&&['—','-','N/A'].includes(r[c])?null:number(r[c],c,!average);
      return [c,value];
    }));
    if((metrics.Wins??0)>(metrics.Games??0))throw new SourceError('INVALID_NUMBER','Spelerwins groter dan games');
    return {player:r.Player,team:r.Team,metrics};
  });
}
export function parseResults(html:string):ResultsReport {
  const doc=document(html);const meta=metadata(doc,'results');const warnings:string[]=[];
  const standings=select(doc.tables,['Team','Win %','Games','Wins'],meta.sourceDivision).rows.map((r,i)=>{
    const games=number(r.Games,'Games');const wins=number(r.Wins,'Wins');const winPercentage=number(r['Win %'],'Win %',false);
    if(!r.Team||wins>games||winPercentage>100)throw new SourceError('INVALID_STANDING','Ongeldige stand');
    if(games>0&&Math.abs(winPercentage-wins/games*100)>.15)throw new SourceError('INVALID_STANDING','Percentage wijkt af van games/wins');
    return {team:r.Team,position:i+1,games,wins,losses:games-wins,winPercentage};
  });
  const results=select(doc.tables,['Team','Against','Date','Week','Games','Wins','Losses','Forfeits']).rows.map(r=>{
    const row={team:r.Team,against:r.Against,date:sourceDate(r.Date),week:number(r.Week,'Week'),games:number(r.Games,'Games'),wins:number(r.Wins,'Wins'),losses:number(r.Losses,'Losses'),forfeits:number(r.Forfeits,'Forfeits')};
    if(!row.team||!row.against||normalizeName(row.team)===normalizeName(row.against)||row.wins+row.losses!==row.games)throw new SourceError('INVALID_RESULT','Ongeldige uitslag');
    return row;
  });
  const x01=stats(select(doc.tables,['Player','Team','PPD','Games','Wins']),X01_COLUMNS,warnings);
  const cricket=stats(select(doc.tables,['Player','Team','MPR','Games','Wins']),CRICKET_COLUMNS,warnings);
  if(!standings.length)throw new SourceError('EXPECTED_TEAMS_NOT_FOUND','Geen standregels aangetroffen');
  // League message is a one-column table; retain its text independently.
  const notices=doc.$('table').toArray().filter(t=>doc.$(t).text().includes('League Message')).map(t=>doc.$(t).text().replace(/\s+/g,' ').trim()).filter(t=>t.length<1500);
  return {meta,standings,results,x01,cricket,messages:notices,warnings};
}
export function parseSchedule(html:string):ScheduleReport {
  const doc=document(html);const meta=metadata(doc,'schedule');
  const table=select(doc.tables,['Week','Date','Home','Away','At','Notes']);
  let week:number|undefined;let date:string|undefined;
  const matches:ScheduleReport['matches']=[];
  for(const r of table.rows){
    if(r.Week)week=number(r.Week,'Week');if(r.Date)date=sourceDate(r.Date);
    if(!r.Home&&!r.Away){
      if(!r.Week||!r.Date||r.At||r.Notes||r.Time)throw new SourceError('INVALID_SCHEDULE','Onvolledige schema-groepsregel');
      continue;
    }
    if(!r.Home&&r.Away==='Position Round')continue;
    if(!week||!date||!r.Home||!r.Away)throw new SourceError('INVALID_SCHEDULE','Onvolledige wedstrijdregel');
    if(normalizeName(r.Home)===normalizeName(r.Away))throw new SourceError('INVALID_SCHEDULE','Thuis en uit hetzelfde team');
    let startTime:string|null=null;
    if(r.Time){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.Time))throw new SourceError('INVALID_SCHEDULE','Onbekende aanvangstijd');startTime=r.Time;}
    matches.push({week,date,home:r.Home,away:r.Away,venue:r.At||null,notes:r.Notes||'',startTime});
  }
  if(!matches.length)throw new SourceError('EMPTY_SCHEDULE','Geen schemapairings gevonden');
  return {meta,matches,teams:[...new Set(matches.flatMap(r=>[r.home,r.away]))],warnings:[]};
}
