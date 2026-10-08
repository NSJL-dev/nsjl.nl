import 'server-only';
import {z} from 'zod';
import {and,eq} from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {slugify} from '@/lib/sync/service';
import {AccessError} from '@/lib/security';
import {changeMedia} from '@/lib/media';
import {assertAdminActor} from './authorization';
import {readEnv} from '@/lib/env';
import {isManagedResource,lockManagedRecord,assertRecordRevision,assertRecordConfirmation,assertTypedConfirmation,recordArchived,deleteEditorialRecord,detachMedia} from './record-guard';
import {deleteMedia} from './media-deletion';
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
  await assertAdminActor(db,actorId);
  try { await applyMutation(db,actorId,resource,form); }
  catch (error) {
    // The failed transaction is already rolled back. Never log names, submitted
    // content, tokens or raw exception text. Anonymous requests do not reach here.
    if(form.action==='delete') {
      const id=uuid.safeParse(form.id),known=isManagedResource(resource);
      await db.insert(s.auditLogs).values({actorUserId:actorId,action:`${known?resource:'beheer'}.delete.denied`,entityType:known?resource:'beheer',entityId:id.success?id.data:null,summary:`Definitief verwijderen geweigerd; controle ${error instanceof AccessError?error.status:'serverfout'}. Bestaande relaties worden niet automatisch verwijderd.`});
    }
    throw error;
  }
}
async function applyMutation(db:Database,actorId:string,resource:string,form:Record<string,unknown>){
  const action=z.enum(['save','archive','delete','detach']).parse(form.action||'save'),recordId=form.id?uuid.parse(form.id):undefined;
  if(action!=='save'&&!recordId)throw new AccessError(400,'Kies het juiste record in de beheerlijst.');
  if(action==='archive'&&!['spelers','nieuws','agenda','sponsors'].includes(resource))throw new AccessError(400,'Deze beheeractie ondersteunt geen archivering.');
  if(action==='delete'&&!isManagedResource(resource))throw new AccessError(400,'Definitief verwijderen is voor dit onderdeel niet toegestaan.');
  if(action==='detach'&&!['spelers','nieuws','sponsors'].includes(resource))throw new AccessError(400,'Dit onderdeel ondersteunt geen afbeeldingskoppeling.');
  if(resource==='bronconfiguratie'&&!readEnv().SYNC_ENABLED)throw new AccessError(403,'Bronconfiguratie blijft geblokkeerd zolang synchronisatie is uitgeschakeld.');
  if(resource==='media'){
    if(action==='delete'){await deleteMedia(db,actorId,recordId!,form);return;}
    const input=z.object({id:uuid,status:z.enum(['private','published','archived']),altText:z.string().trim().min(1).max(500)}).parse(form);await changeMedia(db,actorId,input.id,input.status,input.altText,form);return;
  }
  await db.transaction(async tx=>{
    let entityId=recordId,auditAction=action;
    const existing=recordId&&isManagedResource(resource)?await lockManagedRecord(tx,resource,recordId):undefined;
    if(recordId&&isManagedResource(resource)&&!existing)throw new AccessError(404,'Item niet gevonden. Het is mogelijk al verwijderd; ververs de beheerlijst.');
    if(existing){
      assertRecordRevision(existing,form);
      if(action!=='save')assertRecordConfirmation(existing,form);
      if(action==='delete'||action==='detach')assertTypedConfirmation(existing,form);
      if(action==='save'&&!recordArchived(existing)&&((resource==='nieuws'&&form.status==='archived')||(['spelers','sponsors'].includes(resource)&&form.isActive!=='on'))){assertRecordConfirmation(existing,form);auditAction='archive';}
      if(action==='archive'&&recordArchived(existing))throw new AccessError(409,'Dit item is al gearchiveerd. Ververs de beheerlijst.');
    }
    if(recordId&&resource==='bronconfiguratie'&&!(await tx.select({id:s.sourceConfigs.id}).from(s.sourceConfigs).where(eq(s.sourceConfigs.id,recordId)))[0])throw new AccessError(404,'Bronconfiguratie niet gevonden.');
    async function publishedMedia(id:string|undefined){
      if(!id)return;
      const [row]=await tx.select().from(s.media).where(eq(s.media.id,id));
      if(!row||row.status!=='published'||row.mimeType!=='image/webp'||row.bucket!==readEnv().MEDIA_PRIVATE_BUCKET)throw new AccessError(400,'Kies een gepubliceerde, gecontroleerde afbeelding.');
    }
    if(action==='delete'&&existing&&isManagedResource(resource)){
      await deleteEditorialRecord(tx,resource,existing);
    }else if(action==='detach'&&existing&&isManagedResource(resource)){
      await detachMedia(tx,resource,existing,form);
    }else if(resource==='koppelingen'){
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
      else{const input=schemas.spelers.parse(form);await publishedMedia(input.photoMediaId);const values={...input,photoMediaId:input.photoMediaId??null,slug:existing&&'displayName'in existing?existing.slug:slugify(input.displayName),isActive:input.isActive==='on',updatedAt:new Date()};if(recordId)await tx.update(s.players).set(values).where(eq(s.players.id,recordId));else{const [r]=await tx.insert(s.players).values(values).returning();entityId=r.id;}}
    }else if(resource==='nieuws'){
      if(action==='archive'&&recordId)await tx.update(s.newsPosts).set({status:'archived',updatedAt:new Date()}).where(eq(s.newsPosts.id,recordId));
      else{
        const input=schemas.nieuws.parse({...form,slug:form.slug||undefined});await publishedMedia(input.featuredMediaId);
        if(input.publishedAt)z.iso.datetime({offset:true}).parse(input.publishedAt);
        const publishedAt=input.publishedAt?new Date(input.publishedAt):input.status==='published'?(existing&&'publishedAt'in existing?existing.publishedAt:null)??new Date():null;
        if(publishedAt&&Number.isNaN(publishedAt.valueOf()))throw new AccessError(400,'Ongeldige publicatiedatum.');
        const values={...input,slug:input.slug||(existing&&'publishedAt'in existing?existing.slug:slugify(input.title)),content:sanitizeHtml(input.content,{allowedTags:['p','br','strong','em','h2','h3','ul','ol','li','a'],allowedAttributes:{a:['href','title']},allowedSchemes:['https','mailto']}),publishedAt,featuredMediaId:input.featuredMediaId??null,authorId:actorId,updatedAt:new Date()};
        if(!values.content.trim())throw new AccessError(400,'Het bericht moet veilige tekst bevatten.');
        if(recordId)await tx.update(s.newsPosts).set(values).where(eq(s.newsPosts.id,recordId));else{const [r]=await tx.insert(s.newsPosts).values(values).returning();entityId=r.id;}
      }
    }else if(resource==='agenda'){
      if(action==='archive'&&recordId){await tx.update(s.events).set({isActive:false,updatedAt:new Date()}).where(eq(s.events.id,recordId));}
      else{
      const input=schemas.agenda.parse(form);z.iso.datetime({offset:true}).parse(input.startsAt);if(input.endsAt)z.iso.datetime({offset:true}).parse(input.endsAt);const startsAt=new Date(input.startsAt),endsAt=input.endsAt?new Date(input.endsAt):null;
      if(Number.isNaN(startsAt.valueOf())||(endsAt&&(Number.isNaN(endsAt.valueOf())||endsAt<startsAt)))throw new AccessError(400,'Controleer de begin- en einddatum.');
      const values={...input,startsAt,endsAt,isActive:existing&&'startsAt'in existing?existing.isActive:true,createdBy:actorId,updatedAt:new Date()};if(recordId)await tx.update(s.events).set(values).where(eq(s.events.id,recordId));else{const [r]=await tx.insert(s.events).values(values).returning();entityId=r.id;}}
    }else if(resource==='sponsors'){
      if(action==='archive'&&recordId)await tx.update(s.sponsors).set({isActive:false,updatedAt:new Date()}).where(eq(s.sponsors.id,recordId));
      else{const input=schemas.sponsors.parse(form);await publishedMedia(input.logoMediaId);const values={...input,isActive:input.isActive==='on',websiteUrl:input.websiteUrl??null,logoMediaId:input.logoMediaId??null,updatedAt:new Date()};if(recordId)await tx.update(s.sponsors).set(values).where(eq(s.sponsors.id,recordId));else{const [r]=await tx.insert(s.sponsors).values(values).returning();entityId=r.id;}}
    }else if(resource==='bronconfiguratie'){
      if(!recordId)throw new AccessError(400,'Bronconfiguratie ontbreekt.');await tx.update(s.sourceConfigs).set({enabled:form.enabled==='on',updatedAt:new Date()}).where(eq(s.sourceConfigs.id,recordId));
    }else if(resource==='instellingen'){
      const allowed=['site_name','contact_email','home_venue','hero_title','hero_subtitle','instagram_url','facebook_url'];const key=z.enum(allowed as [string,...string[]]).parse(form.key),valueText=z.string().trim().max(1000).parse(form.valueText);
      if(['site_name','contact_email','home_venue','hero_title','hero_subtitle'].includes(key)&&!valueText)throw new AccessError(400,'Deze instelling mag niet leeg zijn.');
      if(key==='contact_email')z.email().parse(valueText);if(key.endsWith('_url')&&valueText)url.parse(valueText);
      await tx.insert(s.siteSettings).values({key,valueText}).onConflictDoUpdate({target:s.siteSettings.key,set:{valueText,valueNumber:null,valueBoolean:null,valueMediaId:null,updatedAt:new Date()}});
    }else if(resource==='wedstrijden'||resource==='stand'||resource==='statistieken'){
      const input=z.object({targetId:uuid,fieldName:z.string(),value:z.string().max(1000),reason:z.string().trim().min(5).max(500)}).parse(form);
      const allowed=resource==='wedstrijden'?['scheduledDate','startTime','status','notes','homeScore','awayScore']:resource==='stand'?['position','wins','games']:['x01Ppd','cricketMpr'];
      if(!allowed.includes(input.fieldName))throw new AccessError(400,'Correctieveld niet toegestaan.');
      const fk=resource==='wedstrijden'?{matchId:input.targetId}:resource==='stand'?{teamSeasonId:input.targetId}:{playerStatId:input.targetId};
      const targetRow=resource==='wedstrijden'?(await tx.select({id:s.matches.id}).from(s.matches).where(eq(s.matches.id,input.targetId)))[0]:resource==='stand'?(await tx.select({id:s.standings.id}).from(s.standings).where(eq(s.standings.teamSeasonId,input.targetId)))[0]:(await tx.select({id:s.playerSeasonStats.id}).from(s.playerSeasonStats).where(eq(s.playerSeasonStats.id,input.targetId)))[0];
      if(!targetRow)throw new AccessError(404,'Bronrecord niet gevonden.');
      const dateValue=input.fieldName==='scheduledDate'?isoDate.parse(input.value):null;
      if(input.fieldName==='startTime'&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.value))throw new AccessError(400,'Ongeldige tijd.');
      if(input.fieldName==='status'&&!['scheduled','completed','postponed','cancelled','awaiting_result'].includes(input.value))throw new AccessError(400,'Ongeldige wedstrijdstatus.');
      const numeric=['homeScore','awayScore','position','wins','games','x01Ppd','cricketMpr'].includes(input.fieldName);
      if(numeric){if(!input.value.trim())throw new AccessError(400,'Vul een bekend getal in; een lege waarde is geen nul.');const n=z.coerce.number().min(0).max(10000).parse(input.value);if(!['x01Ppd','cricketMpr'].includes(input.fieldName)&&!Number.isInteger(n))throw new AccessError(400,'Gebruik een geheel getal.');}
      // Deactivate previous correction for exactly the same field; source values remain intact.
      const target=resource==='wedstrijden'?eq(s.dataOverrides.matchId,input.targetId):resource==='stand'?eq(s.dataOverrides.teamSeasonId,input.targetId):eq(s.dataOverrides.playerStatId,input.targetId);
      await tx.update(s.dataOverrides).set({isActive:false}).where(and(target,eq(s.dataOverrides.fieldName,input.fieldName)));
      const [r]=await tx.insert(s.dataOverrides).values({...fk,fieldName:input.fieldName,numericValue:numeric?String(Number(input.value)):null,dateValue,textValue:!numeric&&!dateValue?input.value:null,reason:input.reason,createdBy:actorId}).returning();entityId=r.id;
    }else throw new AccessError(404,'Onbekende beheeractie.');
    await tx.insert(s.auditLogs).values({actorUserId:actorId,action:`${resource}.${auditAction}`,entityType:resource,entityId:entityId??null,summary:auditAction==='delete'?'Alleen het bevestigde record verwijderd; media, gerelateerde records en auditgeschiedenis blijven behouden.':auditAction==='detach'?'Alleen de bevestigde afbeeldingskoppeling losgemaakt; bestand en andere verwijzingen blijven behouden.':auditAction==='archive'?'Item gearchiveerd; gerelateerde records en media blijven behouden.':'Beheerwijziging opgeslagen; inhoud en secrets worden niet gelogd.'});
  });
}
