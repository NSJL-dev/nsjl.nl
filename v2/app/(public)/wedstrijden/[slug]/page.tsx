import {notFound} from 'next/navigation';
import {getSiteData,getContexts} from '@/lib/queries';
import {MatchCard,SectionHead,SourceNote} from '@/components/data-ui';
export const dynamic='force-dynamic';
async function find(slug:string){for(const c of await getContexts()){const data=await getSiteData(c.id),match=data.matches.find(m=>m.slug===slug);if(match)return{data,match};}return null;}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params,found=await find(slug);return{title:found?`${found.match.homeName} — ${found.match.awayName}`:'Wedstrijd',alternates:{canonical:`/wedstrijden/${slug}`}};}
export default async function MatchDetail({params}:{params:Promise<{slug:string}>}){const found=await find((await params).slug);if(!found)notFound();return <main className="wrap page-content narrow" id="main"><SectionHead eyebrow={`${found.data.context.division} · ${found.data.context.season}`} title="Aan het bord."/><MatchCard match={found.match}/><p className="notice">{found.match.startTime?'Aanvangstijd volgens de bron.':'De bron verstrekt geen aanvangstijd. Vraag het team voor bevestiging.'}</p>{found.match.notes&&<p>{found.match.notes}</p>}<SourceNote data={found.data}/></main>;}
