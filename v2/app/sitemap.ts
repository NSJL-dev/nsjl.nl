import type {MetadataRoute} from 'next';
import {getSiteData} from '@/lib/queries';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{const root=process.env.APP_URL||'http://localhost:3000',data=await getSiteData();return['/','/stand','/wedstrijden','/statistieken',...data.profiles.map(p=>`/spelers/${p.slug}`),...data.news.map(p=>`/nieuws/${p.slug}`),...data.matches.map(m=>`/wedstrijden/${m.slug}`)].map(p=>({url:`${root}${p}`}));}
