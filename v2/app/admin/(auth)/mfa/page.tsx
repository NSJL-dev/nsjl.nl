import {redirect} from 'next/navigation';
import {authenticatedClient} from '@/lib/auth';
import {MfaSetup} from '@/components/mfa-setup';
import {Target} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function MFA({searchParams}:{searchParams:Promise<{error?:string}>}){
  const auth=await authenticatedClient().catch(()=>null);if(!auth)redirect('/admin/login');
  const assurance=await auth.client.auth.mfa.getAuthenticatorAssuranceLevel();if(assurance.data?.currentLevel==='aal2')redirect('/admin');
  const factors=await auth.client.auth.mfa.listFactors(),verified=factors.data?.totp.find(f=>f.status==='verified'),error=(await searchParams).error;
  return <main className="auth-main" id="main"><div className="auth-card"><span className="brand"><Target className="lime"/>NSJL ADMIN</span><h1>Nog één worp.</h1><p>{verified?'Vul de zescijferige code uit je authenticator-app in.':'Stel je authenticator in. Dit is verplicht voor de beheeromgeving.'}</p>{error&&<p role="alert" className="notice error">{error}</p>}{verified?<form action="/api/auth/mfa" method="post"><input type="hidden" name="factorId" value={verified.id}/><label htmlFor="code">Verificatiecode</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/><button className="button">Verifiëren</button></form>:<MfaSetup/>}<form action="/api/auth/logout" method="post"><button className="button secondary small">Uitloggen</button></form></div></main>;
}
