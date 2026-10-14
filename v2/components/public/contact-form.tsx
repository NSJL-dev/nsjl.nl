'use client';
import Link from 'next/link';
import {useRef, useState, type FormEvent} from 'react';
import {formspreeEndpoint, contactResponseStatus, contactErrorMessage, type ContactStatus} from '@/lib/formspree';

export function ContactForm({endpoint, email}: {endpoint: string | null; email: string}) {
  const safeEndpoint = endpoint === null ? null : formspreeEndpoint(endpoint);
  const [status, setStatus] = useState<ContactStatus>(safeEndpoint ? 'idle' : 'unavailable'), submitting = useRef(false);
  const error = contactErrorMessage(status), sending = status === 'sending';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!safeEndpoint) { setStatus('unavailable'); return; }
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    submitting.current = true;
    try {
      const data = new FormData(form);
      if (String(data.get('_gotcha') || '').trim()) { setStatus('validation'); return; }
      setStatus('sending');
      const response = await fetch(safeEndpoint, {method: 'POST', body: data, headers: {Accept: 'application/json'}, credentials: 'omit'});
      const result = contactResponseStatus(response.status);
      setStatus(result);
      // Never render/log a provider response body or raw exception: it may
      // contain the sender's data. Preserve input unless acceptance is confirmed.
      if (result === 'success') { try { form.reset(); } catch { /* Delivery remains confirmed even if a DOM reset fails. */ } }
    } catch { setStatus('unconfirmed'); }
    finally { submitting.current = false; }
  }
  return <form className="pub-contact-form" action={safeEndpoint || undefined} method="post" onSubmit={submit} aria-busy={sending}><h3>Stuur een bericht</h3><div className="pub-form-row"><div><label htmlFor="contact-name">Je naam</label><input id="contact-name" name="naam" placeholder="Bijv. Phil Taylor (maar dan minder goed)" autoComplete="name" required minLength={2} maxLength={100} readOnly={sending} disabled={!safeEndpoint}/></div><div><label htmlFor="contact-email">E-mailadres</label><input id="contact-email" name="email" type="email" placeholder="jouw@email.nl" autoComplete="email" required maxLength={254} readOnly={sending} disabled={!safeEndpoint}/></div></div><label htmlFor="contact-message">Bericht</label><textarea id="contact-message" name="bericht" placeholder="Schrijf hier je bericht…" required minLength={5} maxLength={3000} rows={5} readOnly={sending} disabled={!safeEndpoint}/><div className="pub-honey" aria-hidden="true"><label htmlFor="contact-company">Laat dit veld leeg</label><input id="contact-company" name="_gotcha" tabIndex={-1} autoComplete="off"/></div><p className="pub-form-privacy">We gebruiken je gegevens om te antwoorden. <Link href="/privacy">Lees meer over privacy</Link>.</p><button type="submit" className="pub-button" disabled={sending || !safeEndpoint}>{sending ? 'Versturen…' : 'Versturen 🎯'}</button><div className="pub-form-feedback" aria-live="polite" aria-atomic="true">{status === 'success' && <p>Je bericht is verstuurd. Bedankt, we komen bij je terug!</p>}{error && <p role="alert">{error} Je kunt ook mailen naar <a href={`mailto:${email}`}>{email}</a>.</p>}</div></form>;
}
