import 'server-only';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as localDrizzle } from 'drizzle-orm/pglite';
import { migrate as migrateLocal } from 'drizzle-orm/pglite/migrator';
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import * as schema from './schema';
import { readEnv } from '@/lib/env';
export type Database=NodePgDatabase<typeof schema>;
const globalDb=globalThis as unknown as {nsjlDatabase?:Promise<Database>};
export function getDatabase():Promise<Database>{
  globalDb.nsjlDatabase??=(async()=>{
    const env=readEnv();
    if(env.DATABASE_MODE==='postgres'){
      const pool=new Pool({connectionString:env.DATABASE_URL,max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});
      return drizzle(pool,{schema});
    }
    const dir=path.join(process.cwd(),'.local-data');await mkdir(dir,{recursive:true});
    const client=new PGlite(path.join(dir,'postgres'));await client.waitReady;
    const local=localDrizzle(client,{schema});await migrateLocal(local,{migrationsFolder:path.join(process.cwd(),'drizzle')});
    const db=local as unknown as Database;
    const {seedLegacy}=await import('./seed-data');await seedLegacy(db);
    const {importAuditSnapshot}=await import('./seed-data');await importAuditSnapshot(db);
    return db;
  })();
  return globalDb.nsjlDatabase;
}
