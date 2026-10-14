import {describe,it,expect} from 'vitest';
import {fixtureBundle} from './fixtures';
import {editTable,namedRow,type ReportTable} from './report-mutations';
import {parseResults,parseSchedule} from '@/lib/bullshooter/parser';
import {validateBundle} from '@/lib/bullshooter/validation';
import {metricsToColumns} from '@/lib/sync/service';
import {SourceError} from '@/lib/bullshooter/types';

const expected={leagueCode:'REU327',seasonName:'2026/2027',division:'A'};
const bundle=fixtureBundle();
const parse=(html:string,kind:ReportTable)=>kind==='schedule'?parseSchedule(html):parseResults(html);
const htmlFor=(kind:ReportTable)=>kind==='schedule'?bundle.schedule.html:bundle.results.html;

describe('Strict offline report rows and statistic presence',()=>{
  it.each<ReportTable>(['standings','results','x01','cricket','schedule'])('rejects a short %s row instead of silently dropping it',kind=>{
    const html=editTable(htmlFor(kind),kind,($,table)=>table.find('tr').eq(kind==='standings'?2:1).children('td,th').last().remove());
    expect(()=>parse(html,kind)).toThrow(expect.objectContaining({code:'INCOMPLETE_SOURCE_ROW'}));
  });
  it.each<ReportTable>(['standings','results','x01','cricket','schedule'])('rejects an extra cell in %s',kind=>{
    const html=editTable(htmlFor(kind),kind,($,table)=>table.find('tr').eq(kind==='standings'?2:1).append('<td>0</td>'));
    expect(()=>parse(html,kind)).toThrow(expect.objectContaining({code:'INCOMPLETE_SOURCE_ROW'}));
  });
  it('rejects blank rows rather than excluding them',()=>{
    const html=editTable(bundle.results.html,'x01',($,table)=>table.append('<tr></tr>'));
    expect(()=>parseResults(html)).toThrow(expect.objectContaining({code:'INCOMPLETE_SOURCE_ROW'}));
  });
  it('rejects duplicate column names without guessing their values',()=>{
    const html=editTable(bundle.results.html,'x01',($,table)=>{
      table.find('tr').first().append('<td>Hats</td>');
      table.find('tr').slice(1).append('<td>0</td>');
    });
    expect(()=>parseResults(html)).toThrow(expect.objectContaining({code:'INVALID_TABLE_HEADER'}));
  });
  it('rejects empty column headers',()=>{
    const html=editTable(bundle.results.html,'x01',($,table,headers)=>table.find('tr').first().children().eq(headers.indexOf('Hats')).text(''));
    expect(()=>parseResults(html)).toThrow(expect.objectContaining({code:'INVALID_TABLE_HEADER'}));
  });
  it.each(['colspan','rowspan'])('rejects an unsupported %s rather than shifting columns',span=>{
    const html=editTable(bundle.results.html,'x01',($,table)=>namedRow($,table,'Colin Tielemans').children().eq(2).attr(span,'2'));
    expect(()=>parseResults(html)).toThrow(expect.objectContaining({code:'INCOMPLETE_SOURCE_ROW'}));
  });
  it('retains the audited division divider, schedule group headers and holiday rows',()=>{
    expect(parseResults(bundle.results.html).standings).toHaveLength(9);
    const schedule=parseSchedule(bundle.schedule.html);
    expect(schedule.matches).toHaveLength(90);expect(schedule.matches.every(m=>m.startTime===null)).toBe(true);
  });
  it('rejects an empty schedule row with no valid group metadata',()=>{
    const html=editTable(bundle.schedule.html,'schedule',($,table)=>table.append('<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>'));
    expect(()=>parseSchedule(html)).toThrow(expect.objectContaining({code:'INVALID_SCHEDULE'}));
  });
  it('distinguishes a missing column from a numeric zero',()=>{
    const row=parseResults(bundle.results.html).x01.find(r=>r.player==='Colin Tielemans')!;
    expect(row.metrics).not.toHaveProperty('6DO');expect(row.metrics['15DO']).toBe(0);
    expect(metricsToColumns(row,undefined)).toMatchObject({x01Ppd:'17.86',x01Games:10,x0115do:0});
    expect(metricsToColumns(row,undefined)).not.toHaveProperty('x016do');
  });
  it('absent game rows cannot produce NULL assignments for the other game',()=>{
    const rows=parseResults(bundle.results.html);
    const cricket=metricsToColumns(undefined,rows.cricket[0]);
    expect(cricket).toHaveProperty('cricketMpr');expect(Object.keys(cricket).some(k=>k.startsWith('x01'))).toBe(false);
    const x01=metricsToColumns(rows.x01[0],undefined);
    expect(Object.keys(x01).some(k=>k.startsWith('cricket'))).toBe(false);
    expect(metricsToColumns(undefined,undefined)).toEqual({});
  });
  it.each(['x01','cricket'] as const)('accepts an explicitly unknown %s average only with zero games',kind=>{
    const html=editTable(bundle.results.html,kind,($,table,headers)=>{
      const cells=namedRow($,table,'Colin Tielemans').children();
      for(const key of headers.slice(2))cells.eq(headers.indexOf(key)).text('0');
      cells.eq(headers.indexOf(kind==='x01'?'PPD':'MPR')).text('—');
    });
    const result=parseResults(html),row=result[kind].find(r=>r.player==='Colin Tielemans')!;
    expect(row.metrics[kind==='x01'?'PPD':'MPR']).toBeNull();expect(row.metrics.Games).toBe(0);
    expect(metricsToColumns(kind==='x01'?row:undefined,kind==='cricket'?row:undefined)[kind==='x01'?'x01Ppd':'cricketMpr']).toBeNull();
  });
  it.each(['','—','N/A'])('rejects an ambiguous/missing average for played games (%s)',value=>{
    const html=editTable(bundle.results.html,'x01',($,table,headers)=>namedRow($,table,'Colin Tielemans').children().eq(headers.indexOf('PPD')).text(value));
    expect(()=>parseResults(html)).toThrow(expect.objectContaining({code:'INVALID_NUMBER'}));
  });
  it('requires a numeric Games field even if the average is unknown',()=>{
    const html=editTable(bundle.results.html,'cricket',($,table,headers)=>namedRow($,table,'Colin Tielemans').children().eq(headers.indexOf('Games')).text('—'));
    expect(()=>parseResults(html)).toThrow(SourceError);
  });
  it('rejects duplicate source players within the same game/team context',()=>{
    const html=editTable(bundle.results.html,'x01',($,table)=>table.append(namedRow($,table,'Colin Tielemans').clone()));
    expect(()=>validateBundle(parseResults(html),parseSchedule(bundle.schedule.html),expected)).toThrow(expect.objectContaining({code:'DUPLICATE_PLAYER'}));
  });
  it.each(['results','x01','cricket'] as const)('rejects an entirely empty %s section in a played competition',kind=>{
    const html=editTable(bundle.results.html,kind,($,table)=>table.find('tr').slice(1).remove());
    expect(()=>validateBundle(parseResults(html),parseSchedule(bundle.schedule.html),expected)).toThrow(expect.objectContaining({code:'INCOMPLETE_REPORT'}));
  });
});
