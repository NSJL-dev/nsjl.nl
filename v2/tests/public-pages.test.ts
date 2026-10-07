import {describe, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import type {PublicData} from '@/lib/public-data';
import Home from '@/app/(public)/page';
import Stand from '@/app/(public)/stand/page';
import Matches from '@/app/(public)/wedstrijden/page';
import Statistics from '@/app/(public)/statistieken/page';
import Team from '@/app/(public)/team/page';
import News from '@/app/(public)/nieuws/page';
import Privacy from '@/app/(public)/privacy/page';
import Player from '@/app/(public)/spelers/[slug]/page';
import NewsArticle from '@/app/(public)/nieuws/[slug]/page';
import MatchDetail from '@/app/(public)/wedstrijden/[slug]/page';

const mocks = vi.hoisted(() => ({data: vi.fn(), legacy: vi.fn(), match: vi.fn()}));
vi.mock('@/lib/public-data', () => ({getHomeData: mocks.data, getStandData: mocks.data, getMatchesData: mocks.data, getStatisticsData: mocks.data, getTeamData: mocks.data, getNewsData: mocks.data, getNewsArticleData: mocks.data, getPlayerData: mocks.data, getLegacyProfileStats: mocks.legacy, findPublicMatch: mocks.match}));
vi.mock('next/navigation', () => ({notFound: () => {throw new Error('NEXT_NOT_FOUND');}}));
function empty(): PublicData { return {context: null, contexts: [], media: [], standings: [], matches: [], profiles: [], teamProfiles: [], stats: [], news: [], events: [], sponsors: [], settings: {}, report: undefined, lastSync: undefined, next: undefined, latest: undefined, nsjl: undefined, today: '2026-10-07'}; }

describe('Complete public pages with missing competition data', () => {
  const routes = [
    ['home', () => Home({searchParams: Promise.resolve({})})],
    ['stand', () => Stand({searchParams: Promise.resolve({})})],
    ['wedstrijden', () => Matches({searchParams: Promise.resolve({})})],
    ['statistieken', () => Statistics({searchParams: Promise.resolve({})})],
    ['team', () => Team({searchParams: Promise.resolve({})})],
    ['nieuws', () => News()],
    ['privacy', () => Privacy()],
  ] as const;
  for (const [name, render] of routes) it(name + ' renders without a seeded competition and has one main and one h1', async () => {
    mocks.data.mockResolvedValue(empty());
    const $ = load(renderToStaticMarkup(await render()));
    expect($('main#main')).toHaveLength(1); expect($('h1')).toHaveLength(1);
    expect($.text()).not.toContain('Migratie en seed');
  });
  it('home keeps hero, stand, team, matches, news, contact in the approved order', async () => {
    mocks.data.mockResolvedValue(empty());
    const $ = load(renderToStaticMarkup(await Home({searchParams: Promise.resolve({})})));
    expect($('main > section').map((_, e) => $(e).attr('id') || $(e).attr('class')).get()).toEqual(['pub-hero', 'stand', 'team', 'wedstrijden', 'nieuws', 'contact']);
  });
  it('a legacy player profile remains available, without official team statistics', async () => {
    const d = empty(); d.profiles = [{id: 'tim', firstName: 'Tim', lastName: 'Goossens', displayName: 'Tim Goossens', nickname: null, slug: 'tim-goossens', photoMediaId: null, bio: 'Origineel profiel.', isActive: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date()}];
    mocks.data.mockResolvedValue(d); mocks.legacy.mockResolvedValue([]);
    const html = renderToStaticMarkup(await Player({params: Promise.resolve({slug: 'tim-goossens'}), searchParams: Promise.resolve({})}));
    expect(html).toContain('Tim Goossens'); expect(html).toContain('Geen vastgelegd NSJL-lidmaatschap');
    expect(html).toContain('Geen gekoppelde NSJL-statistieken');
  });
  it('news renders real content independently of a competition, with XSS escaping', async () => {
    const d = empty(); d.news = [{id: 'news', title: '69... Nice!', slug: '69-nice', excerpt: 'Het originele bericht.', content: '<p>Het originele bericht.</p><script>alert(1)</script>', featuredMediaId: null, category: 'Statistieken', status: 'published', publishedAt: new Date('2026-07-23'), authorId: null, createdAt: new Date(), updatedAt: new Date()}];
    mocks.data.mockResolvedValue(d);
    const $ = load(renderToStaticMarkup(await NewsArticle({params: Promise.resolve({slug: '69-nice'})})));
    expect($('h1').text()).toBe('69... Nice!'); expect($('.pub-article script')).toHaveLength(0);
  });
  it('match details render the selected source context and do not invent a start time', async () => {
    const d = empty(); mocks.match.mockResolvedValue({data: d, match: {id: 'match', slug: 'nsjl', scheduledDate: '2026-10-08', playedDate: null, startTime: null, week: 3, home: 'nsjl', away: 'other', homeName: 'No Skill Just Luck', awayName: 'Tegenstander', homeNsjl: true, awayNsjl: false, homeScore: null, awayScore: null, status: 'scheduled', venue: null, notes: ''}});
    const html = renderToStaticMarkup(await MatchDetail({params: Promise.resolve({slug: 'nsjl'})}));
    expect(html).toContain('De bron verstrekt geen aanvangstijd'); expect(html).not.toContain('20:00');
  });
  it('unknown player, news and match slugs use not-found instead of a data exception', async () => {
    mocks.data.mockResolvedValue(empty()); mocks.match.mockResolvedValue(null);
    await expect(Player({params: Promise.resolve({slug: 'missing'}), searchParams: Promise.resolve({})})).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(NewsArticle({params: Promise.resolve({slug: 'missing'})})).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(MatchDetail({params: Promise.resolve({slug: 'missing'})})).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
