import {authenticatedClient} from '@/lib/auth';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Password(){const auth=await authenticatedClient().catch(()=>null);if(!auth)redirect('/admin/login');return <main className="auth-main" id="main"><div className="auth-card"><span className="eyebrow">JE UITNODIGING IS BEVESTIGD</span><h1>Jouw account.</h1><p>Kies een uniek wachtwoord van minimaal 12 tekens. Daarna stel je TOTP in.</p><form action="/api/auth/password" method="post"><label htmlFor="new-password">Nieuw wachtwoord</label><input id="new-password" type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required/><button className="button">Opslaan</button></form></div></main>;}
