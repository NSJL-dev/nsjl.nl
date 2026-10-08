import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {eq} from 'drizzle-orm';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {testDatabase} from './database';
import {getPublicContexts} from '@/lib/public-context';
import Home from '@/app/(public)/page';
import Stand from '@/app/(public)/stand/page';
import Matches from '@/app/(public)/wedstrijden/page';
import Statistics from '@/app/(public)/statistieken/page';
import Team from '@/app/(public)/team/page';
import News from '@/app/(public)/nieuws/page';
import Agenda from '@/app/(public)/agenda/page';
import Sponsors from '@/app/(public)/sponsors/page';
import Privacy from '@/app/(public)/privacy/page';
import Player from '@/app/(public)/spelers/[slug]/page';
import NewsArticle from '@/app/(public)/nieuws/[slug]/page';
import MatchDetail from '@/app/(public)/wedstrijden/[slug]/page';

// Exercise the real server queries and pages; substitute only the database connection.
const state = vi.hoisted(() => ({db: undefined as Database | undefined}));
vi.mock('@/db/client', () => ({getDatabase: async () => {
  if (!state.db) throw new Error('Isolated database missing');
  return state.db;
}}));
vi.mock('next/navigation', () => ({notFound: () => {throw new Error('NEXT_NOT_FOUND');}}));
let seeded: Awaited<ReturnType<typeof testDatabase>>, empty: PGlite, emptyDb: Database;
beforeAll(async () => {
  seeded = await testDatabase(); state.db = seeded.db;
  empty = new PGlite(); await empty.waitReady;
  const db = drizzle(empty, {schema: s}); await migrate(db, {migrationsFolder: './drizzle'});
  emptyDb = db as unknown as Database;
});
afterAll(async () => { await seeded?.client.close(); await empty?.close(); });

