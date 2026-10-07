import Link from 'next/link';
import type {PublicData} from '@/lib/public-data';
import {contextHref, numberNL} from './format';
import {EmptyState} from './ui';

type Stats = PublicData['stats'][number]['stats'];
const x01Columns: [string, keyof Stats][] = [['PPD', 'x01Ppd'], ['Games', 'x01Games'], ['Wins', 'x01Wins'], ['Hats', 'x01Hats'], ['3BD', 'x013bd'], ['Ton80', 'x01Ton80'], ['HTon', 'x01Hton'], ['LTon', 'x01Lton']];
const cricketColumns: [string, keyof Stats][] = [['MPR', 'cricketMpr'], ['Games', 'cricketGames'], ['Wins', 'cricketWins'], ['Assists', 'cricketAssists'], ['Hats', 'cricketHats'], ['WHorse', 'cricketWhorse']];
const x01Extra: [string, keyof Stats][] = Array.from({length: 10}, (_, i) => [`${i + 6}DO`, `x01${i + 6}do` as keyof Stats]);
const cricketExtra: [string, keyof Stats][] = Array.from({length: 5}, (_, i) => [`${i + 5}MR`, `cricket${i + 5}mr` as keyof Stats]);
export function StatsTable({data, game, advanced = false}: {data: PublicData; game: 'x01' | 'cricket'; advanced?: boolean}) {
  const columns = game === 'x01' ? [...x01Columns, ...(advanced ? x01Extra : [])] : [...cricketColumns, ...(advanced ? cricketExtra : [])];
  const rows = data.stats.filter(({stats}) => columns.some(([, key]) => stats[key] !== null)).sort((a, b) => {
    const key = game === 'x01' ? 'x01Ppd' : 'cricketMpr';
    return a.stats[key] == null ? b.stats[key] == null ? 0 : 1 : b.stats[key] == null ? -1 : Number(b.stats[key]) - Number(a.stats[key]);
  });
  if (!rows.length) return <EmptyState title={`Nog geen officiële ${game === 'x01' ? 'X01' : 'Cricket'}-statistieken.`}><p>Zodra betrouwbare cijfers voor NSJL beschikbaar zijn, verschijnen ze hier.</p></EmptyState>;
  return <div className="pub-table-scroll" role="region" tabIndex={0} aria-label={`${game === 'x01' ? 'X01' : 'Cricket'}-statistieken, horizontaal scrollbaar`}><table className="pub-table"><caption className="pub-sr-only">NSJL-spelers, gesorteerd op {game === 'x01' ? 'PPD' : 'MPR'} binnen de geselecteerde competitiecontext</caption><thead><tr><th scope="col">Speler</th>{columns.map(([label]) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.stats.id}><th scope="row">{row.slug ? <Link href={contextHref(`/spelers/${row.slug}`, data)}>{row.playerName || row.externalName}</Link> : row.externalName}</th>{columns.map(([label, key]) => <td key={label}>{numberNL(row.stats[key] as number | string | null)}</td>)}</tr>)}</tbody></table></div>;
}
export function PlayerStatistics({stats}: {stats: Stats | undefined}) {
  if (!stats) return <EmptyState title="Geen gekoppelde NSJL-statistieken in dit seizoen."><p>Een intern profiel betekent niet automatisch dat resultaten van een ander team bij NSJL horen.</p></EmptyState>;
  return <div className="pub-detail-grid">{([['X01', [...x01Columns, ...x01Extra]], ['Cricket', [...cricketColumns, ...cricketExtra]]] as const).map(([title, columns]) => <section className="pub-card" key={title}><h3>{title}</h3><dl className="pub-stats-list">{columns.map(([label, key]) => <div key={label}><dt>{label}</dt><dd>{numberNL(stats[key] as number | string | null)}</dd></div>)}</dl></section>)}</div>;
}
