import 'server-only';
import {createHash} from 'node:crypto';
import {eq, sql} from 'drizzle-orm';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {AccessError} from '@/lib/security';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type ManagedResource = 'spelers' | 'nieuws' | 'agenda' | 'sponsors' | 'media' | 'wedstrijden';
export type ManagedRecord = typeof s.players.$inferSelect | typeof s.newsPosts.$inferSelect | typeof s.events.$inferSelect | typeof s.sponsors.$inferSelect | typeof s.media.$inferSelect | typeof s.matches.$inferSelect;

export function isManagedResource(resource: string): resource is ManagedResource {
  return ['spelers', 'nieuws', 'agenda', 'sponsors', 'media', 'wedstrijden'].includes(resource);
}
// A revision is not an auth token. Hash the complete snapshot so changed content
// is detected even when updated_at has finer precision than JavaScript dates.
export function recordRevision(record: ManagedRecord) {
  const row = record as unknown as Record<string, unknown>;
  return createHash('sha256').update(JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]]))).digest('hex');
}
export function recordName(record: ManagedRecord) {
  return 'displayName' in record ? record.displayName : 'title' in record ? record.title : 'name' in record ? record.name : 'filename' in record ? record.filename : `Wedstrijd ${record.slug}`;
}
export function recordArchived(record: ManagedRecord) {
  return 'status' in record ? record.status === ('importKey' in record ? 'cancelled' : 'archived') : !record.isActive;
}
export async function lockManagedRecord(tx: Transaction, resource: ManagedResource, id: string) {
  switch (resource) {
    case 'spelers': return (await tx.select().from(s.players).where(eq(s.players.id, id)).for('update'))[0];
    case 'nieuws': return (await tx.select().from(s.newsPosts).where(eq(s.newsPosts.id, id)).for('update'))[0];
    case 'agenda': return (await tx.select().from(s.events).where(eq(s.events.id, id)).for('update'))[0];
    case 'sponsors': return (await tx.select().from(s.sponsors).where(eq(s.sponsors.id, id)).for('update'))[0];
    case 'media': return (await tx.select().from(s.media).where(eq(s.media.id, id)).for('update'))[0];
    case 'wedstrijden': return (await tx.select().from(s.matches).where(eq(s.matches.id, id)).for('update'))[0];
  }
}
export function assertRecordRevision(record: ManagedRecord, form: Record<string, unknown>) {
  if (typeof form.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(form.expectedRevision))
    throw new AccessError(400, 'Dit formulier is verouderd. Ververs de beheerlijst voordat je verdergaat.');
  if (form.expectedRevision !== recordRevision(record))
    throw new AccessError(409, 'Dit item is inmiddels gewijzigd. Ververs de beheerlijst en controleer de nieuwe gegevens.');
}
export function assertRecordConfirmation(record: ManagedRecord, form: Record<string, unknown>) {
  if (form.confirmedName !== recordName(record))
    throw new AccessError(400, 'Bevestig de actie voor het juiste item via de beheerlijst.');
}
export function assertTypedConfirmation(record: ManagedRecord, form: Record<string, unknown>) {
  assertRecordConfirmation(record, form);
  if (form.typedName !== recordName(record)) throw new AccessError(400, 'Typ de naam exact over om deze actie te bevestigen.');
}

export async function deleteEditorialRecord(tx: Transaction, resource: ManagedResource, record: ManagedRecord) {
  if (!recordArchived(record)) throw new AccessError(409, 'Archiveer of deactiveer dit item eerst. Definitief verwijderen is een aparte actie.');
  const tables = {spelers: 'players', nieuws: 'news_posts', agenda: 'events', sponsors: 'sponsors', wedstrijden: 'matches', media: 'media'};
  const relations = await tx.execute(sql`select exists(select 1 from pg_constraint where contype='f' and confrelid=${`public.${tables[resource]}`}::regclass and confdeltype not in ('a','r')) as unsafe`);
  if (relations.rows[0]?.unsafe) throw new AccessError(409, 'Deze database-relatie kan andere gegevens automatisch wijzigen. Verwijderen blijft geblokkeerd tot de relatie is gecontroleerd.');
  try { switch (resource) {
    case 'spelers': await deleteUnlinkedPlayer(tx, record as typeof s.players.$inferSelect); break;
    case 'nieuws': await tx.delete(s.newsPosts).where(eq(s.newsPosts.id, record.id)); break;
    case 'agenda': await tx.delete(s.events).where(eq(s.events.id, record.id)); break;
    case 'sponsors': await tx.delete(s.sponsors).where(eq(s.sponsors.id, record.id)); break;
    case 'wedstrijden': await deleteManualMatch(tx, record as typeof s.matches.$inferSelect); break;
    default: throw new AccessError(400, 'Dit onderdeel heeft een afzonderlijke beveiligde verwijderflow.');
  } } catch (error) {
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error;
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23503') throw new AccessError(409, 'Dit record wordt nog gebruikt en blijft behouden. Gerelateerde gegevens worden niet automatisch verwijderd.');
    throw error;
  }
}

