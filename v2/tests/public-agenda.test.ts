import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {load} from 'cheerio';
import {eq} from 'drizzle-orm';
import type {Database} from '@/db/client';
import * as s from '@/db/schema';
import {testDatabase} from './database';
import {agendaTime, agendaZone, groupAgenda, type AgendaItem} from '@/lib/agenda';
import {getAgendaData} from '@/lib/public-data';
import {AgendaCard} from '@/components/public/agenda';
import {PublicNavigation} from '@/components/public/navigation';
import Agenda, {dynamic, metadata, revalidate} from '@/app/(public)/agenda/page';
import sitemap from '@/app/sitemap';
import {POST as mutate} from '@/app/api/admin/[resource]/route';

const state = vi.hoisted(() => ({db: undefined as Database | undefined, failure: false, admin: vi.fn(), invalidate: vi.fn()}));
vi.mock('@/db/client', () => ({getDatabase: async () => {
  if (state.failure) throw new Error('Fixture internal database details');
  if (!state.db) throw new Error('Isolated database missing');
  return state.db;
}}));
vi.mock('@/lib/auth', () => ({requireAdmin: state.admin}));
vi.mock('next/cache', () => ({revalidatePath: state.invalidate}));
vi.mock('next/navigation', () => ({usePathname: () => '/agenda'}));

