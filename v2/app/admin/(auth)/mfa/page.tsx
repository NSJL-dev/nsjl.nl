import {redirect} from 'next/navigation';
import Link from 'next/link';
import {authenticatedClient} from '@/lib/auth';
import {MfaSetup} from '@/components/mfa-setup';
import {AdminForm} from '@/components/admin-form';
import {Target} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function MFA({searchParams}:{searchParams:Promise<{error?:string;next?:string}>}){
  const auth=await authenticatedClient().catch(()=>null);if(!auth)redirect('/admin/login');
  const params=await searchParams,next=params.next==='wachtwoord'?'wachtwoord':'',assurance=await auth.client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance.data?.currentLevel==='aal2')redirect(next?'/admin/wachtwoord':'/admin');
  const factors=await auth.client.auth.mfa.listFactors(),verified=factors.data?.totp.find(f=>f.status==='verified'),unavailable=!!(assurance.error||factors.error);
  return <main className="auth-main" id="main"><div className="auth-card"><span className="brand"><Target className="lime"/>NSJL ADMIN</span><h1>Nog één worp.</h1><p>{verified?'Vul de zescijferige code uit je authenticator-app in.':'Stel je authenticator in. Dit is verplicht voor de beheeromgeving.'}</p>{params.error&&<p role="alert" className="notice error">{params.error}</p>}{unavailable?<p role="alert" className="notice error">Verificatie is tijdelijk niet beschikbaar. <Link href="/admin/mfa">Probeer opnieuw.</Link></p>:verified?<AdminForm action="/api/auth/mfa"><input type="hidden" name="factorId" value={verified.id}/><input type="hidden" name="next" value={next}/><label htmlFor="code">Verificatiecode</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/><button className="button">Verifiëren</button></AdminForm>:<MfaSetup next={next}/>}{verified&&<details><summary>Geen toegang tot je authenticator?</summary><p>Vraag de eigenaar van het Supabase-stagingproject om je identiteit te controleren en je MFA-factor te herstellen. Een nieuw wachtwoord schakelt MFA niet uit.</p></details>}<AdminForm action="/api/auth/logout"><button className="button secondary small">Uitloggen</button></AdminForm></div></main>;
}
