import 'server-only';
import {and,eq} from 'drizzle-orm';
import type {Database} from '@/db/client';
import {users} from '@/db/schema';
import {AccessError} from '@/lib/security';

export async function assertAdminActor(db: Database, id: string) {
  const [actor]=await db.select({id:users.id}).from(users).where(and(eq(users.id,id),eq(users.role,'admin'),eq(users.isActive,true))).limit(1);
  if(!actor)throw new AccessError(403,'Actieve beheerderstoegang vereist.');
}
