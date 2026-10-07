import type {MetadataRoute} from 'next';
import {getSitemapData} from '@/lib/public-data';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const root = process.env.APP_URL || 'http://localhost:3000', data = await getSitemapData();
  return ['/', '/stand', '/wedstrijden', '/statistieken', '/team', '/nieuws', '/privacy', ...data.profiles.map(p => '/spelers/' + p.slug), ...data.news.map(p => '/nieuws/' + p.slug), ...data.matches.map(m => '/wedstrijden/' + m.slug)].map(p => ({url: root + p}));
}
