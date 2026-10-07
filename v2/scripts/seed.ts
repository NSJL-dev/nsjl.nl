import {stagingOnly} from './environment';
import {getDatabase} from '../db/client';
import {seedLegacy,importAuditSnapshot} from '../db/seed-data';
stagingOnly();const db=await getDatabase();await seedLegacy(db);
if(process.argv.includes('--audit-snapshot'))await importAuditSnapshot(db);
console.log('Echte legacy-content geïmporteerd; zomer en onbewezen profielcijfers blijven gescheiden.');process.exit(0);
