import {authenticatedClient} from '@/lib/auth';
import {redirect} from 'next/navigation';
import {AdminForm} from '@/components/admin-form';
export const dynamic='force-dynamic';
export default async function Password(){
  const auth=await authenticatedClient().catch(()=>null);if(!auth)redirect('/admin/login');
  const factors=await auth.client.auth.mfa.listFactors(),assurance=await auth.client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(factors.error||assurance.error)redirect('/admin/mfa');
  if(factors.data.all.some(f=>f.status==='verified')&&assurance.data.currentLevel!=='aal2')redirect('/admin/mfa?next=wachtwoord');
  return <main className="auth-main" id="main"><div className="auth-card"><span className="eyebrow">BEVEILIGD BEHEERACCOUNT</span><h1>Jouw account.</h1><p>Kies een uniek wachtwoord van minimaal 12 tekens. Tweestapsverificatie blijft verplicht.</p><AdminForm action="/api/auth/password"><label htmlFor="new-password">Nieuw wachtwoord</label><input id="new-password" type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required/><button className="button">Opslaan</button></AdminForm><AdminForm action="/api/auth/logout"><button className="button secondary small">Uitloggen</button></AdminForm></div></main>;
}
