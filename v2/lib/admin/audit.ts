import 'server-only';
import {getDatabase} from '@/db/client';
import {auditLogs} from '@/db/schema';

export async function authAudit(actor: string, action: string) {
  await (await getDatabase()).insert(auditLogs).values({actorUserId: actor, action, entityType: 'auth', entityId: actor, summary: 'Beveiligde beheeractie; wachtwoorden, tokens en verificatiecodes worden niet opgeslagen.'});
}
