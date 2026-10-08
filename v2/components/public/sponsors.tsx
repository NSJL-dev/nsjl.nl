import Image from 'next/image';
import {Handshake} from 'lucide-react';
import type {PublicSponsorsData} from '@/lib/public-data';
import {publicMediaUrl} from '@/lib/media';
import {EmptyState} from './ui';

export function sponsorWebsite(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
export function SponsorCards({data}: {data: PublicSponsorsData}) {
  if (!data.sponsors.length) return <EmptyState title="Nog geen sponsors zichtbaar."><p>Onze actieve sponsors verschijnen hier zodra ze zijn toegevoegd.</p></EmptyState>;
  const logos = new Map(data.media.map(media => [media.id, media]));
  return <div className="pub-sponsors-grid">{data.sponsors.map(sponsor => {
    const logo = sponsor.logoMediaId ? logos.get(sponsor.logoMediaId) : undefined, website = sponsorWebsite(sponsor.websiteUrl);
    return <article className="pub-sponsor-card" key={sponsor.id}>
      <div className={`pub-sponsor-logo${logo ? '' : ' pub-sponsor-logo--empty'}`}>{logo ? <Image unoptimized src={publicMediaUrl(logo.id)} width={480} height={240} alt={logo.altText || `Logo van ${sponsor.name}`} sizes="(max-width: 660px) 100vw, (max-width: 900px) 50vw, 400px"/> : <Handshake size={40} aria-hidden="true"/>}</div>
      <div className="pub-sponsor-body"><h2>{sponsor.name}</h2>{sponsor.description.trim() && <p className="pub-sponsor-description">{sponsor.description}</p>}{website && <a className="pub-button pub-button--secondary" href={website} target="_blank" rel="noopener noreferrer" aria-label={`Website van ${sponsor.name} (opent in een nieuw tabblad)`}>Bekijk website <span aria-hidden="true">↗</span></a>}</div>
    </article>;
  })}</div>;
}
