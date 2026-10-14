import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pglite';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {synchronize} from '@/lib/sync/service';
import {PARSER_VERSION,NSJL_NAME,normalizeName} from '@/lib/bullshooter/parser';
import {testDatabase} from './database';
import {fixtureBundle} from './fixtures';
import {changedBundle,editTable,namedRow} from './report-mutations';
import type {SourceBundle} from '@/lib/bullshooter/types';

let context:Awaited<ReturnType<typeof testDatabase>>,sourceId:string;
beforeAll(async()=>{context=await testDatabase();[sourceId]=(await context.db.select().from(s.sourceConfigs)).map(c=>c.id);},90000);
afterAll(async()=>{vi.restoreAllMocks();await context?.client.close();});
const options={trigger:'manual' as const,cooldownMs:0};
const run=(bundle=fixtureBundle())=>synchronize(context.db,sourceId,{fetchBundle:async()=>bundle},options);

async function snapshot(){
  const tables=['source_reports','standings','standings_history','matches','match_result_sides','external_players','player_season_stats','player_stats_history','teams','team_seasons','team_aliases','venues','venue_aliases','player_team_seasons','player_aliases'] as const;
  const data:Record<string,unknown[]>={};
  for(const table of tables){
    const result=await context.client.query<{record:unknown}>(`select row_to_json(t) as record from ${table} t order by id`);
    data[table]=result.rows.map(r=>r.record);
  }
  return data;
}

async function refusedWithoutChanges(bundle:SourceBundle,code:string){
  const before=await snapshot(),result=await run(bundle);
  expect(result.status).toBe('failed');expect(result.errorCode).toBe(code);
  expect(result.created).toBe(0);expect(result.updated).toBe(0);
  expect(await snapshot()).toEqual(before);
  const [log]=await context.db.select().from(s.syncRuns).where(eq(s.syncRuns.id,result.runId));
  expect(log.status).toBe('failed');expect(log.errorCode).toBe(code);
  expect(log.resultReportId).toBeNull();expect(log.scheduleReportId).toBeNull();
  expect(await context.db.select().from(s.syncLocks)).toHaveLength(0);
  expect((await context.db.select().from(s.sourceConfigs))[0].enabled).toBe(false);
}

function changedStat(key:string,value:string,game:'x01'|'cricket'='x01'){
  return changedBundle(b=>{b.results.html=editTable(b.results.html,game,($,table,headers)=>namedRow($,table,'Colin Tielemans').children().eq(headers.indexOf(key)).text(value));});
}