export async function detachMedia(tx: Transaction, resource: ManagedResource, record: ManagedRecord, form: Record<string, unknown>) {
  const mediaId = 'photoMediaId' in record ? record.photoMediaId : 'featuredMediaId' in record ? record.featuredMediaId : 'logoMediaId' in record ? record.logoMediaId : undefined;
  if (!mediaId || form.expectedMediaId !== mediaId) throw new AccessError(409, 'De afbeelding is gewijzigd of al losgemaakt. Ververs de beheerlijst.');
  const updatedAt = new Date();
  if (resource === 'spelers') await tx.update(s.players).set({photoMediaId: null, updatedAt}).where(eq(s.players.id, record.id));
  else if (resource === 'nieuws') await tx.update(s.newsPosts).set({featuredMediaId: null, updatedAt}).where(eq(s.newsPosts.id, record.id));
  else if (resource === 'sponsors') await tx.update(s.sponsors).set({logoMediaId: null, updatedAt}).where(eq(s.sponsors.id, record.id));
  else throw new AccessError(400, 'Dit onderdeel ondersteunt geen afbeeldingskoppeling.');
}

async function deleteManualMatch(tx: Transaction, match: typeof s.matches.$inferSelect) {
  if (match.source !== 'manual' || match.status !== 'cancelled' || match.externalIdentifier || match.resultReportId || match.scheduleReportId || match.playedDate || match.homeScore !== null || match.awayScore !== null)
    throw new AccessError(409, 'Alleen een geannuleerde, handmatige wedstrijd zonder bronkoppeling of uitslag kan worden verwijderd.');
  const [row] = await tx.select({linked: sql<boolean>`
    exists(select 1 from ${s.matchResultSides} where ${s.matchResultSides.matchId} = ${match.id}) or
    exists(select 1 from ${s.dataOverrides} where ${s.dataOverrides.matchId} = ${match.id})
  `}).from(s.matches).where(eq(s.matches.id, match.id));
  if (!row || row.linked) throw new AccessError(409, 'Deze wedstrijd heeft uitslagregels of correctiehistorie en blijft behouden.');
  await tx.delete(s.matches).where(eq(s.matches.id, match.id));
}
export async function deleteUnlinkedPlayer(tx: Transaction, player: typeof s.players.$inferSelect) {
  if (player.isActive) throw new AccessError(409, 'Verberg het profiel eerst met Archiveren. Alleen verborgen profielen kunnen definitief worden verwijderd.');
  // One dependency query, with the parent locked FOR UPDATE. Existing foreign
  // keys additionally refuse removal; no cascades or unlinks are performed.
  const [row] = await tx.select({linked: sql<boolean>`
    exists(select 1 from ${s.playerTeamSeasons} where ${s.playerTeamSeasons.playerId} = ${player.id}) or
    exists(select 1 from ${s.playerAliases} where ${s.playerAliases.playerId} = ${player.id}) or
    exists(select 1 from ${s.externalPlayers} where ${s.externalPlayers.playerId} = ${player.id}) or
    exists(select 1 from ${s.playerSeasonStats} where ${s.playerSeasonStats.playerId} = ${player.id}) or
    exists(select 1 from ${s.playerStatsHistory} where ${s.playerStatsHistory.playerId} = ${player.id}) or
    exists(select 1 from ${s.legacyPlayerStats} where ${s.legacyPlayerStats.playerId} = ${player.id})
  `}).from(s.players).where(eq(s.players.id, player.id));
  if (!row || row.linked) throw new AccessError(409, 'Dit profiel heeft lidmaatschappen, spelerkoppelingen of statistieken en blijft behouden. Gebruik Archiveren; gekoppelde gegevens worden nooit automatisch gewist.');
  try {
    await tx.delete(s.players).where(eq(s.players.id, player.id));
  } catch (error) {
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error;
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23503')
      throw new AccessError(409, 'Dit profiel wordt nog gebruikt en blijft behouden. Er worden geen koppelingen verwijderd.');
    throw error;
  }
}
