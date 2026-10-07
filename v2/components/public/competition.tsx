import type {PublicData} from '@/lib/public-data';

export function CompetitionSelector({data, path, status}: {data: Pick<PublicData, 'context' | 'contexts'>; path: string; status?: string}) {
  if (!data.contexts.length) return <p className="pub-notice">Er is nog geen competitie beschikbaar. De teamverhalen blijven gewoon bereikbaar.</p>;
  return <form action={path} className="pub-context"><label htmlFor="public-context">Competitie, seizoen &amp; divisie</label><div><select id="public-context" name="context" defaultValue={data.context?.id ?? ''}>{!data.context && <option value="" disabled>Kies een competitie</option>}{data.contexts.map(c => <option key={c.id} value={c.id}>{c.competition} · {c.season} · {c.division}{c.competitionSlug === 'nsjl-zomer' ? ' · historisch' : ''}</option>)}</select>{status && <input type="hidden" name="status" value={status}/>}<button className="pub-button" type="submit">Tonen</button></div></form>;
}
export function ContextLabel({data}: {data: Pick<PublicData, 'context' | 'contextState'>}) {
  return <p className="pub-context-label">{data.context ? `${data.context.competition} · ${data.context.season} · ${data.context.division}` : data.contextState === 'invalid' ? 'Geen geldige competitie geselecteerd' : data.contextState === 'ambiguous' ? 'Kies de gewenste NSJL-divisie' : 'Reguliere competitie · gegevens nog niet beschikbaar'}</p>;
}
export function SourceStatus({data}: {data: Pick<PublicData, 'context' | 'report' | 'lastSync'>}) {
  const summer = data.context?.competitionSlug === 'nsjl-zomer';
  const historic = data.context && (!data.context.isCurrent || data.context.seasonStatus === 'archived');
  return <div className="pub-source"><span className="pub-source-label">{summer ? 'Historische zomercompetitie' : historic ? 'Historische Bullshootergegevens' : 'Bullshooter Events'}</span><p>{summer ? 'Bron: originele NSJL-website. Deze momentopname staat los van de reguliere competitie.' : data.report ? <>Bronrapport: {new Intl.DateTimeFormat('nl-NL', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(data.report.reportDatetimeLocal)}{data.lastSync?.finishedAt && <> · Gecontroleerd op {new Intl.DateTimeFormat('nl-NL', {day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'}).format(data.lastSync.finishedAt)}</>}.</> : 'Nog geen geslaagde synchronisatie bevestigd. Ontbrekende cijfers worden niet ingevuld.'}</p></div>;
}
