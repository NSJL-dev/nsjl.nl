import Link from 'next/link';
import Image from 'next/image';
import type {SiteData} from '@/lib/queries';
import {publicMediaUrl} from '@/lib/media';
import {dateNL} from './data-ui';
export {ContextSelect,SourceNote,dateNL,reportDateNL} from './data-ui';

export function StandTable({data}:{data:SiteData}) {
  return <div className="stand-table-wrap"><table className="stand-table"><caption className="sr-only">Stand van {data.context.competition}, {data.context.season}, {data.context.division}</caption><thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Losses</th><th scope="col">Win %</th></tr></thead><tbody>{data.standings.map(t=><tr key={t.id} className={t.isNsjl?'nsjl-row':undefined}><td><span className={`pos-badge pos-${t.position!==null&&t.position<=3?t.position:'other'}`}>{t.position??'—'}</span></td><th scope="row" className="team-label">{t.name}{t.isNsjl&&<span className="nsjl-tag">NSJL</span>}</th><td>{t.games}</td><td>{t.wins}</td><td>{t.losses??'—'}</td><td>{Number(t.winPercentage).toLocaleString('nl-NL',{maximumFractionDigits:1})}%</td></tr>)}{data.standings.length===0&&<tr><td colSpan={6} className="empty">Nog geen bevestigde stand.</td></tr>}</tbody></table></div>;
}

type Match=SiteData['matches'][number];
export function MatchCard({match,label}:{match:Match|undefined;label?:string}) {
  if(!match)return <div className="match-item"><p className="empty">Nog geen bevestigde wedstrijd beschikbaar.</p></div>;
  const completed=match.status==='completed';
  const nsjlScore=match.homeNsjl?match.homeScore:match.awayScore,opponentScore=match.homeNsjl?match.awayScore:match.homeScore;
  const result=nsjlScore!==null&&opponentScore!==null?(nsjlScore>opponentScore?'w':nsjlScore<opponentScore?'l':'d'):'d';
  return <article className="match-item">{label&&<h3 className="schema-col-title">{label}</h3>}<div className="match-date">📅 {dateNL(match.playedDate||match.scheduledDate,true)}{match.startTime&&` · ${match.startTime.slice(0,5)}`}{match.week!==null&&` · Week ${match.week}`}</div><h3 className="match-teams"><span>{match.homeNsjl?'NSJL':match.homeName}</span> – <span>{match.awayNsjl?'NSJL':match.awayName}</span></h3><p className="match-location">📍 {match.venue||'Locatie volgt'}</p>{completed&&<span className={`match-result result-${result}`}>{match.homeScore??'—'} – {match.awayScore??'—'}</span>}{match.status==='postponed'&&<p className="match-location">Schema gewijzigd / verplaatst</p>}<Link className="text-link match-detail" href={`/wedstrijden/${match.slug}`}>Bekijk wedstrijd <span aria-hidden="true">→</span><span className="sr-only"> {match.homeName} tegen {match.awayName}</span></Link></article>;
}

export function ProfileCards({data}:{data:SiteData}) {
  return <div className="players-grid">{data.profiles.map(p=>{
    const stats=data.stats.find(v=>v.stats.playerId===p.id)?.stats,photo=data.media.find(m=>m.id===p.photoMediaId);
    const initials=`${p.firstName} ${p.lastName}`.split(/\s+/).map(part=>part[0]).join('');
    return <Link href={`/spelers/${p.slug}?context=${data.context.id}`} className="player-card" key={p.id}><div className="player-avatar">{photo?<Image src={publicMediaUrl(photo.storagePath)} alt={photo.altText} width={72} height={72}/>:initials}</div><h3 className="player-name">{p.displayName}</h3>{p.nickname&&<p className="player-nick">{p.nickname}</p>}<div className="player-stats">{[['PPD',stats?.x01Ppd],['MPR',stats?.cricketMpr],['Wins',stats?.x01Wins],['Hats',stats?.x01Hats]].map(([name,value])=><div className="pstat" key={name}><div className="pstat-val">{value??'—'}</div><div className="pstat-label">{name}</div></div>)}</div>{!stats&&<p className="player-note">Geen bevestigde cijfers voor dit team en seizoen.</p>}</Link>;
  })}</div>;
}

export function NewsCards({data}:{data:SiteData}) {
  return <div className="nieuws-grid">{data.news.map(n=>{
    const media=data.media.find(m=>m.id===n.featuredMediaId);
    const category=n.category.toLocaleLowerCase('nl-NL');
    const kind=category==='statistieken'?'stats':category==='aankondiging'?'announcement':'news';
    return <Link className="nieuws-card" key={n.id} href={`/nieuws/${n.slug}`}><div className={`nieuws-img nieuws-img-${kind}`}>{media?<Image src={publicMediaUrl(media.storagePath)} alt={media.altText} width={720} height={400}/>:<span aria-hidden="true">{kind==='stats'?'🎯':kind==='announcement'?'📢':category==='wedstrijdverslag'?'🏆':'📰'}</span>}</div><div className="nieuws-body"><span className="nieuws-tag">{n.category}</span><h3 className="nieuws-title">{n.title}</h3><p className="nieuws-excerpt">{n.excerpt}</p><div className="nieuws-date">{dateNL(n.publishedAt,true)}</div></div></Link>;
  })}</div>;
}

export function SectionHead({eyebrow,title,href,linkLabel,as='h2'}:{eyebrow?:string;title:string;href?:string;linkLabel?:string;as?:'h1'|'h2'}) {
  const Heading=as;
  return <div className="section-head"><div>{eyebrow&&<p className="section-sub">{eyebrow}</p>}<Heading className="section-title">{title}</Heading></div>{href&&<Link className="text-link" href={href}>{linkLabel||'Bekijk alles'} <span aria-hidden="true">→</span></Link>}</div>;
}
