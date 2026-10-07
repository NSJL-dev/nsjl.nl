import Link from 'next/link';
import {getSiteData} from '@/lib/queries';
import {ContextSelect,MatchCard,StandTable,ProfileCards,NewsCards,SourceNote,dateNL} from '@/components/public-data-ui';
export const dynamic='force-dynamic';
export default async function Home({searchParams}:{searchParams:Promise<{context?:string}>}) {
  const data=await getSiteData((await searchParams).context);
  const upcoming=data.matches.filter(m=>['scheduled','postponed'].includes(m.status)&&m.scheduledDate&&m.scheduledDate>=data.today);
  const completed=data.matches.filter(m=>m.status==='completed').reverse();
  const events=data.events.filter(e=>e.startsAt>=new Date());
  return <main id="main">
    <section id="hero"><div className="hero-inner container"><div>
      <div className="hero-badge">🎯 {data.context.competition} {data.context.season}</div>
      <h1 className="hero-title">No Skill<br/>Just <span>Luck</span></h1>
      <p className="hero-subtitle">{data.settings.hero_subtitle}</p>
      <div className="hero-stats">
        <div className="hero-stat"><div className="hero-stat-num">{data.nsjl?.position!==null&&data.nsjl?.position!==undefined?`${data.nsjl.position}e`:'—'}</div><div className="hero-stat-label">Competitie stand</div></div>
        <div className="hero-stat"><div className="hero-stat-num">{data.nsjl?.wins??'—'}</div><div className="hero-stat-label">Gewonnen</div></div>
        <div className="hero-stat"><div className="hero-stat-num">{data.profiles.length}</div><div className="hero-stat-label">Spelers</div></div>
        <div className="hero-stat"><div className="hero-stat-num">{data.stats.length?`${data.stats.reduce((sum,row)=>sum+(row.stats.x01Hats??0),0)}x`:'—'}</div><div className="hero-stat-label">Hattrick</div></div>
      </div>
      <Link href="#stand" className="hero-cta">Bekijk de Stand <span aria-hidden="true">→</span></Link>
    </div></div></section>
    <section id="stand"><div className="container"><h2 className="section-title">Competitie Stand</h2><p className="section-sub">{data.context.competition} {data.context.season}</p><ContextSelect data={data} path="/"/><StandTable data={data}/><SourceNote data={data}/><Link className="text-link" href={`/stand?context=${data.context.id}`}>Bekijk de competitiestand →</Link></div></section>
    <section id="team"><div className="container"><h2 className="section-title">Ons Team</h2><ProfileCards data={data}/><p className="source-note">Statistieken horen bij het gekozen team en seizoen. Onbewezen historische profielcijfers tellen niet mee.</p><Link className="text-link" href={`/statistieken?context=${data.context.id}`}>Bekijk de statistieken →</Link></div></section>
    <section id="schema"><div className="container"><h2 className="section-title">Wedstrijdschema</h2><p className="section-sub">Komende &amp; gespeelde wedstrijden dit seizoen</p><div className="schema-grid"><div><h3 className="schema-col-title">📅 Komende Wedstrijden</h3>{upcoming.length?upcoming.map(match=><MatchCard key={match.id} match={match}/>):<p className="empty">Nog geen bevestigde toekomstige wedstrijden.</p>}</div><div><h3 className="schema-col-title">✓ Gespeelde Wedstrijden</h3>{completed.length?completed.map(match=><MatchCard key={match.id} match={match}/>):<p className="empty">Nog geen bevestigde uitslagen.</p>}</div></div><Link className="text-link" href={`/wedstrijden?context=${data.context.id}`}>Bekijk het wedstrijdschema →</Link>{events.length>0&&<div className="team-agenda"><h3 className="schema-col-title">Teamagenda</h3>{events.map(event=><article className="match-item" key={event.id}><div className="match-date">📅 {dateNL(event.startsAt,true)}</div><h3 className="match-teams">{event.title}</h3><p className="match-location">📍 {event.location}</p></article>)}</div>}{data.sponsors.length>0&&<div className="sponsor-row"><span>Mede mogelijk gemaakt door</span>{data.sponsors.map(sponsor=><a key={sponsor.id} href={sponsor.websiteUrl||undefined} rel="noopener noreferrer">{sponsor.name}</a>)}</div>}</div></section>
    <section id="nieuws"><div className="container"><h2 className="section-title">Nieuws &amp; Updates</h2><p className="section-sub">Het laatste NSJL-nieuws</p><NewsCards data={data}/></div></section>
  </main>;
}
