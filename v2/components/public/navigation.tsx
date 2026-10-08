'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';

const links = [['/', 'Home'], ['/stand', 'Stand'], ['/wedstrijden', 'Wedstrijden'], ['/statistieken', 'Statistieken'], ['/team', 'Team'], ['/agenda', 'Agenda'], ['/nieuws', 'Nieuws'], ['/#contact', 'Contact']] as const;
export function PublicNavigation() {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!open) return;
    function close(event: KeyboardEvent) { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }
    function outside(event: PointerEvent) { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); }
    const desktop = window.matchMedia('(min-width: 901px)');
    function resized() { if (desktop.matches) { setOpen(false); } }
    document.addEventListener('keydown', close); document.addEventListener('pointerdown', outside);
    desktop.addEventListener('change', resized);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside); desktop.removeEventListener('change', resized); };
  }, [open]);
  const items = links.map(([href, label]) => <li key={href}><Link href={href} aria-current={href === '/' ? pathname === '/' ? 'page' : undefined : !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`)) ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</Link></li>);
  return <><nav aria-label="Hoofdnavigatie" className="pub-desktop-nav"><ul>{items}</ul></nav><button ref={trigger} className={`pub-menu-toggle${open ? ' is-open' : ''}`} type="button" aria-controls="public-mobile-menu" aria-expanded={open} aria-label={open ? 'Menu sluiten' : 'Menu openen'} onClick={() => setOpen(!open)}><span/><span/><span/></button><nav ref={menu} id="public-mobile-menu" aria-label="Mobiele navigatie" className="pub-mobile-nav" hidden={!open}><ul>{items}</ul></nav></>;
}
