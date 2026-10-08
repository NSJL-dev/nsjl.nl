import {agendaInProgress, agendaTime, agendaTypeLabel, agendaZone, type AgendaItem} from '@/lib/agenda';
import {dateNL} from './format';

export function AgendaCard({item, now, past = false}: {item: AgendaItem; now: Date; past?: boolean}) {
  const titleId = `agenda-${item.id}`, startDate = dateNL(item.startsAt, true);
  const endDate = item.endsAt ? dateNL(item.endsAt, true) : null;
  const zoneChanged = Boolean(item.endsAt && agendaZone(item.startsAt) !== agendaZone(item.endsAt));
  return <article className="pub-card pub-agenda-card" aria-labelledby={titleId}>
    <div className="pub-agenda-top"><span className="pub-status">{agendaTypeLabel(item.eventType)}</span>{past ? <span className="pub-agenda-note">Afgelopen</span> : agendaInProgress(item, now) ? <span className="pub-status pub-status--warning">Nu bezig</span> : null}</div>
    <h3 id={titleId} className="pub-agenda-title">{item.title}</h3>
    <dl className="pub-agenda-meta">
      <div><dt>Datum</dt><dd><time dateTime={item.startsAt.toISOString()}>{startDate}</time></dd></div>
      <div><dt>Tijd</dt><dd><time dateTime={item.startsAt.toISOString()}>{agendaTime(item.startsAt, zoneChanged)}</time>{item.endsAt && <> – <time dateTime={item.endsAt.toISOString()}>{endDate !== startDate && <>{endDate}, </>}{agendaTime(item.endsAt, zoneChanged)}</time></>} uur{!item.endsAt && <span className="pub-agenda-note">Geen eindtijd opgegeven</span>}</dd></div>
      <div><dt>Locatie</dt><dd>{item.location.trim() || 'Locatie nog niet bekend'}</dd></div>
    </dl>
    <p className={`pub-agenda-description${item.description.trim() ? '' : ' pub-agenda-note'}`}>{item.description.trim() || 'Er is nog geen omschrijving toegevoegd.'}</p>
  </article>;
}
export function AgendaList({items, now, past = false}: {items: AgendaItem[]; now: Date; past?: boolean}) {
  return <ol className="pub-agenda-list">{items.map(item => <li key={item.id}><AgendaCard item={item} now={now} past={past}/></li>)}</ol>;
}
