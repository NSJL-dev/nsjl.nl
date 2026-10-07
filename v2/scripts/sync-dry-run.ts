import {stagingOnly} from './environment';
import {BullshooterProvider} from '../lib/bullshooter/provider';
import {parseResults,parseSchedule} from '../lib/bullshooter/parser';
import {validateBundle} from '../lib/bullshooter/validation';
import {readEnv} from '../lib/env';
stagingOnly();const e=readEnv(),bundle=await new BullshooterProvider(e.BULLSHOOTER_RESULTS_ENTRY_URL,e.BULLSHOOTER_SCHEDULE_ENTRY_URL).fetchBundle();
const results=parseResults(bundle.results.html),schedule=parseSchedule(bundle.schedule.html);
validateBundle(results,schedule,{leagueCode:'REU327',seasonName:'2026/2027',division:'A'});
console.log(JSON.stringify({league:results.meta.leagueCode,season:results.meta.seasonName,resultsReport:bundle.results.url,scheduleReport:bundle.schedule.url,reportDateLocal:results.meta.reportDateLocal,teams:results.standings.length,x01:results.x01.length,cricket:results.cricket.length,matches:schedule.matches.length,writes:0},null,2));
