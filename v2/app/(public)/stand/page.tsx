import {getPublicData} from '@/lib/public-data';
import {CompetitionSelector, ContextLabel, SourceStatus} from '@/components/public/competition';
import {StandingsTable} from '@/components/public/standings';
import {Page, SectionHeading} from '@/components/public/ui';
export const dynamic = 'force-dynamic';
export const metadata = {title: 'Competitiestand', description: 'De volledige NSJL-competitiestand, met het juiste seizoen en de juiste divisie.', alternates: {canonical: '/stand'}};
export default async function Stand({searchParams}: {searchParams: Promise<{context?: string}>}) {
  const data = await getPublicData((await searchParams).context);
  return <Page><SectionHeading as="h1" title="Competitie Stand" intro="Elke leg telt. Ook als het vooral geluk was."/><CompetitionSelector data={data} path="/stand"/><ContextLabel data={data}/><StandingsTable data={data}/><SourceStatus data={data}/><p className="pub-notice">Games, gewonnen en verloren verwijzen naar legs. De positie volgt de bronvolgorde. Teams zonder verwerkte uitslag kunnen nog ontbreken.</p></Page>;
}
