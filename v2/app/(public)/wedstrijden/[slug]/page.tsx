import {notFound} from 'next/navigation';
import {findPublicMatch} from '@/lib/public-data';
import {MatchCard} from '@/components/public/matches';
import {ContextLabel, SourceStatus} from '@/components/public/competition';
import {Button, Page, SectionHeading} from '@/components/public/ui';
import {contextHref} from '@/components/public/format';
export const dynamic = 'force-dynamic';
export async function generateMetadata({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params, found = await findPublicMatch(slug);
  return {title: found ? found.match.homeName + ' — ' + found.match.awayName : 'Wedstrijd', alternates: {canonical: '/wedstrijden/' + slug}};
}
export default async function MatchDetail({params}: {params: Promise<{slug: string}>}) {
  const found = await findPublicMatch((await params).slug);
  if (!found) notFound();
  return <Page narrow><SectionHeading as="h1" title={(found.match.homeName || 'Thuisteam') + ' — ' + (found.match.awayName || 'Uitteam')} eyebrow="Wedstrijd"/><ContextLabel data={found.data}/><MatchCard match={found.match} detailLink={false}/>{!found.match.startTime && <p className="pub-notice">De bron verstrekt geen aanvangstijd. Vraag het team voor bevestiging.</p>}{found.match.notes && <section className="pub-card pub-match-notes"><h2>Bij deze wedstrijd</h2><p className="pub-intro">{found.match.notes}</p></section>}<SourceStatus data={found.data}/><Button href={contextHref('/wedstrijden', found.data)} secondary>Terug naar wedstrijden</Button></Page>;
}
