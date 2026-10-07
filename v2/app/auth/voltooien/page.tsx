import Link from 'next/link';
export const dynamic = 'force-dynamic';
export const metadata = {title: 'Maillink afronden', robots: {index: false, follow: false}};
export default async function CompleteMail({searchParams}: {searchParams: Promise<{reason?: string}>}) {
  const {reason} = await searchParams;
  return <main className="auth-main" id="main"><div className="auth-card"><span className="eyebrow">BEVEILIGD BEHEERACCOUNT</span><h1>Je NSJL-maillink.</h1>
    <p>{reason === 'session' ? 'Log eerst uit en open daarna je eigen uitnodiging of herstelmail opnieuw.' : 'Open de link uit je uitnodiging of herstelmail. Een geldige link wordt veilig gecontroleerd voordat je je account bevestigt.'}</p>
    <noscript><p>JavaScript is nodig om een standaard Supabase-maillink veilig te verwerken. Je sessietokens worden niet in browseropslag bewaard.</p></noscript>
    {reason === 'session' && <form method="post" action="/api/auth/logout"><button className="button" type="submit">Uitloggen</button></form>}
    <Link className="text-link" href="/admin/login">Naar inloggen</Link>
  </div></main>;
}
