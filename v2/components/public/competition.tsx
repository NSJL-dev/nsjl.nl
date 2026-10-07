import type {PublicData} from '@/lib/public-data';
import {dateNL} from './format';

export function CompetitionSelector({data, path, status}: {data: Pick<PublicData, 'context' | 'contexts'>; path: string; status?: string}) {
  if (!data.contexts.length) return <p className="pub-notice">Er is nog geen competitie beschikbaar. De teamverhalen blijven gewoon bereikbaar.</p>;
  return <form action={path} className="pub-context"><label htmlFor="public-context">Competitie, seizoen &amp; divisie</label><div><select id="public-context" name="context" defaultValue={data.context?.id ?? ''}>{!data.context && <option value="" disabled>Kies een competitie</option>}{data.contexts.map(c => <option key={c.id} value={c.id}>{c.competition} · {c.season} · {c.division}{c.competitionSlug === 'nsjl-zomer' ? ' · historisch' : ''}</option>)}</select>{status && <input type="hidden" name="status" value={status}/>}<button className="pub-button" type="submit">Tonen</button></div></form>;
}
export function ContextLabel({data}: {data: Pick<PublicData, 'context'>}) {
  return <p className="pub-context-label">{data.context ? `${data.context.competition} · ${data.context.season} · ${data.context.division}` : 'Reguliere competitie · gegevens nog niet beschikbaar'}</p>;
}
export function SourceStatus({data}: {data: Pick<PublicData, 'context' | 'report' | 'lastSync'>}) {
  const summer = data.context?.competitionSlug === 'nsjl-zomer';
  return <div className="pub-source"><span className="pub-source-label">{summer ? 'Historische zomercompetitie' : 'Bullshooter Events'}</span><p>{summer ? 'Bron: originele NSJL-website. Deze momentopname staat los van de reguliere competitie.' : data.report ? <>Bronrapport: {new Intl.DateTimeFormat('nl-NL', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(data.report.reportDatetimeLocal)}{data.lastSync?.finishedAt && <> · Gecontroleerd op {dateNL(data.lastSync.finishedAt, true)}</>}.</> : 'Nog geen officieel bronrapport verwerkt. Ontbrekende cijfers worden niet ingevuld.'}</p></div>;
}
