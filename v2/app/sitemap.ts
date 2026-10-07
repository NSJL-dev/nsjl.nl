import type {MetadataRoute} from 'next';
import {getPublicData} from '@/lib/public-data';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const root = process.env.APP_URL || 'http://localhost:3000', data = await getPublicData();
  return ['/', '/stand', '/wedstrijden', '/statistieken', '/team', '/nieuws', '/privacy', ...data.profiles.map(p => '/spelers/' + p.slug), ...data.news.map(p => '/nieuws/' + p.slug), ...data.matches.map(m => '/wedstrijden/' + m.slug)].map(p => ({url: root + p}));
}
