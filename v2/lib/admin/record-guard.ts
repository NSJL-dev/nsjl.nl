import 'server-only';
import {createHash} from 'node:crypto';
import {eq, sql} from 'drizzle-orm';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {AccessError} from '@/lib/security';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type ManagedResource = 'spelers' | 'nieuws' | 'agenda' | 'sponsors';
export type ManagedRecord = typeof s.players.$inferSelect | typeof s.newsPosts.$inferSelect | typeof s.events.$inferSelect | typeof s.sponsors.$inferSelect;

export function isManagedResource(resource: string): resource is ManagedResource {
  return ['spelers', 'nieuws', 'agenda', 'sponsors'].includes(resource);
}
// A revision is not an auth token. Hash the complete snapshot so changed content
// is detected even when updated_at has finer precision than JavaScript dates.
export function recordRevision(record: ManagedRecord) {
  const row = record as unknown as Record<string, unknown>;
  return createHash('sha256').update(JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]]))).digest('hex');
}
export function recordName(record: ManagedRecord) {
  return 'displayName' in record ? record.displayName : 'title' in record ? record.title : record.name;
}
export function recordArchived(record: ManagedRecord) {
  return 'status' in record ? record.status === 'archived' : !record.isActive;
}
export async function lockManagedRecord(tx: Transaction, resource: ManagedResource, id: string) {
  switch (resource) {
    case 'spelers': return (await tx.select().from(s.players).where(eq(s.players.id, id)).for('update'))[0];
    case 'nieuws': return (await tx.select().from(s.newsPosts).where(eq(s.newsPosts.id, id)).for('update'))[0];
    case 'agenda': return (await tx.select().from(s.events).where(eq(s.events.id, id)).for('update'))[0];
    case 'sponsors': return (await tx.select().from(s.sponsors).where(eq(s.sponsors.id, id)).for('update'))[0];
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
