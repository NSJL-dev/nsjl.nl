import type {PublicData} from '@/lib/public-data';
import {numberNL} from './format';
import {EmptyState} from './ui';

export function StandingsTable({data}: {data: PublicData}) {
  if (!data.standings.length) return <EmptyState title="De stand volgt zodra er bevestigde data is."><p>We laten de actuele stand zien zodra die voor deze competitie beschikbaar is. Zomerresultaten blijven in hun eigen seizoen.</p></EmptyState>;
  return <div className="pub-table-scroll" role="region" aria-label="Competitiestand, horizontaal scrollbaar" tabIndex={0}><table className="pub-table pub-standings"><caption className="pub-sr-only">Stand van {data.context?.competition}, {data.context?.season}, {data.context?.division}</caption><thead><tr><th scope="col">Positie</th><th scope="col">Team</th><th scope="col">Games</th><th scope="col">Gewonnen</th><th scope="col">Verloren</th><th scope="col">Win %</th></tr></thead><tbody>{data.standings.map(team => <tr key={team.id} className={team.isNsjl ? 'pub-our-team' : undefined}><td><span className={`pub-position${team.position != null && team.position <= 3 ? ' pub-position--podium' : ''}`}>{team.position ?? '—'}</span></td><th scope="row">{team.name}{team.isNsjl && <span className="pub-team-tag">NSJL</span>}</th><td>{numberNL(team.games, 0)}</td><td>{numberNL(team.wins, 0)}</td><td>{numberNL(team.losses, 0)}</td><td>{numberNL(team.winPercentage, 1)}%</td></tr>)}</tbody></table></div>;
}
