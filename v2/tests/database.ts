import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import type { Database } from '@/db/client';
import {seedLegacy} from '@/db/seed-data';
export async function testDatabase(){
  const client=new PGlite();await client.waitReady;
  const local=drizzle(client,{schema});await migrate(local,{migrationsFolder:'./drizzle'});
  const db=local as unknown as Database;await seedLegacy(db);
  return {db,client};
}
