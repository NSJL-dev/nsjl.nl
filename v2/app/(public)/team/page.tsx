import {getTeamData} from '@/lib/public-data';
import {CompetitionSelector, ContextLabel} from '@/components/public/competition';
import {PlayerCards} from '@/components/public/players';
import {Page, SectionHeading} from '@/components/public/ui';
export const dynamic = 'force-dynamic';
export const metadata = {title: 'Ons team', description: 'Ontmoet de spelers van No Skill Just Luck en lees de oorspronkelijke NSJL-profielen.', alternates: {canonical: '/team'}};
export default async function Team({searchParams}: {searchParams: Promise<{context?: string}>}) {
  const data = await getTeamData((await searchParams).context), currentIds = new Set(data.teamProfiles.map(p => p.id));
  const others = data.profiles.filter(p => !currentIds.has(p.id));
  return <Page><SectionHeading as="h1" title="Ons Team" intro="Geen garanties, wel gezelligheid."/><CompetitionSelector data={data} path="/team"/><ContextLabel data={data}/><PlayerCards data={data}/><p className="pub-notice">Dit overzicht volgt de vastgelegde lidmaatschappen van het geselecteerde team en seizoen. Een persoonsprofiel is geen automatische teamkoppeling.</p>{others.length > 0 && <section className="pub-section"><SectionHeading title="Meer NSJL-profielen" intro="Bekend van de oorspronkelijke website. Deze profielen bewijzen geen lidmaatschap van het geselecteerde team en seizoen."/><PlayerCards data={data} profiles={others} archive/></section>}</Page>;
}
