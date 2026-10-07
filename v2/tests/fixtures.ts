import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { SourceBundle } from '@/lib/bullshooter/types';
export function fixture(name:string){return readFileSync(path.join(process.cwd(),'tests/fixtures',name),'utf8');}
export function fixtureBundle():SourceBundle{
  const results=fixture('results-2026-10-03.html'),schedule=fixture('schedule-2026-08-31.html');
  return {results:{url:'https://www.bullshooterevents.nl/files/Competitie2627_Uitslagen/261003_REU3.html',html:results,sha256:createHash('sha256').update(results).digest('hex')},schedule:{url:"https://www.bullshooterevents.nl/files/Competitie2627_Speelschema's/Speelschema_REU3.html",html:schedule,sha256:createHash('sha256').update(schedule).digest('hex')}};
}
