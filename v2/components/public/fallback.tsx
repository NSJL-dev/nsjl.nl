'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {PublicHeader} from './header';
import {PublicFooter} from './footer';
import {PublicErrorState} from './error-state';

export function PublicFallback() {
  const pathname = usePathname();
  // Unknown admin routes retain the existing admin presentation.
  if (pathname?.startsWith('/admin')) return <main className="wrap page-content" id="main"><span className="eyebrow">DIE PIJL IS ERNAAST</span><h1>Pagina niet gevonden.</h1><p>Gelukkig is er altijd een volgende worp.</p><Link className="button" href="/">Terug naar NSJL</Link></main>;
  return <div className="public-site"><PublicHeader/><PublicErrorState notFound/><PublicFooter/></div>;
}
