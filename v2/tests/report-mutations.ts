import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { createHash } from 'node:crypto';
import { fixtureBundle } from './fixtures';
import type { SourceBundle } from '@/lib/bullshooter/types';

export type ReportTable='standings'|'results'|'x01'|'cricket'|'schedule';
type Selection=cheerio.Cheerio<AnyNode>;
const columns:Record<ReportTable,string[]>={
  standings:['Team','Win %','Games','Wins'],
  results:['Team','Against','Date','Week','Games','Wins','Losses','Forfeits'],
  x01:['Player','Team','PPD','Games','Wins'],
  cricket:['Player','Team','MPR','Games','Wins'],
  schedule:['Week','Date','Home','Away','At','Notes'],
};

// Every variation is made from the checked-in report. No live provider, URLs
// or database credentials are used by the integrity tests.
export function editTable(html:string,kind:ReportTable,edit:($:cheerio.CheerioAPI,table:Selection,headers:string[])=>void){
  const $=cheerio.load(html);
  const table=$('table').filter((_,t)=>{
    const header=$(t).find('tr').filter((_,r)=>$(r).closest('table')[0]===t).first();
    const names=header.children('td,th').toArray().map(c=>$(c).text().trim());
    return columns[kind].every(c=>names.includes(c));
  });
  if(table.length!==1)throw new Error('Fixture table missing or ambiguous');
  const headers=table.find('tr').first().children('td,th').toArray().map(c=>$(c).text().trim());
  edit($,table,headers);
  return $.html();
}

export function namedRow($:cheerio.CheerioAPI,table:Selection,name:string){
  const row=table.find('tr').filter((_,r)=>$(r).children('td,th').first().text().trim()===name);
  if(row.length!==1)throw new Error('Fixture row missing or ambiguous');
  return row;
}

export function changedBundle(edit:(bundle:SourceBundle)=>void):SourceBundle{
  const bundle=fixtureBundle();edit(bundle);
  for(const report of [bundle.results,bundle.schedule])report.sha256=createHash('sha256').update(report.html).digest('hex');
  return bundle;
}
