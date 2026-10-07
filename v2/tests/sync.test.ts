import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {and,eq,sql} from 'drizzle-orm';
import {createHash} from 'node:crypto';
import {testDatabase} from './database';
import {fixtureBundle} from './fixtures';
import {synchronize,scopedPlayerAlias} from '@/lib/sync/service';
import * as s from '@/db/schema';
let context:Awaited<ReturnType<typeof testDatabase>>,sourceId:string;
beforeAll(async()=>{context=await testDatabase();[sourceId]=(await context.db.select().from(s.sourceConfigs)).map(c=>c.id);});
afterAll(async()=>{await context?.client.close();});
const provider=()=>({fetchBundle:async()=>fixtureBundle()});
describe('Real PostgreSQL migrations and sync transactions',()=>{
  it('migrations enable RLS and preserve separate legacy datasets',async()=>{
    expect((await context.db.select().from(s.competitions)).map(c=>c.slug)).toEqual(expect.arrayContaining(['nsjl-zomer','bullshooter-regulier']));
    expect(await context.db.select().from(s.legacyPlayerStats)).toHaveLength(4);
    const rows=await context.client.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname='users'");expect(rows.rows[0].relrowsecurity).toBe(true);
  });
  it('first import commits schedule, standings, stats, histories and logs',async()=>{
    const result=await synchronize(context.db,sourceId,provider(),{trigger:'manual',cooldownMs:0});expect(result.status).not.toBe('failed');
    expect(await context.db.select().from(s.matches)).toHaveLength(90);expect(await context.db.select().from(s.standingsHistory)).toHaveLength(9);expect(await context.db.select().from(s.playerStatsHistory)).toHaveLength(39);
    expect((await context.db.select().from(s.externalPlayers)).filter(p=>!p.playerId).length).toBeGreaterThan(0);
  });
  it('duplicate import adds no source reports, matches or histories',async()=>{
    const before=await context.db.select().from(s.matches);const reports=await context.db.select().from(s.sourceReports);const history=await context.db.select().from(s.playerStatsHistory);
    const result=await synchronize(context.db,sourceId,provider(),{trigger:'manual',cooldownMs:0});expect(result.created).toBe(0);expect(result.updated).toBe(0);expect(result.message).toBe('Geen nieuwe gegevens gevonden.');
    expect(await context.db.select().from(s.matches)).toHaveLength(before.length);expect(await context.db.select().from(s.sourceReports)).toHaveLength(reports.length);expect(await context.db.select().from(s.playerStatsHistory)).toHaveLength(history.length);
  });
  it('Tim profile does not leak Saloon 5.2 scores into NSJL statistics',async()=>{
    const [tim]=await context.db.select().from(s.players).where(eq(s.players.slug,'tim-goossens'));const [external]=await context.db.select().from(s.externalPlayers).where(eq(s.externalPlayers.normalizedName,'tim goossens'));
    expect(external.playerId).toBeNull();expect(await context.db.select().from(s.playerTeamSeasons).where(eq(s.playerTeamSeasons.playerId,tim.id))).toHaveLength(0);
    const [nsjl]=await context.db.select().from(s.teamSeasons).where(eq(s.teamSeasons.isPrimaryNsjl,true));expect(external.teamSeasonId).not.toBe(nsjl.id);
    const aliases=await context.db.select().from(s.playerAliases);expect(scopedPlayerAlias(aliases,'Tim Goossens',external.teamSeasonId)).toBeNull();
    expect(scopedPlayerAlias([{normalizedName:'tim goossens',teamSeasonId:nsjl.id,playerId:tim.id}],'Tim Goossens',external.teamSeasonId)).toBeNull();
  });
  it('missing/fault page cannot clear valid data; failed run survives',async()=>{
    const before=await context.db.select().from(s.standings);const bad={fetchBundle:async()=>{const b=fixtureBundle();b.results.html='';return b;}};
    const result=await synchronize(context.db,sourceId,bad,{trigger:'manual',cooldownMs:0});expect(result.status).toBe('failed');expect(await context.db.select().from(s.standings)).toEqual(before);
    const [log]=await context.db.select().from(s.syncRuns).where(eq(s.syncRuns.id,result.runId));expect(log.errorCode).toBe('EMPTY_DOCUMENT');expect(await context.db.select().from(s.syncLocks)).toHaveLength(0);
  });
  it('old report and changed season do not overwrite data',async()=>{
    for(const mutation of [(h:string)=>h.replaceAll('10/03/2026','10/02/2026'),(h:string)=>h.replaceAll('REU327','REU328').replaceAll('2627','2728')]){
      const b=fixtureBundle();b.results.html=mutation(b.results.html);b.results.sha256=createHash('sha256').update(b.results.html).digest('hex');const result=await synchronize(context.db,sourceId,{fetchBundle:async()=>b},{trigger:'manual',cooldownMs:0});expect(result.status).toBe('failed');expect(['OLD_REPORT','SEASON_REVIEW_REQUIRED']).toContain(result.errorCode);
    }
  });
  it('a delayed schedule changes date, keeps pairing identity and completed results',async()=>{
    const [before]=await context.db.select().from(s.matches).where(and(eq(s.matches.weekNumber,2),sql`${s.matches.importKey} like '%no skill just luck%'`));
    const b=fixtureBundle();b.schedule.html=b.schedule.html.replaceAll('10/01/2026','10/02/2026');b.schedule.sha256=createHash('sha256').update(b.schedule.html).digest('hex');
    const result=await synchronize(context.db,sourceId,{fetchBundle:async()=>b},{trigger:'manual',cooldownMs:0});expect(result.status).not.toBe('failed');
    const [after]=await context.db.select().from(s.matches).where(eq(s.matches.id,before.id));expect(after.scheduledDate).toBe('2026-10-02');expect(after.playedDate).toBe('2026-10-01');expect(after.status).toBe('completed');
  });
  it('lock prevents overlapping manual/cron imports',async()=>{
    await context.db.insert(s.syncLocks).values({sourceConfigId:sourceId,ownerRunId:crypto.randomUUID(),leaseUntil:new Date(Date.now()+60000)});
    let fetched=false;const result=await synchronize(context.db,sourceId,{fetchBundle:async()=>{fetched=true;return fixtureBundle();}},{trigger:'manual',cooldownMs:0});expect(result.errorCode).toBe('SYNC_BUSY');expect(fetched).toBe(false);
    await context.db.delete(s.syncLocks).where(eq(s.syncLocks.sourceConfigId,sourceId));
  });
  it('database rejects cross-division matches and mutable audit logs',async()=>{
    const ts=await context.db.select().from(s.teamSeasons);const regular=ts.find(t=>t.divisionId===ts.find(x=>x.isPrimaryNsjl)!.divisionId)!;const other=ts.find(t=>t.divisionId!==regular.divisionId)!;
    await expect(context.db.insert(s.matches).values({slug:'invalid',divisionId:regular.divisionId,roundKey:'999',importKey:'invalid',source:'test',homeTeamSeasonId:regular.id,awayTeamSeasonId:other.id})).rejects.toThrow();
    const [log]=await context.db.insert(s.auditLogs).values({action:'test',entityType:'test',summary:'Append-only'}).returning();await expect(context.db.update(s.auditLogs).set({summary:'change'}).where(eq(s.auditLogs.id,log.id))).rejects.toThrow();
  });
});
