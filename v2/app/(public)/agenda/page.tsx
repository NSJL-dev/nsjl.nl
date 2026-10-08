import {getAgendaData} from '@/lib/public-data';
import {groupAgenda} from '@/lib/agenda';
import {AgendaList} from '@/components/public/agenda';
import {EmptyState, Page, SectionHeading} from '@/components/public/ui';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = {title: 'Agenda', description: 'Trainingen, toernooien en teamactiviteiten van No Skill Just Luck.', alternates: {canonical: '/agenda'}};

export default async function Agenda() {
  const items = await getAgendaData(), now = new Date(), {upcoming, past} = groupAgenda(items, now);
  return <Page>
    <SectionHeading as="h1" title="Agenda" intro="Trainingen, toernooien en gezelligheid. Hier vind je wat er op de planning staat."/>
    <p className="pub-context-label">Alle datums en tijden zijn in de tijdzone Europe/Amsterdam.</p>
    <section aria-labelledby="agenda-upcoming"><h2 id="agenda-upcoming" className="pub-group-heading">Aankomende &amp; lopende activiteiten</h2>{upcoming.length ? <AgendaList items={upcoming} now={now}/> : <EmptyState title="Nog geen aankomende activiteiten."><p>Zodra er iets op de agenda staat, vind je het hier.</p></EmptyState>}</section>
    <section aria-labelledby="agenda-past"><h2 id="agenda-past" className="pub-group-heading">Afgelopen activiteiten</h2>{past.length ? <AgendaList items={past} now={now} past/> : <EmptyState title="Nog geen afgelopen activiteiten." compact/>}</section>
  </Page>;
}
