'use client';
import Link from 'next/link';
import {useState, type FormEvent} from 'react';

export function ContactForm({endpoint, email}: {endpoint: string; email: string}) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form);
    if (String(data.get('_gotcha') || '').trim()) { setStatus('error'); return; }
    setStatus('sending');
    try {
      const response = await fetch(endpoint, {method: 'POST', body: data, headers: {Accept: 'application/json'}});
      if (!response.ok) throw new Error('Contact delivery failed');
      setStatus('success'); form.reset();
    } catch { setStatus('error'); }
  }
  return <form className="pub-contact-form" action={endpoint} method="post" onSubmit={submit} aria-busy={status === 'sending'}><h3>Stuur een bericht</h3><div className="pub-form-row"><div><label htmlFor="contact-name">Je naam</label><input id="contact-name" name="naam" placeholder="Bijv. Phil Taylor (maar dan minder goed)" autoComplete="name" required minLength={2} maxLength={100}/></div><div><label htmlFor="contact-email">E-mailadres</label><input id="contact-email" name="email" type="email" placeholder="jouw@email.nl" autoComplete="email" required maxLength={254}/></div></div><label htmlFor="contact-message">Bericht</label><textarea id="contact-message" name="bericht" placeholder="Schrijf hier je bericht…" required minLength={5} maxLength={3000} rows={5}/><div className="pub-honey" aria-hidden="true"><label htmlFor="contact-company">Laat dit veld leeg</label><input id="contact-company" name="_gotcha" tabIndex={-1} autoComplete="off"/></div><p className="pub-form-privacy">We gebruiken je gegevens om te antwoorden. <Link href="/privacy">Lees meer over privacy</Link>.</p><button type="submit" className="pub-button" disabled={status === 'sending'}>{status === 'sending' ? 'Versturen…' : 'Versturen 🎯'}</button><div className="pub-form-feedback" aria-live="polite" aria-atomic="true">{status === 'success' && <p>Je bericht is verstuurd. Bedankt, we komen bij je terug!</p>}{status === 'error' && <p role="alert">Versturen is niet gelukt. Probeer het opnieuw of mail naar <a href={`mailto:${email}`}>{email}</a>.</p>}</div></form>;
}
