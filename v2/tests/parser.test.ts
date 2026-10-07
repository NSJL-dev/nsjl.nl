import { describe,it,expect } from 'vitest';
import {fixture,fixtureBundle} from './fixtures';
import {parseResults,parseSchedule,normalizeName,sourceDate,NSJL_NAME} from '@/lib/bullshooter/parser';
import {validateBundle,pairingKey} from '@/lib/bullshooter/validation';
import {discoverReportUrl,validateSourceUrl,BullshooterProvider} from '@/lib/bullshooter/provider';
import {SourceError} from '@/lib/bullshooter/types';
const expected={leagueCode:'REU327',seasonName:'2026/2027',division:'A'};
describe('LeagueLeader offline contract',()=>{
  it('herkent league, NSJL en bronpositie zonder nulteams te verzinnen',()=>{
    const r=parseResults(fixture('results-2026-10-03.html'));
    expect(r.meta).toMatchObject({leagueCode:'REU327',seasonName:'2026/2027',reportDateLocal:'2026-10-03T06:33:00',reportTimezone:null});
    expect(r.standings.find(t=>t.team===NSJL_NAME)).toEqual({team:NSJL_NAME,position:7,games:42,wins:8,losses:34,winPercentage:19});
    expect(r.standings).toHaveLength(9);
  });
  it('leest beide uitslagperspectieven en oudere laatste tegenpartijresultaten',()=>{
    const r=parseResults(fixture('results-2026-10-03.html'));expect(r.results.find(x=>x.team===NSJL_NAME)).toMatchObject({against:'Bonn 5',date:'2026-10-01',week:2,wins:5,losses:16,forfeits:0});
    expect(r.results.find(x=>x.team==='T Centrum 1')?.date).toBe('2026-09-24');
  });
  it('leest X01 en echte 9DO-15DO-kolommen, 6DO is onbekend',()=>{
    const r=parseResults(fixture('results-2026-10-03.html'));expect(r.x01.find(x=>x.player==='Colin Tielemans')?.metrics).toMatchObject({PPD:17.86,Games:10,Wins:4,LTon:13,'6DO':null,'15DO':0});
  });
  it('leest Cricket inclusief assists, hats en mark-rounds',()=>{
    const r=parseResults(fixture('results-2026-10-03.html'));expect(r.cricket.find(x=>x.player==='Colin Tielemans')?.metrics).toMatchObject({MPR:2.21,Games:8,Wins:2,Assists:0,'5MR':2,'6MR':1});
  });
  it('draagt week/datum over, slaat vakantierondes over, vult geen starttijd in',()=>{
    const s=parseSchedule(fixture('schedule-2026-08-31.html'));const rows=s.matches.filter(x=>x.home===NSJL_NAME||x.away===NSJL_NAME);
    expect(s.teams).toHaveLength(10);expect(rows).toHaveLength(18);expect(rows.find(x=>x.week===4)).toMatchObject({date:'2026-10-15',home:NSJL_NAME,away:'Saloon 5.2',venue:'The Saloon',startTime:null});expect(s.matches.some(x=>x.week===3)).toBe(false);
  });
  it('houdt team zonder uitslag in schema, zonder importfout',()=>{
    const b=fixtureBundle();const r=parseResults(b.results.html),s=parseSchedule(b.schedule.html);expect(validateBundle(r,s,expected).warnings).toContain('Team zonder uitslag blijft in het roster.');expect(s.teams).toContain('Triple Drieske');
  });
  it('Tim Goossens heeft externe teamcontext Saloon 5.2',()=>{
    const r=parseResults(fixture('results-2026-10-03.html'));expect(r.x01.find(x=>x.player==='Tim Goossens')?.team).toBe('Saloon 5.2');expect(r.x01.filter(x=>x.team===NSJL_NAME).map(x=>x.player)).not.toContain('Tim Goossens');
  });
  it('normaliseert whitespace/case maar behoudt onderscheidende tekens',()=>{
    expect(normalizeName('  Mike\u00a0 Van   De Voort ')).toBe('mike van de voort');expect(normalizeName("D’n Bonn")).not.toBe(normalizeName('Dn Bonn'));
    const r=parseResults(fixture('results-2026-10-03.html').replaceAll('No Skill Just Luck',' No Skill   Just Luck '));expect(normalizeName(r.standings[6].team)).toBe(normalizeName(NSJL_NAME));
  });
  it('ontbrekende optionele kolom wordt NULL; noodzakelijke kolom blokkeert',()=>{
    const b=fixture('results-2026-10-03.html');expect(()=>parseResults(b.replaceAll('PPD','Gemiddelde'))).toThrow();
    const no15=b.replaceAll('15DO','Extra');expect(parseResults(no15).x01[0].metrics['15DO']).toBeNull();
  });
  it.each(['','<html><body>Onderhoud</body></html>','<h2>Unable to display report</h2>'])('weigert lege, gewijzigde of foutpagina (%s)',html=>expect(()=>parseResults(html)).toThrow(SourceError));
  it('weigert oud report',()=>{
    const b=fixtureBundle();expect(()=>validateBundle(parseResults(b.results.html),parseSchedule(b.schedule.html),{...expected,previousReportDate:'2026-10-04T06:00:00'})).toThrow('Ouder report');
  });
  it('seizoenwijziging overschrijft huidige context niet',()=>{
    const b=fixtureBundle();const next=b.results.html.replaceAll('REU327','REU328').replaceAll('2627','2728');expect(()=>validateBundle(parseResults(next),parseSchedule(b.schedule.html),expected)).toThrow('contextreview');
  });
  it('uitgestelde wedstrijd behoudt dezelfde pairing ondanks nieuwe datum',()=>{
    expect(pairingKey(2,NSJL_NAME,'Bonn 5')).toBe(pairingKey(2,'Bonn 5',NSJL_NAME));const b=fixtureBundle();const s=parseSchedule(b.schedule.html.replaceAll('10/01/2026','10/02/2026'));expect(()=>validateBundle(parseResults(b.results.html),s,expected)).not.toThrow();
  });
  it('ontdekt gewijzigde reportURL via iframe, geen datumgok',()=>{
    const entry='https://www.bullshooterevents.nl/comp_reu3_uitslagen.html';expect(discoverReportUrl(fixture('results-entry.html').replaceAll('261003_REU3','261010_REU3'),entry)).toContain('261010_REU3');
  });
  it.each(['http://www.bullshooterevents.nl/comp_reu3_uitslagen.html','https://www.bullshooterevents.nl.evil.invalid/files/a.html','https://127.0.0.1/','https://user:pass@www.bullshooterevents.nl/comp_reu3_uitslagen.html','https://www.bullshooterevents.nl:8080/comp_reu3_uitslagen.html','https://www.bullshooterevents.nl/files/../../admin.html'])('blokkeert SSRF URL %s',url=>expect(()=>validateSourceUrl(url)).toThrow());
  it('blokkeert onveilige redirect zonder volgende fetch',async()=>{
    let count=0;const fetcher:typeof fetch=async()=>{count++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}});};
    const p=new BullshooterProvider('https://www.bullshooterevents.nl/comp_reu3_uitslagen.html','https://www.bullshooterevents.nl/comp_reu3_speelschema.html',fetcher);await expect(p.fetchBundle()).rejects.toThrow();expect(count).toBe(1);
  });
  it('weigert onmogelijke Amerikaanse kalenderdatum',()=>expect(()=>sourceDate('2/30/2026')).toThrow());
});