const now = new Date('2026-10-08T12:00:00Z');
let c: Awaited<ReturnType<typeof testDatabase>>, actor: string;
function item(fields: Partial<AgendaItem> = {}): AgendaItem {
  return {id: crypto.randomUUID(), title: 'Training fixture', description: 'Een activiteit uit de testdatabase.',
    startsAt: new Date('2026-10-09T18:00:00Z'), endsAt: null, location: 'Fixture clubhuis', eventType: 'training', ...fields};
}
async function store(fields: Partial<typeof s.events.$inferInsert> = {}) {
  const [row] = await c.db.insert(s.events).values({...item(), createdBy: actor, ...fields}).returning();
  return row;
}
async function page() { return load(renderToStaticMarkup(await Agenda())); }
async function adminWrite(form: Record<string, string>) {
  return mutate(new Request('http://localhost:3000/api/admin/agenda', {method: 'POST', headers: {origin: 'http://localhost:3000'}, body: new URLSearchParams(form)}), {params: Promise.resolve({resource: 'agenda'})});
}
beforeAll(async () => {
  // Synthetic agenda/users exist only in this temporary local database.
  c = await testDatabase(); state.db = c.db; actor = crypto.randomUUID();
  await c.db.insert(s.users).values({id: actor, name: 'Agenda test admin', email: 'agenda-test@example.invalid'});
});
afterAll(async () => { await c?.client.close(); });
beforeEach(async () => {
  await c.db.delete(s.events); state.failure = false;
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(now); vi.clearAllMocks();
  state.admin.mockResolvedValue({user: {id: actor}});
  for (const [key, value] of Object.entries({APP_ENV: 'development', APP_URL: 'http://localhost:3000', DATABASE_MODE: 'local', SYNC_ENABLED: 'false'})) vi.stubEnv(key, value);
  vi.stubEnv('VERCEL', undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Agenda chronology and Amsterdam time', () => {
  it('sorts upcoming by actual start and past most recently started first, without changing the input', () => {
    const rows = [item({id: 'late', startsAt: new Date('2026-10-12T12:00:00Z')}), item({id: 'old', startsAt: new Date('2026-09-01T12:00:00Z')}),
      item({id: 'next', startsAt: new Date('2026-10-09T12:00:00Z')}), item({id: 'recent', startsAt: new Date('2026-10-07T12:00:00Z')})];
    const original = [...rows], groups = groupAgenda(rows, now);
    expect(groups.upcoming.map(row => row.id)).toEqual(['next', 'late']);
    expect(groups.past.map(row => row.id)).toEqual(['recent', 'old']); expect(rows).toEqual(original);
  });
  it('uses a deterministic ID tiebreaker for equal starts', () => {
    expect(groupAgenda([item({id: 'b'}), item({id: 'a'})], now).upcoming.map(row => row.id)).toEqual(['a', 'b']);
  });
  it('keeps ongoing activities visible until their explicit end; treats the end as an exclusive boundary', () => {
    const ongoing = item({id: 'ongoing', startsAt: new Date('2026-10-08T10:00:00Z'), endsAt: new Date('2026-10-08T13:00:00Z')});
    expect(groupAgenda([ongoing], now).upcoming).toEqual([ongoing]);
    expect(groupAgenda([ongoing], ongoing.endsAt!).past).toEqual([ongoing]);
    const $ = load(renderToStaticMarkup(createElement(AgendaCard, {item: ongoing, now})));
    expect($.text()).toContain('Nu bezig');
  });
  it('does not invent a duration when the end is unknown and keeps an event starting now upcoming', () => {
    const atStart = item({startsAt: now}), started = item({startsAt: new Date(now.valueOf() - 1)});
    expect(groupAgenda([atStart, started], now)).toEqual({upcoming: [atStart], past: [started]});
  });
  it('an empty dataset has empty groups', () => { expect(groupAgenda([], now)).toEqual({upcoming: [], past: []}); });
  it.each([
    ['2026-07-01T18:00:00Z', '20:00'], ['2026-12-01T19:00:00Z', '20:00'],
    ['2026-03-29T00:30:00Z', '01:30'], ['2026-03-29T01:30:00Z', '03:30'],
    ['2026-10-25T00:30:00Z', '02:30'], ['2026-10-25T01:15:00Z', '02:15'],
  ])('formats %s in Amsterdam as %s regardless of the host timezone', (input, expected) => {
    vi.stubEnv('TZ', 'Pacific/Honolulu'); expect(agendaTime(new Date(input))).toBe(expected);
  });
  it('orders the repeated autumn hour by instant rather than the displayed clock time', () => {
    const first = item({id: 'first', startsAt: new Date('2026-10-25T00:30:00Z')}), second = item({id: 'second', startsAt: new Date('2026-10-25T01:15:00Z')});
    expect(groupAgenda([second, first], now).upcoming.map(row => row.id)).toEqual(['first', 'second']);
    expect(agendaZone(first.startsAt)).not.toBe(agendaZone(second.startsAt));
  });
});

describe('Agenda rendering in the approved public shell', () => {
  it('shows a useful empty upcoming state even when only past activities exist', async () => {
    await store({title: 'Historische fixture', startsAt: new Date('2026-07-23T18:00:00Z')});
    const $ = await page();
    expect($('main#main')).toHaveLength(1); expect($('h1').text()).toBe('Agenda');
    expect($('section[aria-labelledby="agenda-upcoming"]').text()).toContain('Nog geen aankomende activiteiten');
    expect($('section[aria-labelledby="agenda-past"] h3').text()).toBe('Historische fixture');
  });
  it('an entirely empty agenda renders both empty states and no manufactured cards', async () => {
    const $ = await page(); expect($('.pub-agenda-card')).toHaveLength(0);
    expect($.text()).toContain('Nog geen aankomende activiteiten'); expect($.text()).toContain('Nog geen afgelopen activiteiten');
  });
  it('renders Dutch local date, start, end, location, description and activity type', () => {
    const event = item({endsAt: new Date('2026-10-09T20:00:00Z'), description: 'Eerste regel.\nTweede regel.'});
    const $ = load(renderToStaticMarkup(createElement(AgendaCard, {item: event, now})));
    expect($('h3').text()).toBe(event.title); expect($('.pub-status').text()).toBe('Training');
    expect($('dd').eq(0).text()).toBe('9 oktober 2026'); expect($('dd').eq(1).text()).toBe('20:00 – 22:00 uur');
    expect($('dd').eq(2).text()).toBe('Fixture clubhuis'); expect($('.pub-agenda-description').text()).toBe(event.description);
    expect($('time').eq(1).attr('datetime')).toBe('2026-10-09T18:00:00.000Z');
    expect($('time').eq(2).attr('datetime')).toBe('2026-10-09T20:00:00.000Z');
    expect($('article').attr('aria-labelledby')).toBe($('h3').attr('id'));
  });
  it('local midnight changes the date, and a multiday end shows its own date', () => {
    const event = item({startsAt: new Date('2026-10-08T22:30:00Z'), endsAt: new Date('2026-10-10T00:00:00Z')});
    const $ = load(renderToStaticMarkup(createElement(AgendaCard, {item: event, now})));
    expect($('dd').eq(0).text()).toBe('9 oktober 2026'); expect($('dd').eq(1).text()).toBe('00:30 – 10 oktober 2026, 02:00 uur');
  });
  it('an event spanning the repeated autumn hour labels each timezone to avoid an apparently reversed time range', () => {
    const event = item({startsAt: new Date('2026-10-25T00:30:00Z'), endsAt: new Date('2026-10-25T01:15:00Z')});
    const $ = load(renderToStaticMarkup(createElement(AgendaCard, {item: event, now})));
    expect($('dd').eq(1).text()).toBe(`${agendaTime(event.startsAt, true)} – ${agendaTime(event.endsAt!, true)} uur`);
    expect($('dd').eq(1).text()).toContain(agendaZone(event.startsAt)); expect($('dd').eq(1).text()).toContain(agendaZone(event.endsAt!));
  });
  it.each([['training', 'Training'], ['tournament', 'Toernooi'], ['team_event', 'Teamactiviteit'], ['other', 'Overig']])('labels the existing %s activity type as %s', (eventType, label) => {
    const $ = load(renderToStaticMarkup(createElement(AgendaCard, {item: item({eventType}), now}))); expect($('.pub-status').text()).toBe(label);
  });
  it('missing location, description and end get clear states without inventing values', () => {
    const $ = load(renderToStaticMarkup(createElement(AgendaCard, {item: item({location: ' ', description: '', endsAt: null}), now})));
    expect($.text()).toContain('Locatie nog niet bekend'); expect($.text()).toContain('Er is nog geen omschrijving toegevoegd');
    expect($.text()).toContain('Geen eindtijd opgegeven'); expect($('time')).toHaveLength(2); expect($.text()).not.toContain('undefined');
  });
  it('database content is escaped rather than executed as HTML', () => {
    const unsafe = '<script>fixture()</script><img src=x onerror=fixture()>';
    const $ = load(renderToStaticMarkup(createElement(AgendaCard, {item: item({title: unsafe, description: unsafe, location: unsafe}), now})));
    expect($('script,img,iframe')).toHaveLength(0); expect($('h3').text()).toBe(unsafe); expect($('.pub-agenda-description').text()).toBe(unsafe);
  });
  it('links and marks agenda current in both desktop and mobile navigation', () => {
    const $ = load(renderToStaticMarkup(createElement(PublicNavigation)));
    for (const selector of ['.pub-desktop-nav', '#public-mobile-menu']) expect($(selector + ' a[aria-current="page"]').attr('href')).toBe('/agenda');
  });
  it('is dynamically rendered with canonical metadata and included in the sitemap', async () => {
    expect(dynamic).toBe('force-dynamic'); expect(revalidate).toBe(0); expect(metadata.alternates.canonical).toBe('/agenda');
    expect((await sitemap()).some(row => row.url === 'http://localhost:3000/agenda')).toBe(true);
  });
});

describe('Real public agenda query and existing admin workflow', () => {
  it('filters archived records and exposes only public event fields with one database SELECT', async () => {
    await store({title: 'Actieve fixture'}); await store({title: 'Verborgen fixture', isActive: false});
    const select = vi.spyOn(c.db, 'select'), rows = await getAgendaData();
    expect(select).toHaveBeenCalledTimes(1); expect(rows.map(row => row.title)).toEqual(['Actieve fixture']);
    expect(Object.keys(rows[0]).sort()).toEqual(['description', 'endsAt', 'eventType', 'id', 'location', 'startsAt', 'title']);
    const $ = await page(); expect($.text()).not.toContain('Verborgen fixture'); expect($.text()).not.toContain(actor);
  });
  it('sorts actual SQL results and rendered upcoming cards by start', async () => {
    await store({title: 'Later', startsAt: new Date('2026-10-12T10:00:00Z')});
    await store({title: 'Eerst', startsAt: new Date('2026-10-09T10:00:00Z')});
    expect((await getAgendaData()).map(row => row.title)).toEqual(['Eerst', 'Later']);
    expect((await page())('section[aria-labelledby="agenda-upcoming"] h3').map((_, e) => load(e).text()).get()).toEqual(['Eerst', 'Later']);
  });
  it('the existing authorized create/edit/archive flow is reflected on the next page read and invalidates /agenda', async () => {
    const form = {title: 'Admin agendafixture', startsAt: '2026-10-09T20:00:00+02:00', endsAt: '2026-10-09T22:00:00+02:00', eventType: 'team_event', description: 'Origineel', location: 'Fixture A'};
    const created = await adminWrite(form); expect(created.status).toBe(303); expect(state.admin).toHaveBeenCalledWith(true);
    const [row] = await getAgendaData(); expect(row.title).toBe(form.title); expect(row.startsAt.toISOString()).toBe('2026-10-09T18:00:00.000Z');
    expect((await page()).text()).toContain('Origineel'); expect(state.invalidate).toHaveBeenCalledWith('/agenda', 'layout');
    state.invalidate.mockClear();
    expect((await adminWrite({...form, id: row.id, title: 'Bijgewerkte fixture', location: 'Fixture B', description: 'Bijgewerkt', startsAt: '2026-10-10T19:30:00+02:00', endsAt: '2026-10-10T21:30:00+02:00'})).status).toBe(303);
    const edited = await page(); expect(edited.text()).toContain('Bijgewerkte fixture'); expect(edited.text()).toContain('Fixture B'); expect(edited.text()).not.toContain('Origineel');
    expect(state.invalidate).toHaveBeenCalledWith('/agenda', 'layout'); state.invalidate.mockClear();
    expect((await adminWrite({id: row.id, action: 'archive'})).status).toBe(303);
    expect(await getAgendaData()).toHaveLength(0); expect((await page()).text()).not.toContain('Bijgewerkte fixture');
    expect(state.invalidate).toHaveBeenCalledWith('/agenda', 'layout');
    expect((await c.db.select().from(s.events).where(eq(s.events.id, row.id)))[0].isActive).toBe(false);
  });
  it('a physically removed local fixture disappears on a fresh read too', async () => {
    const row = await store(); expect(await getAgendaData()).toHaveLength(1);
    await c.db.delete(s.events).where(eq(s.events.id, row.id)); expect(await getAgendaData()).toHaveLength(0);
  });
  it('a real database error propagates to the existing public error boundary rather than posing as an empty agenda', async () => {
    state.failure = true;
    try { await expect(Agenda()).rejects.toThrow('Fixture internal database details'); } finally { state.failure = false; }
  });
  it('public agenda reads leave stored events and all sync state unchanged', async () => {
    await store(); const before = await c.db.select().from(s.events);
    await page(); await getAgendaData(); expect(await c.db.select().from(s.events)).toEqual(before);
    expect(await c.db.select().from(s.syncRuns)).toHaveLength(0);
    expect(await c.db.select().from(s.sourceConfigs).where(eq(s.sourceConfigs.enabled, true))).toHaveLength(0);
  });
});
