import Link from 'next/link';
import type {PublicData} from '@/lib/public-data';
import {contextHref, dateNL, type Match} from './format';
import {EmptyState, SectionHeading} from './ui';

export function MatchCard({match, label, detailLink = true}: {match: Match | undefined; label?: string; detailLink?: boolean}) {
  if (!match) return <EmptyState title={label || 'Nog geen bevestigde wedstrijd.'} compact><p>Datum en tegenstander volgen zodra ze bekend zijn.</p></EmptyState>;
  const completed = match.status === 'completed';
  const status = completed ? 'Gespeeld' : match.status === 'postponed' ? 'Schema gewijzigd / verplaatst' : match.status === 'cancelled' ? 'Geannuleerd' : 'Op het programma';
  const score = completed ? `${match.homeScore ?? '—'} – ${match.awayScore ?? '—'}` : 'vs';
  return <article className="pub-match-card">{label && <p className="pub-eyebrow">{label}</p>}<div className="pub-match-top"><time dateTime={match.playedDate || match.scheduledDate || undefined}>{dateNL(match.playedDate || match.scheduledDate, true)}</time>{match.week != null && <span>Week {match.week}</span>}</div><h3 className="pub-match-teams"><span className={match.homeNsjl ? 'pub-nsjl-name' : undefined}>{match.homeName || 'Thuisteam volgt'}<small>Thuis</small></span><span className={`pub-match-score${completed ? ' is-result' : ''}`} aria-label={completed ? `Uitslag ${score}` : 'tegen'}>{score}</span><span className={match.awayNsjl ? 'pub-nsjl-name' : undefined}>{match.awayName || 'Uitteam volgt'}<small>Uit</small></span></h3><p className="pub-match-location">{match.venue || 'Locatie nog niet bevestigd'}{match.startTime && <> · {match.startTime.slice(0, 5)} uur</>}</p><div className="pub-match-bottom"><span className={`pub-status${match.status === 'postponed' ? ' pub-status--warning' : ''}`}>{status}</span>{detailLink && <Link className="pub-text-link" href={`/wedstrijden/${match.slug}`}>Details <span aria-hidden="true">→</span><span className="pub-sr-only"> {match.homeName} tegen {match.awayName}</span></Link>}</div></article>;
}
export function MatchSection({data}: {data: PublicData}) {
  const upcoming = data.matches.filter(m => ['scheduled', 'postponed'].includes(m.status) && m.scheduledDate && m.scheduledDate >= data.today).slice(0, 3);
  return <section id="wedstrijden" className="pub-section pub-section--soft"><div className="pub-container"><SectionHeading title="Wedstrijden" intro="Komende & gespeelde wedstrijden dit seizoen" href={contextHref('/wedstrijden', data)} linkLabel="Alle wedstrijden"/><div className="pub-match-featured"><div><h3 className="pub-group-heading">Laatste uitslag</h3><MatchCard match={data.latest}/></div><div><h3 className="pub-group-heading">Volgende wedstrijd</h3><MatchCard match={upcoming[0]}/></div></div>{upcoming.length > 1 && <><h3 className="pub-group-heading">Daarna op het programma</h3><div className="pub-matches-grid">{upcoming.slice(1).map(match => <MatchCard key={match.id} match={match}/>)}</div></>}</div></section>;
}
