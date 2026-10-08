import 'server-only';
import {randomUUID} from 'node:crypto';
import {and, desc, eq, sql} from 'drizzle-orm';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {AccessError} from '@/lib/security';
import {assertManagedMediaObject, assertNoPublicMediaCopy, removeOriginalMediaFile} from '@/lib/media';
import {assertAdminActor} from './authorization';
import {assertRecordRevision, assertTypedConfirmation, recordRevision, type Transaction} from './record-guard';

async function noReferences(tx: Transaction, row: typeof s.media.$inferSelect) {
  // Refuse file deletion if a future migration introduces a relation we have
  // not reviewed. A later FK failure cannot restore already deleted bytes.
  const constraints = await tx.execute(sql`
    select n.nspname as schema_name, t.relname as table_name, a.attname as column_name,
           c.confdeltype, c.condeferrable, array_length(c.conkey,1) as column_count
    from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='public.media'::regclass
  `);
  const expected = new Set(['players.photo_media_id','news_posts.featured_media_id','sponsors.logo_media_id','site_settings.value_media_id']);
  if (constraints.rows.length !== expected.size || constraints.rows.some(constraint => constraint.schema_name !== 'public' || constraint.column_count !== 1 || !expected.has(`${constraint.table_name}.${constraint.column_name}`) || constraint.confdeltype !== 'a' || constraint.condeferrable))
    throw new AccessError(409, 'De database bevat een gewijzigde mediarelatie. Bestandsverwijdering blijft geblokkeerd totdat die relatie is gecontroleerd.');
  const [usage] = await tx.select({used: sql<boolean>`
    exists(select 1 from ${s.players} where ${s.players.photoMediaId} = ${row.id}) or
    exists(select 1 from ${s.newsPosts} where ${s.newsPosts.featuredMediaId} = ${row.id}) or
    exists(select 1 from ${s.sponsors} where ${s.sponsors.logoMediaId} = ${row.id}) or
    exists(select 1 from ${s.siteSettings} where ${s.siteSettings.valueMediaId} = ${row.id})
  `}).from(s.media).where(eq(s.media.id, row.id));
  if (!usage || usage.used) throw new AccessError(409, 'Deze afbeelding wordt nog gebruikt door een profiel, nieuwsbericht, sponsor of instelling. Maak de betreffende koppelingen eerst bewust los; het bestand blijft behouden.');
}

// PostgreSQL cannot atomically commit a Storage deletion. Commit a durable,
// immutable intent before touching bytes; interrupted operations are frozen,
// archived and explicitly retryable. Fresh revisions and row locks serialize
// attempts. No signed/public URLs or exception contents are persisted.
export async function deleteMedia(db: Database, actorId: string, id: string, form: Record<string, unknown>) {
  await assertAdminActor(db, actorId);
  const claim = await db.transaction(async tx => {
    const [row] = await tx.select().from(s.media).where(eq(s.media.id, id)).for('update');
    if (!row) throw new AccessError(404, 'Afbeelding niet gevonden. Ververs de beheerlijst.');
    assertRecordRevision(row, form); assertTypedConfirmation(row, form);
    if (row.status !== 'archived') throw new AccessError(409, 'Archiveer de afbeelding eerst voordat je het bestand definitief verwijdert.');
    assertManagedMediaObject(row); await noReferences(tx, row);
    const [previous] = await tx.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, id), eq(s.auditLogs.action, 'media.delete.requested'))).orderBy(desc(s.auditLogs.occurredAt), desc(s.auditLogs.id)).limit(1);
    if (previous) {
      const [failure] = await tx.select({id: s.auditLogs.id}).from(s.auditLogs).where(and(eq(s.auditLogs.entityId, previous.id), eq(s.auditLogs.action, 'media.delete.failed'))).limit(1);
      if (!failure && Date.now() - previous.occurredAt.valueOf() < 15 * 60_000) throw new AccessError(409, 'De verwijdering is al in behandeling. Wacht op het resultaat en ververs de lijst. Een onderbroken poging kan na maximaal 15 minuten opnieuw worden bevestigd.');
    }
    await assertNoPublicMediaCopy(row);
    const attemptId = randomUUID(), updatedAt = new Date(Math.max(Date.now(), row.updatedAt.valueOf() + 1));
    const [claimed] = await tx.update(s.media).set({updatedAt}).where(eq(s.media.id, id)).returning();
    await tx.insert(s.auditLogs).values({id: attemptId, actorUserId: actorId, action: 'media.delete.requested', entityType: 'media', entityId: id, occurredAt: updatedAt, summary: 'Definitieve verwijdering van één gearchiveerd, ongekoppeld privébestand bevestigd. Publicatie en wijzigingen zijn geblokkeerd tot afronding.'});
    return {row: claimed, attemptId};
  });
  try {
    await db.transaction(async tx => {
      const [row] = await tx.select().from(s.media).where(eq(s.media.id, id)).for('update');
      if (!row || recordRevision(row) !== recordRevision(claim.row)) throw new AccessError(409, 'Een andere verwijderpoging heeft dit item overgenomen. Ververs de lijst.');
      if (row.status !== 'archived') throw new AccessError(409, 'De afbeelding moet gearchiveerd blijven.');
      await noReferences(tx, row);
      await removeOriginalMediaFile(row);
      await tx.delete(s.media).where(eq(s.media.id, id));
      await tx.insert(s.auditLogs).values({actorUserId: actorId, action: 'media.delete', entityType: 'media', entityId: id, summary: 'Eén gearchiveerd, ongekoppeld origineel privébestand en zijn registratie verwijderd. Andere bestanden, koppelingen en audits blijven behouden.'});
    });
  } catch (error) {
    await db.insert(s.auditLogs).values({actorUserId: actorId, action: 'media.delete.failed', entityType: 'media-delete-attempt', entityId: claim.attemptId, summary: 'Verwijderpoging onderbroken. Gearchiveerde registratie en intentie blijven behouden; het bestand kan al verwijderd zijn. Een opnieuw bevestigde poging kan de afronding hervatten.'});
    if (error instanceof AccessError) throw error;
    throw new AccessError(502, 'De verwijdering kon niet volledig worden afgerond. De gearchiveerde registratie blijft bewaard. Ververs de lijst en bevestig een nieuwe poging.');
  }
}