describe('Isolated PostgreSQL importer integrity (saved fixtures only)',()=>{
  it('initial unavailable columns remain NULL without inventing numeric zeros',async()=>{
    const bundle=changedBundle(b=>{
      b.results.html=b.results.html.replaceAll('15DO','Extra');
      for(const game of ['x01','cricket'] as const)b.results.html=editTable(b.results.html,game,($,table,headers)=>{
        const cells=namedRow($,table,'Colin Tielemans').children();
        for(const key of headers.slice(2))cells.eq(headers.indexOf(key)).text('0');
        cells.eq(headers.indexOf(game==='x01'?'PPD':'MPR')).text('—');
      });
      b.results.html=editTable(b.results.html,'x01',($,table)=>namedRow($,table,'Tim Goossens').remove());
    });
    expect((await run(bundle)).status).not.toBe('failed');
    const rows=await context.db.select().from(s.playerSeasonStats);
    expect(rows).toHaveLength(39);
    expect(rows.every(r=>r.x0115do===null&&r.x016do===null&&r.x017do===null&&r.x018do===null)).toBe(true);
    const [colin]=await context.db.select().from(s.externalPlayers).where(eq(s.externalPlayers.normalizedName,'colin tielemans'));
    expect(rows.find(r=>r.externalPlayerId===colin.id)).toMatchObject({x01Ppd:null,cricketMpr:null,x01Games:0,cricketGames:0});
    const [tim]=await context.db.select().from(s.externalPlayers).where(eq(s.externalPlayers.normalizedName,'tim goossens'));
    const timStats=rows.find(r=>r.externalPlayerId===tim.id)!;
    expect(timStats.x01Ppd).toBeNull();expect(timStats.x01Games).toBeNull();expect(timStats.cricketGames).not.toBeNull();
  });
  it('a complete report can fill previously unavailable values, including known zero',async()=>{
    expect((await run()).status).not.toBe('failed');
    const [colin]=await context.db.select().from(s.externalPlayers).where(eq(s.externalPlayers.normalizedName,'colin tielemans'));
    const [stats]=await context.db.select().from(s.playerSeasonStats).where(eq(s.playerSeasonStats.externalPlayerId,colin.id));
    expect(stats).toMatchObject({x01Ppd:'17.86',cricketMpr:'2.21',x01Games:10,cricketGames:8,x0115do:0,x01Lton:13,cricket5mr:2});
  });
  it.each(['x01','cricket'] as const)('a short %s row cannot erase PPD, MPR, Games or other fields',async game=>{
    const bundle=changedBundle(b=>{b.results.html=editTable(b.results.html,game,($,table)=>namedRow($,table,'Colin Tielemans').children().last().remove());});
    await refusedWithoutChanges(bundle,'INCOMPLETE_SOURCE_ROW');
  });
  it.each([['x01','PPD'],['x01','Games'],['cricket','MPR'],['cricket','Games']] as const)('a blank %s %s cell rejects rather than clearing valid statistics',async(game,column)=>{
    await refusedWithoutChanges(changedStat(column,'',game),'INVALID_NUMBER');
  });
  it.each(['x01','cricket'] as const)('a wholly missing %s row is rejected even with the other game intact',async game=>{
    const bundle=changedBundle(b=>{b.results.html=editTable(b.results.html,game,($,table)=>namedRow($,table,'Colin Tielemans').remove());});
    await refusedWithoutChanges(bundle,'INCOMPLETE_STATS');
  });
  it('a player absent from both games cannot silently disappear from a cumulative report',async()=>{
    const bundle=changedBundle(b=>{
      for(const game of ['x01','cricket'] as const)b.results.html=editTable(b.results.html,game,($,table)=>namedRow($,table,'Colin Tielemans').remove());
    });
    await refusedWithoutChanges(bundle,'UNEXPECTED_PLAYER_DROP');
  });
  it('moving the same source player to another team requires context review',async()=>{
    const bundle=changedBundle(b=>{
      for(const game of ['x01','cricket'] as const)b.results.html=editTable(b.results.html,game,($,table,headers)=>namedRow($,table,'Colin Tielemans').children().eq(headers.indexOf('Team')).text('Saloon 5.2'));
    });
    await refusedWithoutChanges(bundle,'UNEXPECTED_PLAYER_DROP');
  });
  it.each([['x01','15DO'],['x01','Hats'],['cricket','Assists'],['cricket','9MR']] as const)('losing the known %s %s column rejects the entire import',async(game,column)=>{
    const bundle=changedBundle(b=>{b.results.html=editTable(b.results.html,game,($,table,headers)=>{
      const index=headers.indexOf(column);table.find('tr').each((_,r)=>{$(r).children().eq(index).remove();});
    });});
    await refusedWithoutChanges(bundle,'INCOMPLETE_STATS');
  });
  it.each(['x01','cricket'] as const)('an explicit unknown %s average cannot replace a previously known average',async game=>{
    const bundle=changedBundle(b=>{b.results.html=editTable(b.results.html,game,($,table,headers)=>{
      const cells=namedRow($,table,'Colin Tielemans').children();
      for(const key of headers.slice(2))cells.eq(headers.indexOf(key)).text('0');
      cells.eq(headers.indexOf(game==='x01'?'PPD':'MPR')).text('—');
    });});
    await refusedWithoutChanges(bundle,'INCOMPLETE_STATS');
  });
  it.each(['results','x01','cricket'] as const)('a wholly empty %s section rejects a played report',async kind=>{
    const bundle=changedBundle(b=>{b.results.html=editTable(b.results.html,kind,($,table)=>table.find('tr').slice(1).remove());});
    await refusedWithoutChanges(bundle,'INCOMPLETE_REPORT');
  });
  it('a missing standings team is rejected even when the drop is only one team',async()=>{
    const bundle=changedBundle(b=>{b.results.html=editTable(b.results.html,'standings',($,table)=>namedRow($,table,'Saloon 5.2').remove());});
    await refusedWithoutChanges(bundle,'UNEXPECTED_TEAM_DROP');
  });
  it('the same standings count cannot hide replacement of an earlier team',async()=>{
    const bundle=changedBundle(b=>{b.results.html=editTable(b.results.html,'standings',($,table)=>namedRow($,table,'Saloon 5.2').children().first().text('Triple Drieske'));});
    await refusedWithoutChanges(bundle,'UNEXPECTED_TEAM_DROP');
  });
  it('a missing latest-result team is rejected without demanding all historic pairings',async()=>{
    const bundle=changedBundle(b=>{b.results.html=editTable(b.results.html,'results',($,table)=>namedRow($,table,NSJL_NAME).remove());});
    await refusedWithoutChanges(bundle,'INCOMPLETE_RESULTS');
  });
  it('a removed scheduled match rejects even if the roster is unchanged',async()=>{
    const bundle=changedBundle(b=>{b.schedule.html=editTable(b.schedule.html,'schedule',($,table,headers)=>{
      const row=table.find('tr').filter((_,r)=>!!$(r).children().eq(headers.indexOf('Home')).text().trim()).slice(1).last();
      expect(row).toHaveLength(1);row.remove();
    });});
    await refusedWithoutChanges(bundle,'INCOMPLETE_SCHEDULE');
  });
  it('a team missing from the full schedule cannot leave a valid partial import',async()=>{
    const bundle=changedBundle(b=>{b.schedule.html=editTable(b.schedule.html,'schedule',($,table,headers)=>{
      table.find('tr').filter((_,r)=>['Home','Away'].some(column=>$(r).children().eq(headers.indexOf(column)).text().trim()==='Triple Drieske')).remove();
    });});
    await refusedWithoutChanges(bundle,'INCOMPLETE_SCHEDULE');
  });
  it('a repeated damaged import creates failed logs but no reports, stats or history',async()=>{
    const bundle=changedBundle(b=>{b.results.html=editTable(b.results.html,'x01',($,table)=>namedRow($,table,'Colin Tielemans').remove());});
    await refusedWithoutChanges(bundle,'INCOMPLETE_STATS');await refusedWithoutChanges(bundle,'INCOMPLETE_STATS');
  });
  it('late statistics-history failure rolls back all writes, then the same import can be retried',async()=>{
    const bundle=changedStat('PPD','18.01'),before=await snapshot();
    await context.client.exec("create function test_fail_stats_history() returns trigger language plpgsql as $$ begin raise exception 'isolated test failure'; end $$; create trigger test_fail_stats_history before insert on player_stats_history for each row execute function test_fail_stats_history();");
    try{await refusedWithoutChanges(bundle,'SYNC_FAILED');}
    finally{await context.client.exec('drop trigger test_fail_stats_history on player_stats_history; drop function test_fail_stats_history();');}
    const result=await run(bundle);expect(result.status).not.toBe('failed');
    expect((await snapshot()).player_season_stats).not.toEqual(before.player_season_stats);
    const [colin]=await context.db.select().from(s.externalPlayers).where(eq(s.externalPlayers.normalizedName,'colin tielemans'));
    const [stats]=await context.db.select().from(s.playerSeasonStats).where(eq(s.playerSeasonStats.externalPlayerId,colin.id));
    expect(stats).toMatchObject({x01Ppd:'18.01',cricketMpr:'2.21',x01Games:10,cricketGames:8,x01Lton:13,cricket5mr:2});
    const after=await snapshot(),duplicate=await run(bundle);
    expect(duplicate.created+duplicate.updated).toBe(0);expect(await snapshot()).toEqual(after);
  });
  it('successful-run logging is part of the same transaction as statistics',async()=>{
    await context.client.exec("create function test_fail_run_completion() returns trigger language plpgsql as $$ begin if new.result_report_id is not null then raise exception 'isolated completion failure'; end if; return new; end $$; create trigger test_fail_run_completion before update on sync_runs for each row execute function test_fail_run_completion();");
    try{await refusedWithoutChanges(changedStat('PPD','18.02'),'SYNC_FAILED');}
    finally{await context.client.exec('drop trigger test_fail_run_completion on sync_runs; drop function test_fail_run_completion();');}
  });
  it('a lease lost before the transaction cannot write and cannot remove the new owner lock',async()=>{
    const before=await snapshot(),newOwner=crypto.randomUUID();
    const result=await synchronize(context.db,sourceId,{fetchBundle:async()=>{
      await context.db.update(s.syncLocks).set({ownerRunId:newOwner,leaseUntil:new Date(Date.now()+60000)}).where(eq(s.syncLocks.sourceConfigId,sourceId));
      return changedStat('PPD','18.03');
    }},options);
    expect(result.errorCode).toBe('LOCK_EXPIRED');expect(await snapshot()).toEqual(before);
    const [lock]=await context.db.select().from(s.syncLocks);expect(lock.ownerRunId).toBe(newOwner);
    await context.db.delete(s.syncLocks).where(eq(s.syncLocks.ownerRunId,newOwner));
  });
  it('an expired lease during writes rolls back reports, changes and histories',async()=>{
    await context.client.exec("create function test_expire_import_lease() returns trigger language plpgsql as $$ begin update sync_locks set lease_until=now()-interval '1 second'; return new; end $$; create trigger test_expire_import_lease after insert on player_stats_history for each row execute function test_expire_import_lease();");
    try{await refusedWithoutChanges(changedStat('PPD','18.04'),'LOCK_EXPIRED');}
    finally{await context.client.exec('drop trigger test_expire_import_lease on player_stats_history; drop function test_expire_import_lease();');}
  });
  it('overlapping requests through independent DB clients never fetch or write under the same lease',async()=>{
    // PGlite queues SQL on one isolated connection. This proves request/lease
    // behavior, not cross-process PostgreSQL MVCC; that remains a separate test.
    const queries:string[]=[];
    const secondDb=drizzle(context.client,{schema:s,logger:{logQuery(query){queries.push(query);}}}) as unknown as Database;
    let fetched!:()=>void,release!:()=>void;
    const entered=new Promise<void>(resolve=>{fetched=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const bundle=changedStat('PPD','18.05');
    const first=synchronize(context.db,sourceId,{fetchBundle:async()=>{fetched();await gate;return bundle;}},options);
    await entered;
    const before=await snapshot();let secondFetched=false;
    try{
      const second=await synchronize(secondDb,sourceId,{fetchBundle:async()=>{secondFetched=true;return bundle;}},options);
      expect(second.errorCode).toBe('SYNC_BUSY');expect(secondFetched).toBe(false);expect(await snapshot()).toEqual(before);
    }finally{release();}
    expect((await first).status).not.toBe('failed');
    const after=await snapshot(),duplicate=await synchronize(secondDb,sourceId,{fetchBundle:async()=>bundle},options);
    expect(duplicate.created+duplicate.updated).toBe(0);expect(await snapshot()).toEqual(after);
    expect(queries.some(query=>query.includes('"sync_locks"')&&query.endsWith(' for update'))).toBe(true);
    expect(await context.db.select().from(s.playerSeasonStats)).toHaveLength(39);
    expect(await context.db.select().from(s.syncLocks)).toHaveLength(0);
  });
  it('a parser-version recheck is committed once and remains idempotent',async()=>{
    const bundle=changedStat('PPD','18.05');
    await context.db.update(s.sourceReports).set({parserVersion:'nsjl-leagueleader-1.0.0'});
    expect((await run(bundle)).status).not.toBe('failed');
    const currentReports=await context.db.select().from(s.sourceReports).where(eq(s.sourceReports.sha256,bundle.results.sha256));
    expect(currentReports[0].parserVersion).toBe(PARSER_VERSION);
    const before=await snapshot(),duplicate=await run(bundle);
    expect(duplicate.created+duplicate.updated).toBe(0);expect(await snapshot()).toEqual(before);
  });
  it('a replacement worker can finish after lease expiry while the stale worker cannot commit',async()=>{
    const secondDb=drizzle(context.client,{schema:s}) as unknown as Database;
    let fetched!:()=>void,release!:()=>void;
    const entered=new Promise<void>(resolve=>{fetched=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const first=synchronize(context.db,sourceId,{fetchBundle:async()=>{fetched();await gate;return changedStat('PPD','18.05');}},options);
    await entered;
    let accepted:Awaited<ReturnType<typeof snapshot>>|undefined;
    try{
      await context.db.update(s.syncLocks).set({leaseUntil:new Date(Date.now()-1000)}).where(eq(s.syncLocks.sourceConfigId,sourceId));
      const bundle=changedBundle(b=>{b.results.html=changedStat('PPD','18.05').results.html+'<!-- isolated replacement worker -->';});
      const second=await synchronize(secondDb,sourceId,{fetchBundle:async()=>bundle},options);
      expect(second.status).not.toBe('failed');expect(second.created).toBeGreaterThan(0);
      accepted=await snapshot();
    }finally{release();}
    const stale=await first;
    expect(stale.status).toBe('failed');expect(stale.errorCode).toBe('LOCK_EXPIRED');
    expect(await snapshot()).toEqual(accepted);expect(await context.db.select().from(s.syncLocks)).toHaveLength(0);
  });
  it('cache invalidation failure after commit never reports a transaction rollback',async()=>{
    const bundle=changedStat('PPD','18.06');
    const result=await synchronize(context.db,sourceId,{fetchBundle:async()=>bundle},{...options,invalidate:async()=>{throw new Error('isolated cache failure');}});
    expect(result.status).toBe('warning');expect(result.errorCode).toBeUndefined();
    const [log]=await context.db.select().from(s.syncRuns).where(eq(s.syncRuns.id,result.runId));
    expect(log.status).toBe('warning');expect(log.resultReportId).not.toBeNull();
    const [colin]=await context.db.select().from(s.externalPlayers).where(eq(s.externalPlayers.normalizedName,'colin tielemans'));
    const [stats]=await context.db.select().from(s.playerSeasonStats).where(eq(s.playerSeasonStats.externalPlayerId,colin.id));
    expect(stats.x01Ppd).toBe('18.06');
  });
  it('imported updates cannot overwrite a hand-created match with the same source key',async()=>{
    const [match]=await context.db.select().from(s.matches);
    const [manual]=await context.db.insert(s.matches).values({...match,id:crypto.randomUUID(),slug:'isolated-manual-match',source:'manual',notes:'Manual fixture',homeScore:null,awayScore:null,resultReportId:null,scheduleReportId:null}).returning();
    const bundle=changedBundle(b=>{b.results.html=changedStat('PPD','18.06').results.html;b.schedule.html=b.schedule.html.replaceAll('10/01/2026','10/02/2026');});
    expect((await run(bundle)).status).not.toBe('failed');
    expect((await context.db.select().from(s.matches).where(eq(s.matches.id,manual.id)))[0]).toEqual(manual);
  });
  it('Tim and both competitions remain isolated after rejected and repeated imports',async()=>{
    const [tim]=await context.db.select().from(s.players).where(eq(s.players.slug,'tim-goossens'));
    const [external]=await context.db.select().from(s.externalPlayers).where(eq(s.externalPlayers.normalizedName,normalizeName('Tim Goossens')));
    const [nsjl]=await context.db.select().from(s.teamSeasons).where(eq(s.teamSeasons.isPrimaryNsjl,true));
    expect(external.playerId).toBeNull();expect(external.teamSeasonId).not.toBe(nsjl.id);
    expect(await context.db.select().from(s.playerTeamSeasons).where(eq(s.playerTeamSeasons.playerId,tim.id))).toHaveLength(0);
    expect(await context.db.select().from(s.playerAliases).where(eq(s.playerAliases.playerId,tim.id))).toHaveLength(0);
    expect(await context.db.select().from(s.legacyPlayerStats)).toHaveLength(4);
    expect(await context.db.select().from(s.competitions)).toHaveLength(2);
    expect((await context.db.select().from(s.sourceConfigs))[0].enabled).toBe(false);
  });
});
