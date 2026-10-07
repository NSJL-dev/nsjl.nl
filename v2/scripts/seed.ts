import {stagingOnly} from './environment';
import {getDatabase} from '../db/client';
import {seedLegacy,importAuditSnapshot} from '../db/seed-data';
import {readEnv} from '../lib/env';
stagingOnly();if(process.argv.includes('--audit-snapshot')&&!readEnv().SYNC_ENABLED)throw new Error('Bronimport is uitgeschakeld: SYNC_ENABLED=false.');const db=await getDatabase();await seedLegacy(db);
if(process.argv.includes('--audit-snapshot'))await importAuditSnapshot(db);
console.log('Echte legacy-content geïmporteerd; zomer en onbewezen profielcijfers blijven gescheiden.');process.exit(0);
