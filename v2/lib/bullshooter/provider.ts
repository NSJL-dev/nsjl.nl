import 'server-only';
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { SourceError, type SourceBundle, type FetchedReport } from './types';

const HOSTS=new Set(['www.bullshooterevents.nl','bullshooterevents.nl']);
export function validateSourceUrl(value:string):URL {
  let url:URL;try{url=new URL(value);}catch{throw new SourceError('UNTRUSTED_URL','Ongeldige bron-URL');}
  if(url.protocol!=='https:'||!HOSTS.has(url.hostname)||url.port||url.username||url.password||url.hash)throw new SourceError('UNTRUSTED_URL','Bron-URL niet toegestaan');
  const path=decodeURIComponent(url.pathname);
  if(!/^\/(?:comp_reu3_(?:uitslagen|speelschema|teaminfo)\.html|files\/Competitie\d{4}_(?:Uitslagen|Speelschema'?s)\/[A-Za-z0-9_.-]+\.html)$/.test(path))throw new SourceError('UNTRUSTED_URL','Bronpad niet toegestaan');
  return url;
}
export function discoverReportUrl(html:string,entryUrl:string):string {
  const base=validateSourceUrl(entryUrl);const $=cheerio.load(html);
  const candidates=$('iframe[src]').toArray().map(e=>new URL($(e).attr('src')!,base).href);
  if(candidates.length!==1)throw new SourceError('REPORT_DISCOVERY_FAILED','Verwacht exact één report-iframe');
  return validateSourceUrl(candidates[0]).href;
}
export interface CompetitionDataProvider { fetchBundle():Promise<SourceBundle> }
export class BullshooterProvider implements CompetitionDataProvider {
  constructor(private resultsEntry:string,private scheduleEntry:string,private fetcher:typeof fetch=fetch){}
  private async get(url:string,redirects=0):Promise<{html:string;url:string}>{
    validateSourceUrl(url);
    if(redirects>2)throw new SourceError('REDIRECT_LIMIT','Te veel bronredirects');
    const response=await this.fetcher(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'NSJL-V2/1.0 (competition sync; info@nsjl.nl)','Accept':'text/html'}});
    if(response.status>=300&&response.status<400){const loc=response.headers.get('location');if(!loc)throw new SourceError('BAD_REDIRECT','Lege redirect');return this.get(new URL(loc,url).href,redirects+1);}
    if(response.status===429)throw new SourceError('SOURCE_RATE_LIMIT','Bron vraagt later opnieuw te proberen');
    if(!response.ok)throw new SourceError('SOURCE_HTTP_ERROR',`Bron antwoordt met HTTP ${response.status}`);
    if(!/text\/html/i.test(response.headers.get('content-type')||''))throw new SourceError('INVALID_CONTENT_TYPE','Bron is geen HTML');
    const max=2_000_000;
    if(Number(response.headers.get('content-length')||0)>max)throw new SourceError('DOCUMENT_TOO_LARGE','Bronbestand te groot');
    if(!response.body)throw new SourceError('EMPTY_DOCUMENT','Lege response');
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new SourceError('DOCUMENT_TOO_LARGE','Bronbestand te groot');}chunks.push(value);}
    return {html:Buffer.concat(chunks).toString('utf8'),url};
  }
  private async report(entry:string):Promise<FetchedReport>{
    const page=await this.get(entry);const url=discoverReportUrl(page.html,page.url);const report=await this.get(url);
    return {...report,sha256:createHash('sha256').update(report.html).digest('hex')};
  }
  async fetchBundle(){
    // Sequential, bounded source requests. Both URLs are discovered on every run.
    const results=await this.report(this.resultsEntry);const schedule=await this.report(this.scheduleEntry);return {results,schedule};
  }
}
