import type {PublicData} from '@/lib/public-data';
import {ContactForm} from './contact-form';

export function ContactSection({settings}: {settings: PublicData['settings']}) {
  const candidate = settings.contact_email || '', email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : 'info@nsjl.nl';
  const endpoint = process.env.FORM_SPREE_ENDPOINT || 'https://formspree.io/f/mdajbaba';
  return <section id="contact" className="pub-contact pub-section" aria-labelledby="contact-title"><div className="pub-container pub-contact-grid"><div><h2 id="contact-title">Contact</h2><p className="pub-contact-intro">Vragen? Of gewoon even zeggen dat we geweldig zijn? Laat het ons weten!</p><dl className="pub-contact-details"><div><dt><span aria-hidden="true">📍</span> Thuislocatie</dt><dd>{settings.home_venue || 'Café Bar The Saloon, Reusel'}</dd></div><div><dt><span aria-hidden="true">✉️</span> E-mail</dt><dd><a href={`mailto:${email}`}>{email}</a></dd></div></dl></div><ContactForm endpoint={endpoint} email={email}/></div></section>;
}
