import Link from 'next/link';
import Image from 'next/image';
import {PublicNavigation} from './public-navigation';

export function SiteHeader() {
  return <header className="site-header"><Link className="nav-logo" href="/" aria-label="NSJL, naar home"><Image src="/img/logo-nsjl-blauw.png" width={50} height={50} alt="Logo van NSJL" priority/></Link><PublicNavigation/></header>;
}

export function SiteFooter() {
  return <>
    <section id="contact">
      <div className="container contact-grid">
        <div className="contact-info">
          <h2 className="section-title">Contact</h2>
          <p>Vragen? Of gewoon even zeggen dat we geweldig zijn? Laat het ons weten!</p>
          <div className="contact-items">
            <div className="contact-item"><span className="contact-item-icon" aria-hidden="true">📍</span><div><span className="contact-item-label">Thuislocatie</span><div className="contact-item-val">Café Bar The Saloon, Reusel</div></div></div>
            <div className="contact-item"><span className="contact-item-icon" aria-hidden="true">✉️</span><div><span className="contact-item-label">E-mail</span><a className="contact-item-val" href="mailto:info@nsjl.nl">info@nsjl.nl</a></div></div>
          </div>
        </div>
        <div className="contact-form">
          <h3>Stuur een bericht</h3>
          <form action={process.env.FORM_SPREE_ENDPOINT||'https://formspree.io/f/mdajbaba'} method="post">
            <div className="form-group"><label htmlFor="contact-name">Je naam</label><input id="contact-name" name="naam" placeholder="Bijv. Phil Taylor (maar dan minder goed)" autoComplete="name" required maxLength={100}/></div>
            <div className="form-group"><label htmlFor="contact-email">E-mailadres</label><input id="contact-email" name="email" type="email" placeholder="jouw@email.nl" autoComplete="email" required maxLength={254}/></div>
            <div className="form-group"><label htmlFor="contact-message">Bericht</label><textarea id="contact-message" name="bericht" placeholder="Schrijf hier je bericht..." required maxLength={3000} rows={4}/></div>
            <label className="honey" aria-hidden="true">Laat leeg<input name="_gotcha" tabIndex={-1} autoComplete="off"/></label>
            <button type="submit" className="form-submit">Versturen 🎯</button>
          </form>
        </div>
      </div>
    </section>
    <footer className="site-footer">© {new Date().getFullYear()} <span>NSJL – No Skill Just Luck</span> · 3e Divisie · Reusel · Gemaakt met een biertje<div className="footer-links"><Link href="/privacy">Privacy</Link><Link href="/admin">Beheer</Link></div></footer>
  </>;
}
