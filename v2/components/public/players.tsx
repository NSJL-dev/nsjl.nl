import Image from 'next/image';
import Link from 'next/link';
import type {PublicData} from '@/lib/public-data';
import {publicMediaUrl} from '@/lib/media';
import {contextHref, numberNL} from './format';
import {EmptyState} from './ui';

type Profile = PublicData['profiles'][number];
export function PlayerAvatar({profile, data, large = false}: {profile: Profile; data: Pick<PublicData, 'media'>; large?: boolean}) {
  const photo = data.media.find(m => m.id === profile.photoMediaId);
  const initials = `${profile.firstName[0] || ''}${profile.lastName.replace(/^van (de |den )?/i, '')[0] || ''}`;
  return <div className={`pub-avatar${large ? ' pub-avatar--large' : ''}`}>{photo ? <Image src={publicMediaUrl(photo.storagePath)} alt={photo.altText || profile.displayName} width={large ? 180 : 88} height={large ? 180 : 88} sizes={large ? '180px' : '88px'}/> : <span aria-label={`Profiel van ${profile.displayName}, foto ontbreekt`}>{initials}</span>}</div>;
}
export function PlayerCards({data, profiles = data.teamProfiles, archive = false}: {data: PublicData; profiles?: Profile[]; archive?: boolean}) {
  if (!profiles.length) return <EmptyState title="Nog geen spelers bevestigd voor deze context."><p>De oorspronkelijke spelersprofielen vind je op de teampagina. Een profiel alleen bewijst geen lidmaatschap van dit team en seizoen.</p></EmptyState>;
  return <div className="pub-players-grid">{profiles.map(profile => {
    const stats = archive ? undefined : data.stats.find(v => v.stats.playerId === profile.id)?.stats;
    return <Link href={contextHref(`/spelers/${profile.slug}`, data)} className="pub-player-card" key={profile.id}><PlayerAvatar profile={profile} data={data}/><h3>{profile.displayName}</h3>{profile.nickname && <p className="pub-player-nickname">{profile.nickname}</p>}{archive ? <p className="pub-player-note">Origineel NSJL-profiel · geen bewijs van actueel teamlidmaatschap</p> : <><dl className="pub-player-stats">{[['PPD', stats?.x01Ppd], ['MPR', stats?.cricketMpr], ['X01 wins', stats?.x01Wins], ['X01 hats', stats?.x01Hats]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{numberNL(value)}</dd></div>)}</dl>{!stats && <p className="pub-player-note">Nog geen officiële cijfers voor dit team en seizoen.</p>}</>}<span className="pub-text-link">Bekijk profiel <span aria-hidden="true">→</span></span></Link>;
  })}</div>;
}
