import {getHomeData} from '@/lib/public-data';
import {Hero} from '@/components/public/hero';
import {CompetitionSelector, ContextLabel, SourceStatus} from '@/components/public/competition';
import {StandingsTable} from '@/components/public/standings';
import {PlayerCards} from '@/components/public/players';
import {MatchSection} from '@/components/public/matches';
import {NewsCards} from '@/components/public/news';
import {ContactSection} from '@/components/public/contact';
import {SectionHeading} from '@/components/public/ui';
import {contextHref} from '@/components/public/format';
export const dynamic = 'force-dynamic';
export const metadata = {alternates: {canonical: '/'}};
export default async function Home({searchParams}: {searchParams: Promise<{context?: string}>}) {
  const data = await getHomeData((await searchParams).context);
  return <main id="main" tabIndex={-1}>
    <Hero data={data}/>
    <section id="stand" className="pub-section"><div className="pub-container"><SectionHeading title="Competitie Stand" href={contextHref('/stand', data)} linkLabel="Volledige stand"/><ContextLabel data={data}/><CompetitionSelector data={data} path="/"/><StandingsTable data={data}/><SourceStatus data={data}/></div></section>
    <section id="team" className="pub-section pub-section--soft"><div className="pub-container"><SectionHeading title="Ons Team" intro="Geen garanties, wel gezelligheid." href={contextHref('/team', data)} linkLabel="Ontmoet het team"/><PlayerCards data={data}/><p className="pub-notice">Spelers en cijfers horen bij het geselecteerde team en seizoen. De oorspronkelijke profielen blijven op de teampagina bereikbaar.</p></div></section>
    <MatchSection data={data}/>
    <section id="nieuws" className="pub-section"><div className="pub-container"><SectionHeading title="Nieuws & Updates" intro="Het laatste NSJL-nieuws" href="/nieuws" linkLabel="Alle berichten"/><NewsCards data={data} limit={3}/></div></section>
    <ContactSection settings={data.settings}/>
  </main>;
}
