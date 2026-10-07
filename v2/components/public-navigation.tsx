'use client';
import Link from 'next/link';
import {useState} from 'react';

const links=[['/#stand','Stand','🏆 Competitie Stand'],['/#team','Team','👥 Team Info'],['/#schema','Schema','📅 Wedstrijdschema'],['/#nieuws','Nieuws','📰 Nieuws'],['/#contact','Contact','✉️ Contact']];

export function PublicNavigation() {
  const [open,setOpen]=useState(false);
  return <>
    <nav aria-label="Hoofdnavigatie"><ul className="nav-links"><li><span aria-disabled="true" title="Liveweergave is nog niet beschikbaar">Live</span></li>{links.map(([href,label])=><li key={href}><Link href={href}>{label}</Link></li>)}</ul></nav>
    <button type="button" className="hamburger" aria-label={open?'Menu sluiten':'Menu openen'} aria-expanded={open} aria-controls="public-mobile-menu" onClick={()=>setOpen(!open)}><span/><span/><span/></button>
    <nav id="public-mobile-menu" aria-label="Mobiele navigatie" className={`mobile-menu${open?' open':''}`} hidden={!open} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}><span aria-disabled="true">🎯 Live Stand · nog niet beschikbaar</span>{links.map(([href,,label])=><Link key={href} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}</nav>
  </>;
}
