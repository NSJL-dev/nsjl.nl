import Link from 'next/link';
import {getPublicData} from '@/lib/public-data';
import {CompetitionSelector, ContextLabel, SourceStatus} from '@/components/public/competition';
import {MatchCard} from '@/components/public/matches';
import {EmptyState, Page, SectionHeading} from '@/components/public/ui';
import {contextHref, matchGroup} from '@/components/public/format';
export const dynamic = 'force-dynamic';
export const metadata = {title: 'Wedstrijden', description: 'Het NSJL-wedstrijdschema, aankomende wedstrijden en bevestigde uitslagen.', alternates: {canonical: '/wedstrijden'}};
const filters = [['all', 'Alles'], ['upcoming', 'Komend'], ['completed', 'Gespeeld'], ['pending', 'Uitslag volgt'], ['cancelled', 'Geannuleerd']] as const;
export default async function Matches({searchParams}: {searchParams: Promise<{context?: string; status?: string}>}) {
  const params = await searchParams, data = await getPublicData(params.context);
  const status = filters.some(([key]) => key === params.status) ? params.status! : 'all';
  const groups = filters.slice(1).map(([key, title]) => ({key, title, rows: data.matches.filter(m => matchGroup(m, data.today) === key).sort((a, b) => key === 'completed' ? (b.playedDate || b.scheduledDate || '').localeCompare(a.playedDate || a.scheduledDate || '') : (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999'))})).filter(group => status === 'all' || status === group.key);
  return <Page><SectionHeading as="h1" title="Wedstrijden" intro="Waar we spelen, tegen wie en hoe het afliep."/><CompetitionSelector data={data} path="/wedstrijden" status={status}/><ContextLabel data={data}/><nav className="pub-filter-bar" aria-label="Wedstrijden filteren">{filters.map(([key, title]) => {const base = contextHref('/wedstrijden', data);return <Link href={base + (base.includes('?') ? '&' : '?') + 'status=' + key} key={key} aria-current={status === key ? 'page' : undefined}>{title}</Link>;})}</nav>{data.matches.length ? groups.filter(group => group.rows.length || status !== 'all').map(group => <section key={group.key}><h2 className="pub-group-heading">{group.title}</h2>{group.rows.length ? <div className="pub-matches-grid">{group.rows.map(match => <MatchCard match={match} key={match.id}/>)}</div> : <EmptyState title="Geen wedstrijden in deze selectie." compact/>}</section>) : <EmptyState title="Het wedstrijdschema volgt."><p>Er zijn nog geen bevestigde wedstrijden in deze competitiecontext. We vullen geen tegenstanders, uitslagen of tijden in.</p></EmptyState>}<SourceStatus data={data}/></Page>;
}
