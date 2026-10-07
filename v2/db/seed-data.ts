import { and, eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Database } from './client';
import * as s from './schema';
import legacy from '@/data/legacy.json';
import {normalizeName,NSJL_NAME} from '@/lib/bullshooter/parser';
import {slugify,synchronize} from '@/lib/sync/service';

export async function seedLegacy(db:Database){
  await db.transaction(async tx=>{
    await tx.insert(s.competitions).values([{name:'Bullshooter Reguliere Competitie',slug:'bullshooter-regulier',source:'bullshooter',externalIdentifier:'REU'},{name:'NSJL Zomercompetitie',slug:'nsjl-zomer',source:'legacy-website'}]).onConflictDoNothing();
    const [regular]=await tx.select().from(s.competitions).where(eq(s.competitions.slug,'bullshooter-regulier'));
    const [summer]=await tx.select().from(s.competitions).where(eq(s.competitions.slug,'nsjl-zomer'));
    await tx.insert(s.seasons).values([{competitionId:regular.id,name:'2026/2027',isCurrent:true,startsAt:'2026-09-24',endsAt:'2027-04-22'},{competitionId:summer.id,name:'2026',isCurrent:true,startsAt:'2026-05-28',endsAt:'2026-08-06',status:'archived'}]).onConflictDoNothing();
    const [rs]=await tx.select().from(s.seasons).where(and(eq(s.seasons.competitionId,regular.id),eq(s.seasons.name,'2026/2027')));
    const [ss]=await tx.select().from(s.seasons).where(and(eq(s.seasons.competitionId,summer.id),eq(s.seasons.name,'2026')));
    await tx.insert(s.divisions).values([{seasonId:rs.id,name:'Reusel 3e Divisie',slug:'reusel-3',externalIdentifier:'REU327',sourceUrl:'https://www.bullshooterevents.nl/comp_reu3_uitslagen.html'},{seasonId:ss.id,name:'Zomercompetitie koppels',slug:'zomer-koppels'}]).onConflictDoNothing();
    const [rd]=await tx.select().from(s.divisions).where(eq(s.divisions.seasonId,rs.id));const [sd]=await tx.select().from(s.divisions).where(eq(s.divisions.seasonId,ss.id));
    await tx.insert(s.teams).values({name:NSJL_NAME,normalizedName:normalizeName(NSJL_NAME),slug:'no-skill-just-luck-reu327',isNsjl:true}).onConflictDoNothing();
    const [team]=await tx.select().from(s.teams).where(eq(s.teams.slug,'no-skill-just-luck-reu327'));
    await tx.insert(s.teamSeasons).values({teamId:team.id,divisionId:rd.id,isPrimaryNsjl:true}).onConflictDoNothing();
    const [membership]=await tx.select().from(s.teamSeasons).where(and(eq(s.teamSeasons.teamId,team.id),eq(s.teamSeasons.divisionId,rd.id)));
    await tx.insert(s.teamAliases).values({divisionId:rd.id,teamSeasonId:membership.id,source:'bullshooter',externalName:NSJL_NAME,normalizedName:normalizeName(NSJL_NAME)}).onConflictDoNothing();
    for(const p of legacy.players){
      const slug=slugify(p.name),parts=p.name.split(' ');
      await tx.insert(s.players).values({firstName:parts[0],lastName:parts.slice(1).join(' '),displayName:p.name,slug,sortOrder:p.sortOrder,bio:'Onderdeel van de originele NSJL-teamwebsite. Geen garanties, wel gezelligheid.'}).onConflictDoNothing();
      const [player]=await tx.select().from(s.players).where(eq(s.players.slug,slug));
      await tx.insert(s.legacyPlayerStats).values({playerId:player.id,originFile:'legacy/index.html',ppd:p.stats.PPD.toFixed(2),mpr:p.stats.MPR.toFixed(2),wins:p.stats.Wins,hats:p.stats.Hats,verificationStatus:'unverified'}).onConflictDoNothing();
      // Evidence-backed mappings only. Tim is deliberately not added to NSJL's regular membership.
      if(['Colin Tielemans','Mike van de Voort','Job van de Voort'].includes(p.name)){
        await tx.insert(s.playerTeamSeasons).values({playerId:player.id,teamSeasonId:membership.id,role:p.name==='Mike van de Voort'?'captain':'player'}).onConflictDoNothing();
        await tx.insert(s.playerAliases).values({playerId:player.id,source:'bullshooter',divisionId:rd.id,teamSeasonId:membership.id,externalName:p.name,normalizedName:normalizeName(p.name)}).onConflictDoNothing();
      }
    }
    for(const row of legacy.standings){
      const slug=`zomer-2026-${slugify(row.team)}`;
      await tx.insert(s.teams).values({name:row.team,normalizedName:normalizeName(row.team),slug,isNsjl:row.team==='Tim en Mike'}).onConflictDoNothing();
      const [st]=await tx.select().from(s.teams).where(eq(s.teams.slug,slug));
      await tx.insert(s.teamSeasons).values({teamId:st.id,divisionId:sd.id,isPrimaryNsjl:row.team==='Tim en Mike'}).onConflictDoNothing();
      const [ts]=await tx.select().from(s.teamSeasons).where(and(eq(s.teamSeasons.teamId,st.id),eq(s.teamSeasons.divisionId,sd.id)));
      await tx.insert(s.standings).values({teamSeasonId:ts.id,position:row.position,positionBasis:'legacy_snapshot',games:row.games,wins:row.wins,losses:row.losses,winPercentage:(row.wins/row.games*100).toFixed(2),sourceReportId:null,syncedAt:new Date('2026-07-23T16:07:21Z')}).onConflictDoNothing();
    }
    for(const n of legacy.news){
      const day=n.date.startsWith('17')?'17':'23';
      await tx.insert(s.newsPosts).values({title:n.title,slug:slugify(n.title),excerpt:n.excerpt,content:n.excerpt,category:n.category,status:'published',publishedAt:new Date(`2026-07-${day}T10:00:00+02:00`)}).onConflictDoNothing();
    }
    const [legacyEvent]=await tx.select().from(s.events).where(eq(s.events.title,'Zomercompetitie — originele agenda'));
    if(!legacyEvent)await tx.insert(s.events).values({title:'Zomercompetitie — originele agenda',description:'Behouden agenda-item uit de oorspronkelijke website. Historisch; geen reguliere Bullshooterwedstrijd.',startsAt:new Date('2026-07-23T20:00:00+02:00'),location:'Café Bar The Saloon, Reusel',eventType:'team_event'});
    for(const [key,valueText]of Object.entries({site_name:'NSJL — No Skill Just Luck',contact_email:'info@nsjl.nl',home_venue:'Café Bar The Saloon, Reusel',hero_title:'NO SKILL. JUST LUCK.',hero_subtitle:legacy.hero}))await tx.insert(s.siteSettings).values({key,valueText}).onConflictDoNothing();
    await tx.insert(s.sourceConfigs).values({divisionId:rd.id,provider:'bullshooter',resultsEntryUrl:'https://www.bullshooterevents.nl/comp_reu3_uitslagen.html',scheduleEntryUrl:'https://www.bullshooterevents.nl/comp_reu3_speelschema.html',teaminfoEntryUrl:'https://www.bullshooterevents.nl/comp_reu3_teaminfo.html',enabled:false,expectedLeagueCode:'REU327',expectedSourceDivision:'A'}).onConflictDoNothing();
  });
}
export async function importAuditSnapshot(db:Database){
  const [config]=await db.select().from(s.sourceConfigs).where(eq(s.sourceConfigs.expectedLeagueCode,'REU327'));
  const existing=await db.select().from(s.sourceReports).where(eq(s.sourceReports.sourceConfigId,config.id));if(existing.length)return;
  const results=await readFile(path.join(process.cwd(),'tests/fixtures/results-2026-10-03.html'),'utf8'),schedule=await readFile(path.join(process.cwd(),'tests/fixtures/schedule-2026-08-31.html'),'utf8');
  const result=await synchronize(db,config.id,{async fetchBundle(){return{results:{url:'https://www.bullshooterevents.nl/files/Competitie2627_Uitslagen/261003_REU3.html',html:results,sha256:createHash('sha256').update(results).digest('hex')},schedule:{url:"https://www.bullshooterevents.nl/files/Competitie2627_Speelschema's/Speelschema_REU3.html",html:schedule,sha256:createHash('sha256').update(schedule).digest('hex')}};}},{trigger:'audit-seed',cooldownMs:0});
  if(result.status==='failed')throw new Error(`Audit snapshot seed failed: ${result.errorCode}`);
}
