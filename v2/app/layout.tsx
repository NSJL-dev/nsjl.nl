import type {Metadata} from 'next';
import './globals.css';
import './design-tokens.css';
import {AuthMailBridge} from '@/components/auth/mail-bridge';
export const metadata:Metadata={metadataBase:new URL(process.env.APP_URL||'http://localhost:3000'),title:{default:'NSJL — No Skill Just Luck',template:'%s | NSJL'},description:'No Skill Just Luck: ons dartteam uit Reusel. Stand, wedstrijden, spelers en nieuws. Geen garanties, wel gezelligheid.',robots:process.env.APP_ENV==='production'?{index:true,follow:true}:{index:false,follow:false},openGraph:{title:'NSJL — No Skill Just Luck',description:'Waar geluk harder werkt dan training.',locale:'nl_NL',type:'website',images:[{url:'/img/logo-nsjl.png',width:2031,height:2058,alt:'NSJL-logo'}]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="nl"><body><a className="skip-link" href="#main">Naar inhoud</a><AuthMailBridge allowLocalHttp={!process.env.APP_ENV||process.env.APP_ENV==='development'}/>{children}</body></html>;}
