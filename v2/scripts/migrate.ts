import {stagingOnly} from './environment';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {readEnv} from '../lib/env';
stagingOnly();const env=readEnv();if(env.DATABASE_MODE!=='postgres')throw new Error('Gebruik voor migraties een aparte PostgreSQL/Supabase-stagingdatabase.');
const pool=new Pool({connectionString:env.DATABASE_MIGRATION_URL||env.DATABASE_URL,max:1});
try{await migrate(drizzle(pool),{migrationsFolder:'./drizzle'});console.log('Stagingmigraties toegepast.');}finally{await pool.end();}
