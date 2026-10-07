import {notFound} from 'next/navigation';
import {getLegacyProfileStats, getPlayerData, getPlayerProfile} from '@/lib/public-data';
import {PlayerAvatar} from '@/components/public/players';
import {PlayerStatistics} from '@/components/public/statistics';
import {CompetitionSelector, ContextLabel, SourceStatus} from '@/components/public/competition';
import {Button, Page} from '@/components/public/ui';
import {contextHref, numberNL} from '@/components/public/format';
export const dynamic = 'force-dynamic';
export async function generateMetadata({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params, profile = await getPlayerProfile(slug);
  return {title: profile?.displayName || 'Speler', description: profile?.bio, alternates: {canonical: '/spelers/' + slug}};
}
export default async function Player({params, searchParams}: {params: Promise<{slug: string}>; searchParams: Promise<{context?: string}>}) {
  const {slug} = await params, data = await getPlayerData(slug, (await searchParams).context), profile = data.profiles.find(p => p.slug === slug);
  if (!profile) notFound();
  const stats = data.stats.find(row => row.stats.playerId === profile.id)?.stats, legacy = await getLegacyProfileStats(profile.id);
  const member = data.teamProfiles.some(p => p.id === profile.id);
  return <Page><header className="pub-profile-header"><PlayerAvatar profile={profile} data={data} large/><div><p className="pub-eyebrow">NSJL-profiel</p><h1>{profile.displayName}</h1>{profile.nickname && <p className="pub-intro">{profile.nickname}</p>}<p className="pub-context-label">{member ? 'Vastgelegd NSJL-lidmaatschap in deze context' : 'Geen vastgelegd NSJL-lidmaatschap in deze context'}</p></div></header>{profile.bio && <p className="pub-profile-bio">{profile.bio}</p>}<CompetitionSelector data={data} path={'/spelers/' + slug}/><ContextLabel data={data}/><section><h2>Officiële NSJL-statistieken</h2><div className="pub-player-statistics"><PlayerStatistics stats={stats}/></div></section><SourceStatus data={data}/>{legacy.length > 0 && <section className="pub-section"><h2>Historische profielcijfers</h2><p className="pub-notice pub-notice--historical">Behouden van de originele NSJL-website. Competitie- en seizoencontext zijn niet bevestigd; deze cijfers zijn geen officiële actuele Bullshooter-statistieken en tellen nergens bij op.</p>{legacy.map(row => <dl className="pub-stats-list pub-card" key={row.id}>{[['PPD', row.ppd], ['MPR', row.mpr], ['Wins', row.wins], ['Hats', row.hats]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{numberNL(value)}</dd></div>)}</dl>)}</section>}<Button href={contextHref('/team', data)} secondary>Terug naar het team</Button></Page>;
}