const routes = [
  ['/', () => Home({searchParams: Promise.resolve({})})],
  ['/stand', () => Stand({searchParams: Promise.resolve({})})],
  ['/wedstrijden', () => Matches({searchParams: Promise.resolve({})})],
  ['/statistieken', () => Statistics({searchParams: Promise.resolve({})})],
  ['/team', () => Team({searchParams: Promise.resolve({})})],
  ['/nieuws', () => News()],
  ['/agenda', () => Agenda()],
  ['/sponsors', () => Sponsors()],
  ['/privacy', () => Privacy()],
] as const;
describe('Public routes with actual SQL queries and partial or absent content', () => {
  for (const [path, render] of routes) {
    it(path + ' renders the existing partial legacy seed without a report or regular statistics', async () => {
      const $ = load(renderToStaticMarkup(await render()));
      expect($('main#main')).toHaveLength(1); expect($('h1')).toHaveLength(1);
      expect($.text()).not.toContain('Migratie en seed');
      expect($.text()).not.toContain('undefined');
      if (path === '/stand') expect($('.pub-standings tbody tr')).toHaveLength(0);
      if (path === '/') {
        expect($('.pub-player-card').map((_, e) => $(e).attr('href')).get().join(' ')).not.toContain('tim-goossens');
        expect($('.pub-hero-metrics dd').map((_, e) => $(e).text()).get()).toEqual(['—', '—', '—']);
      }
    });
    it(path + ' renders an entirely unseeded database without throwing', async () => {
      state.db = emptyDb;
      try {
        const $ = load(renderToStaticMarkup(await render()));
        expect($('main#main')).toHaveLength(1); expect($('h1')).toHaveLength(1);
        expect($('.pub-standings tbody tr')).toHaveLength(0);
        expect($.text()).not.toContain('Migratie en seed');
      } finally { state.db = seeded.db; }
    });
  }
  it('all four profile routes render with only unverified legacy figures and missing-photo fallbacks', async () => {
    const profiles = await seeded.db.select().from(s.players);
    for (const profile of profiles) {
      const $ = load(renderToStaticMarkup(await Player({params: Promise.resolve({slug: profile.slug}), searchParams: Promise.resolve({})})));
      expect($('h1').text()).toBe(profile.displayName);
      expect($.text()).toContain('Geen gekoppelde NSJL-statistieken');
      expect($.text()).toContain('geen officiële actuele Bullshooter-statistieken');
      expect($('.pub-avatar [aria-label]').attr('aria-label')).toContain('foto ontbreekt');
      if (profile.slug === 'tim-goossens') expect($.text()).toContain('Geen vastgelegd NSJL-lidmaatschap');
    }
  });
  it('all published article routes render with the actual targeted news query', async () => {
    const posts = await seeded.db.select().from(s.newsPosts);
    for (const post of posts) {
      const $ = load(renderToStaticMarkup(await NewsArticle({params: Promise.resolve({slug: post.slug})})));
      expect($('h1').text()).toBe(post.title); expect($('.pub-article').text()).toBe(post.content);
    }
  });
  it('a missing regular context leaves the home, news and profiles accessible without summer fallback', async () => {
    const regular = (await getPublicContexts()).find(c => c.competitionSlug === 'bullshooter-regulier')!;
    await seeded.db.update(s.seasons).set({isCurrent: false}).where(eq(s.seasons.id, regular.seasonId));
    try {
      const $ = load(renderToStaticMarkup(await Home({searchParams: Promise.resolve({})})));
      expect($('.pub-standings tbody tr')).toHaveLength(0);
      expect($('.pub-news-card')).toHaveLength(3);
      const html = renderToStaticMarkup(await Player({params: Promise.resolve({slug: 'tim-goossens'}), searchParams: Promise.resolve({})}));
      expect(html).toContain('Tim Goossens'); expect(html).toContain('Geen gekoppelde NSJL-statistieken');
    } finally { await seeded.db.update(s.seasons).set({isCurrent: true}).where(eq(s.seasons.id, regular.seasonId)); }
  });
  it('unknown detail slugs resolve to not-found in an unseeded database', async () => {
    state.db = emptyDb;
    try {
      await expect(Player({params: Promise.resolve({slug: 'missing'}), searchParams: Promise.resolve({})})).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(NewsArticle({params: Promise.resolve({slug: 'missing'})})).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(MatchDetail({params: Promise.resolve({slug: 'missing'})})).rejects.toThrow('NEXT_NOT_FOUND');
    } finally { state.db = seeded.db; }
  });
  it('a future match detail preserves its real context, week, venue and unknown score/time', async () => {
    const context = (await getPublicContexts()).find(c => c.competitionSlug === 'bullshooter-regulier')!;
    const [opponent] = await seeded.db.insert(s.teams).values({name: 'Tegenstander fixture', normalizedName: 'tegenstander fixture', slug: 'opponent-fixture'}).returning();
    const [team] = await seeded.db.insert(s.teamSeasons).values({teamId: opponent.id, divisionId: context.id}).returning();
    const [venue] = await seeded.db.insert(s.venues).values({name: 'Fixture speelzaal'}).returning();
    await seeded.db.insert(s.matches).values({slug: 'detail-fixture', divisionId: context.id, roundKey: '4', importKey: 'detail-fixture', source: 'bullshooter', weekNumber: 4, scheduledDate: '2999-10-08', homeTeamSeasonId: context.teamSeasonId!, awayTeamSeasonId: team.id, venueId: venue.id});
    const $ = load(renderToStaticMarkup(await MatchDetail({params: Promise.resolve({slug: 'detail-fixture'})})));
    expect($('h1').text()).toContain('Tegenstander fixture'); expect($.text()).toContain(context.season);
    expect($.text()).toContain('Fixture speelzaal'); expect($.text()).toContain('De bron verstrekt geen aanvangstijd');
    expect($.text()).not.toContain('20:00'); expect($.text()).not.toContain('0 – 0');
  });
  it('page reads leave source configs disabled and create no reports, runs or official figures', async () => {
    expect(await seeded.db.select().from(s.sourceConfigs).where(eq(s.sourceConfigs.enabled, true))).toHaveLength(0);
    expect(await seeded.db.select().from(s.sourceReports)).toHaveLength(0);
    expect(await seeded.db.select().from(s.syncRuns)).toHaveLength(0);
    expect(await seeded.db.select().from(s.playerSeasonStats)).toHaveLength(0);
  });
});
