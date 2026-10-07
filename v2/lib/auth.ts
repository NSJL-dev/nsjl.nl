import 'server-only';
import {cookies} from 'next/headers';
import {createClient,type SupabaseClient,type Session} from '@supabase/supabase-js';
import {eq} from 'drizzle-orm';
import {getDatabase} from '@/db/client';
import {users} from '@/db/schema';
import {authConfigured,readEnv} from './env';
import {AccessError,assertAdminIdentity} from './security';
export const ACCESS_COOKIE='nsjl-access';export const REFRESH_COOKIE='nsjl-refresh';
export function newAuthClient():SupabaseClient{
  const env=readEnv();if(!authConfigured())throw new AccessError(503,'De staging-login is nog niet ingesteld.');
  return createClient(env.SUPABASE_URL!,env.SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export async function saveSession(session:Session){
  const store=await cookies();const options={httpOnly:true,secure:new URL(readEnv().APP_URL).protocol==='https:',sameSite:'lax' as const,path:'/'};
  store.set(ACCESS_COOKIE,session.access_token,{...options,maxAge:session.expires_in});store.set(REFRESH_COOKIE,session.refresh_token,{...options,maxAge:7*86400});
}
export async function clearSession(){const c=await cookies();c.delete(ACCESS_COOKIE);c.delete(REFRESH_COOKIE);}
export async function authenticatedClient(writable=false){
  const client=newAuthClient(),store=await cookies();const access=store.get(ACCESS_COOKIE)?.value,refresh=store.get(REFRESH_COOKIE)?.value;
  if(!access||!refresh)throw new AccessError(401,'Log eerst in.');
  const {data,error}=await client.auth.setSession({access_token:access,refresh_token:refresh});
  if(error||!data.session)throw new AccessError(401,'Sessie verlopen. Log opnieuw in.');
  if(writable&&data.session.access_token!==access)await saveSession(data.session);
  const verified=await client.auth.getUser();if(verified.error||!verified.data.user)throw new AccessError(401,'Ongeldige sessie.');
  const db=await getDatabase();const [profile]=await db.select().from(users).where(eq(users.id,verified.data.user.id));
  if(!profile?.isActive||profile.role!=='admin')throw new AccessError(403,'Dit account heeft geen beheertoegang.');
  return {client,user:verified.data.user,profile};
}
export async function requireAdmin(writable=false){
  const auth=await authenticatedClient(writable);const {data,error}=await auth.client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(error)throw new AccessError(401,'Verificatie mislukt.');assertAdminIdentity(auth.user,auth.profile,data.currentLevel??'aal1');return auth;
}
