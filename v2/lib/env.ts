import { z } from 'zod';
const url=z.url();
const environment=z.object({
  APP_URL:url.default('http://localhost:3000'),APP_ENV:z.enum(['development','staging','production']).default('development'),
  DATABASE_MODE:z.enum(['local','postgres']).default('local'),DATABASE_URL:z.string().optional(),DATABASE_MIGRATION_URL:z.string().optional(),
  SUPABASE_URL:z.string().optional(),SUPABASE_PUBLISHABLE_KEY:z.string().optional(),SUPABASE_SECRET_KEY:z.string().optional(),SYNC_CRON_SECRET:z.string().optional(),
  SYNC_ENABLED:z.string().default('false').transform(v=>v==='true'),
  BULLSHOOTER_RESULTS_ENTRY_URL:url.default('https://www.bullshooterevents.nl/comp_reu3_uitslagen.html'),
  BULLSHOOTER_SCHEDULE_ENTRY_URL:url.default('https://www.bullshooterevents.nl/comp_reu3_speelschema.html'),
  BULLSHOOTER_TEAMINFO_ENTRY_URL:url.default('https://www.bullshooterevents.nl/comp_reu3_teaminfo.html'),
  FORM_SPREE_ENDPOINT:url.default('https://formspree.io/f/mdajbaba'),
  MEDIA_PUBLIC_BUCKET:z.string().default('published-media'),MEDIA_PRIVATE_BUCKET:z.string().default('private-media'),
});
export function readEnv(input:Record<string,string|undefined>=process.env){
  const env=environment.parse(input);
  if(input.VERCEL&&env.DATABASE_MODE!=='postgres')throw new Error('Vercel vereist de aparte stagingdatabase; embedded opslag is niet duurzaam');
  if(env.DATABASE_MODE==='postgres'&&!env.DATABASE_URL)throw new Error('DATABASE_URL ontbreekt voor PostgreSQL');
  if(env.APP_ENV!=='development'&&env.DATABASE_MODE!=='postgres')throw new Error('Embedded developmentdatabase is niet toegestaan op staging/productie');
  if(env.APP_ENV!=='development'&&(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY))throw new Error('Configureer staging/productie Auth');
  if(env.APP_ENV==='staging'&&new URL(env.APP_URL).hostname==='nsjl.nl')throw new Error('Staging mag niet op nsjl.nl draaien');
  if(env.SYNC_ENABLED&&(!env.SYNC_CRON_SECRET||env.SYNC_CRON_SECRET.length<32))throw new Error('Veilig schedulergeheim vereist');
  if(env.SUPABASE_URL)url.parse(env.SUPABASE_URL);
  return env;
}
export function authConfigured(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY);}
