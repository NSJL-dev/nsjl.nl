import 'server-only';
import {z} from 'zod';
import {and,eq} from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {slugify} from '@/lib/sync/service';
import {AccessError} from '@/lib/security';
import {changeMedia} from '@/lib/media';
const uuid=z.uuid();const short=z.string().trim().min(1).max(150);const text=z.string().max(30000);const url=z.url().refine(v=>['https:','http:'].includes(new URL(v).protocol));
const optionalUuid=z.preprocess(v=>v===''?undefined:v,uuid.optional());
const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T12:00:00Z`);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;});
const schemas={
  spelers:z.object({displayName:short,firstName:short,lastName:short,nickname:z.string().max(100).default(''),bio:text.default(''),photoMediaId:optionalUuid,sortOrder:z.coerce.number().int().min(0).max(999),isActive:z.string().optional()}),
  nieuws:z.object({title:short,slug:z.string().regex(/^[a-z0-9-]+$/).max(180).optional(),excerpt:z.string().trim().min(1).max(800),content:text.min(1),category:short,status:z.enum(['draft','published','archived']),publishedAt:z.string().optional(),featuredMediaId:optionalUuid}),
  agenda:z.object({title:short,description:text.default(''),startsAt:z.string().min(1),endsAt:z.string().optional(),location:z.string().max(300).default(''),eventType:z.enum(['training','tournament','team_event','other'])}),
  sponsors:z.object({name:short,websiteUrl:z.preprocess(v=>v===''?undefined:v,url.optional()),description:text.default(''),sortOrder:z.coerce.number().int().min(0).max(999),isActive:z.string().optional(),logoMediaId:optionalUuid}),
};
export async function adminMutation(db:Database,actorId:string,resource:string,form:Record<string,unknown>){
  const action=String(form.action||'save'),recordId=form.id?uuid.parse(form.id):undefined;
  if(resource==='media'){const input=z.object({id:uuid,status:z.enum(['private','published','archived']),altText:z.string().trim().min(1).max(500)}).parse(form);await changeMedia(db,actorId,input.id,input.status,input.altText);return;}
  await db.transaction(async tx=>{
    let entityId=recordId;
    if(resource==='koppelingen'){
      const input=z.object({externalId:uuid,playerId:uuid}).parse(form);
      const [external]=await tx.select().from(s.externalPlayers).where(eq(s.externalPlayers.id,input.externalId));if(!external)throw new AccessError(404,'Bronspeler niet gevonden.');
      const [player]=await tx.select().from(s.players).where(eq(s.players.id,input.playerId));if(!player)throw new AccessError(404,'Speler niet gevonden.');
      const [team]=await tx.select().from(s.teamSeasons).where(eq(s.teamSeasons.id,external.teamSeasonId));
      await tx.insert(s.playerTeamSeasons).values({playerId:player.id,teamSeasonId:team.id}).onConflictDoNothing();
      const [alias]=await tx.select().from(s.playerAliases).where(and(eq(s.playerAliases.source,external.source),eq(s.playerAliases.teamSeasonId,team.id),eq(s.playerAliases.normalizedName,external.normalizedName)));
      if(alias&&alias.playerId!==player.id)throw new AccessError(409,'Deze alias hoort al bij een ander profiel.');
      await tx.insert(s.playerAliases).values({playerId:player.id,source:external.source,divisionId:team.divisionId,teamSeasonId:team.id,externalName:external.externalName,normalizedName:external.normalizedName}).onConflictDoNothing();
      await tx.update(s.externalPlayers).set({playerId:player.id,updatedAt:new Date()}).where(eq(s.externalPlayers.id,external.id));
      await tx.update(s.playerSeasonStats).set({playerId:player.id,updatedAt:new Date()}).where(eq(s.playerSeasonStats.externalPlayerId,external.id));entityId=external.id;
    }else if(resource==='spelers'){
      if(action==='archive'&&recordId){await tx.update(s.players).set({isActive:false,updatedAt:new Date()}).where(eq(s.players.id,recordId));}
      else{const input=schemas.spelers.parse(form),values={...input,photoMediaId:input.photoMediaId??null,slug:slugify(input.displayName),isActive:input.isActive==='on',updatedAt:new Date()};if(recordId)await tx.update(s.players).set(values).where(eq(s.players.id,recordId));else{const [r]=await tx.insert(s.players).values(values).returning();entityId=r.id;}}
    }else if(resource==='nieuws'){
      if(action==='archive'&&recordId)await tx.update(s.newsPosts).set({status:'archived',updatedAt:new Date()}).where(eq(s.newsPosts.id,recordId));
      else{
        const input=schemas.nieuws.parse({...form,slug:form.slug||undefined}),publishedAt=input.publishedAt?new Date(input.publishedAt):input.status==='published'?new Date():null;
        if(publishedAt&&Number.isNaN(publishedAt.valueOf()))throw new AccessError(400,'Ongeldige publicatiedatum.');
        const values={...input,slug:input.slug||slugify(input.title),content:sanitizeHtml(input.content,{allowedTags:['p','br','strong','em','h2','h3','ul','ol','li','a'],allowedAttributes:{a:['href','title']},allowedSchemes:['https','mailto']}),publishedAt,featuredMediaId:input.featuredMediaId??null,authorId:actorId,updatedAt:new Date()};
        if(recordId)await tx.update(s.newsPosts).set(values).where(eq(s.newsPosts.id,recordId));else{const [r]=await tx.insert(s.newsPosts).values(values).returning();entityId=r.id;}
      }
    }else if(resource==='agenda'){
      if(action==='archive'&&recordId){await tx.update(s.events).set({isActive:false,updatedAt:new Date()}).where(eq(s.events.id,recordId));}
      else{
      const input=schemas.agenda.parse(form),startsAt=new Date(input.startsAt),endsAt=input.endsAt?new Date(input.endsAt):null;
      if(Number.isNaN(startsAt.valueOf())||(endsAt&&(Number.isNaN(endsAt.valueOf())||endsAt<startsAt)))throw new AccessError(400,'Controleer de begin- en einddatum.');
      const values={...input,startsAt,endsAt,isActive:true,createdBy:actorId,updatedAt:new Date()};if(recordId)await tx.update(s.events).set(values).where(eq(s.events.id,recordId));else{const [r]=await tx.insert(s.events).values(values).returning();entityId=r.id;}}
    }else if(resource==='sponsors'){
      if(action==='archive'&&recordId)await tx.update(s.sponsors).set({isActive:false,updatedAt:new Date()}).where(eq(s.sponsors.id,recordId));
      else{const input=schemas.sponsors.parse(form),values={...input,isActive:input.isActive==='on',websiteUrl:input.websiteUrl??null,logoMediaId:input.logoMediaId??null,updatedAt:new Date()};if(recordId)await tx.update(s.sponsors).set(values).where(eq(s.sponsors.id,recordId));else{const [r]=await tx.insert(s.sponsors).values(values).returning();entityId=r.id;}}
    }else if(resource==='bronconfiguratie'){
      if(!recordId)throw new AccessError(400,'Bronconfiguratie ontbreekt.');await tx.update(s.sourceConfigs).set({enabled:form.enabled==='on',updatedAt:new Date()}).where(eq(s.sourceConfigs.id,recordId));
    }else if(resource==='instellingen'){
      const allowed=['site_name','contact_email','home_venue','hero_title','hero_subtitle','instagram_url','facebook_url'];const key=z.enum(allowed as [string,...string[]]).parse(form.key),valueText=z.string().max(1000).parse(form.valueText);
      if(key==='contact_email')z.email().parse(valueText);if(key.endsWith('_url')&&valueText)url.parse(valueText);
      await tx.insert(s.siteSettings).values({key,valueText}).onConflictDoUpdate({target:s.siteSettings.key,set:{valueText,updatedAt:new Date()}});
    }else if(resource==='wedstrijden'||resource==='stand'||resource==='statistieken'){
      const input=z.object({targetId:uuid,fieldName:z.string(),value:z.string().max(1000),reason:z.string().trim().min(5).max(500)}).parse(form);
      const allowed=resource==='wedstrijden'?['scheduledDate','startTime','status','notes','homeScore','awayScore']:resource==='stand'?['position','wins','games']:['x01Ppd','cricketMpr'];
      if(!allowed.includes(input.fieldName))throw new AccessError(400,'Correctieveld niet toegestaan.');
      const fk=resource==='wedstrijden'?{matchId:input.targetId}:resource==='stand'?{teamSeasonId:input.targetId}:{playerStatId:input.targetId};
      const dateValue=input.fieldName==='scheduledDate'?isoDate.parse(input.value):null;
      if(input.fieldName==='startTime'&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.value))throw new AccessError(400,'Ongeldige tijd.');
      if(input.fieldName==='status'&&!['scheduled','completed','postponed','cancelled','awaiting_result'].includes(input.value))throw new AccessError(400,'Ongeldige wedstrijdstatus.');
      const numeric=['homeScore','awayScore','position','wins','games','x01Ppd','cricketMpr'].includes(input.fieldName);
      if(numeric){const n=z.coerce.number().min(0).max(10000).parse(input.value);if(!['x01Ppd','cricketMpr'].includes(input.fieldName)&&!Number.isInteger(n))throw new AccessError(400,'Gebruik een geheel getal.');}
      // Deactivate previous correction for exactly the same field; source values remain intact.
      const target=resource==='wedstrijden'?eq(s.dataOverrides.matchId,input.targetId):resource==='stand'?eq(s.dataOverrides.teamSeasonId,input.targetId):eq(s.dataOverrides.playerStatId,input.targetId);
      await tx.update(s.dataOverrides).set({isActive:false}).where(and(target,eq(s.dataOverrides.fieldName,input.fieldName)));
      const [r]=await tx.insert(s.dataOverrides).values({...fk,fieldName:input.fieldName,numericValue:numeric?String(Number(input.value)):null,dateValue,textValue:!numeric&&!dateValue?input.value:null,reason:input.reason,createdBy:actorId}).returning();entityId=r.id;
    }else throw new AccessError(404,'Onbekende beheeractie.');
    await tx.insert(s.auditLogs).values({actorUserId:actorId,action:`${resource}.${action}`,entityType:resource,entityId:entityId??null,summary:'Beheerwijziging opgeslagen; inhoud en secrets worden niet gelogd.'});
  });
}
