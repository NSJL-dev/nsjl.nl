import {eq} from 'drizzle-orm';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {recordRevision, recordName} from '@/lib/admin/record-guard';
import {adminMutation} from '@/lib/admin/mutations';

// Existing workflow tests submit the same revision/name fields as the current
// server-rendered editors. Rejection/replay tests call adminMutation directly.
export async function preparedAdminForm<T extends Record<string, unknown>>(db: Database, resource: string, form: T): Promise<T> {
  if (typeof form.id !== 'string') return form;
  const row = resource === 'spelers' ? (await db.select().from(s.players).where(eq(s.players.id, form.id)))[0]
    : resource === 'nieuws' ? (await db.select().from(s.newsPosts).where(eq(s.newsPosts.id, form.id)))[0]
    : resource === 'agenda' ? (await db.select().from(s.events).where(eq(s.events.id, form.id)))[0]
    : resource === 'sponsors' ? (await db.select().from(s.sponsors).where(eq(s.sponsors.id, form.id)))[0] : undefined;
  if (!row) return form;
  return {...form, expectedRevision: recordRevision(row), ...(form.action === 'archive' || form.action === 'delete' ? {confirmedName: recordName(row)} : {})};
}
export async function preparedMutation(db: Database, actorId: string, resource: string, form: Record<string, unknown>) {
  return adminMutation(db, actorId, resource, await preparedAdminForm(db, resource, form));
}
