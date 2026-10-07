import 'server-only';
import {cache} from 'react';
import {cookies} from 'next/headers';
import type {Session} from '@supabase/supabase-js';
import {eq} from 'drizzle-orm';
import {getDatabase} from '@/db/client';
import {users} from '@/db/schema';
import {AccessError,assertAdminIdentity} from './security';
import {ACCESS_COOKIE,REFRESH_COOKIE,newAuthClient,writeSessionCookies,expireSessionCookies} from './auth-client';
export {ACCESS_COOKIE,REFRESH_COOKIE,newAuthClient} from './auth-client';
export async function saveSession(session:Session){writeSessionCookies(await cookies(),session);}
export async function clearSession(){expireSessionCookies(await cookies());}
export const authenticatedClient=cache(async(writable=false)=>{
  const client=newAuthClient(),store=await cookies();const access=store.get(ACCESS_COOKIE)?.value,refresh=store.get(REFRESH_COOKIE)?.value;
  if(!refresh||(!writable&&!access))throw new AccessError(401,'Log eerst in.');
  // Server Components cannot persist rotated cookies. The narrowly scoped proxy refreshes first.
  if(!writable){const check=await client.auth.getUser(access!);if(check.error||!check.data.user)throw new AccessError(401,'Sessie verlopen. Log opnieuw in.');}
  const {data,error}=access?await client.auth.setSession({access_token:access,refresh_token:refresh}):await client.auth.refreshSession({refresh_token:refresh});
  if(error||!data.session)throw new AccessError(401,'Sessie verlopen. Log opnieuw in.');
  if(data.session.access_token!==access||data.session.refresh_token!==refresh){
    if(!writable)throw new AccessError(401,'Vernieuw de sessie en probeer opnieuw.');
    await saveSession(data.session);
  }
  const verified=await client.auth.getUser();if(verified.error||!verified.data.user)throw new AccessError(401,'Ongeldige sessie.');
  if(!verified.data.user.email_confirmed_at)throw new AccessError(403,'Bevestig eerst je uitnodiging per e-mail.');
  const db=await getDatabase();const [profile]=await db.select().from(users).where(eq(users.id,verified.data.user.id));
  if(!profile?.isActive||profile.role!=='admin')throw new AccessError(403,'Dit account heeft geen beheertoegang.');
  return {client,user:verified.data.user,profile};
});
export const requireAdmin=cache(async(writable=false)=>{
  const auth=await authenticatedClient(writable);const {data,error}=await auth.client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(error)throw new AccessError(401,'Verificatie mislukt.');assertAdminIdentity(auth.user,auth.profile,data.currentLevel??'aal1');return auth;
});
