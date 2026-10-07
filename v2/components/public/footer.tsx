import Link from 'next/link';

export function PublicFooter() {
  return <footer className="pub-footer"><div className="pub-container"><p>© {new Date().getFullYear()} <strong>NSJL — No Skill Just Luck</strong><span>Reusel · Gemaakt met een biertje</span></p><nav aria-label="Footernavigatie"><Link href="/privacy">Privacy</Link><Link href="/admin">Beheer</Link><Link href="/#contact">Contact</Link></nav></div></footer>;
}
