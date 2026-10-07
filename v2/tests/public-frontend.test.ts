import {describe, expect, it, vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import type {PublicData} from '@/lib/public-data';
import {Hero} from '@/components/public/hero';
import {MatchCard} from '@/components/public/matches';
import {PlayerCards} from '@/components/public/players';
import {NewsCards} from '@/components/public/news';
import {StandingsTable} from '@/components/public/standings';
import {StatsTable} from '@/components/public/statistics';
import {CompetitionSelector, SourceStatus} from '@/components/public/competition';
import {PublicErrorState} from '@/components/public/error-state';
import {PublicNavigation} from '@/components/public/navigation';
import {ContactForm} from '@/components/public/contact-form';
import {dateNL, matchGroup, numberNL, type Match} from '@/components/public/format';
vi.mock('next/navigation', () => ({usePathname: () => '/stand'}));

const context = {id: 'regular', competition: 'Bullshooter Reguliere Competitie', competitionSlug: 'bullshooter-regulier', season: '2026/2027', division: 'Reusel 3e Divisie', isCurrent: true};
function data(): PublicData { return {context, contexts: [context], media: [], standings: [], matches: [], profiles: [], teamProfiles: [], stats: [], news: [], events: [], sponsors: [], settings: {}, report: undefined, lastSync: undefined, next: undefined, latest: undefined, nsjl: undefined, today: '2026-10-07'}; }
function match(): Match { return {id: 'match', slug: 'nsjl-away', scheduledDate: '2026-10-08', playedDate: null, startTime: null, week: 3, home: 'nsjl', away: 'other', homeName: 'No Skill Just Luck', awayName: 'Andere ploeg', homeNsjl: true, awayNsjl: false, homeScore: null, awayScore: null, status: 'scheduled', venue: null, notes: ''}; }

describe('Public frontend rendering', () => {
  it('keeps the original No Skill / Just Luck hero and shows unknown figures honestly', () => {
    const $ = load(renderToStaticMarkup(createElement(Hero, {data: data()})));
    expect($('h1').text()).toBe('No SkillJust Luck');
    expect($('dl dd').map((_, e) => $(e).text()).get()).toEqual(['—', '—', '—']);
    expect($('a').attr('href')).toBe('#stand');
  });
  it('does not fabricate a match start time, location or result', () => {
    const html = renderToStaticMarkup(createElement(MatchCard, {match: match()}));
    expect(html).toContain('Locatie nog niet bevestigd');
    expect(html).not.toContain('20:00');
    expect(html).not.toContain('null');
    expect(html).toContain('Thuis'); expect(html).toContain('Uit');
  });
  it('shows postponed status and unknown scores without inventing zeros', () => {
    const html = renderToStaticMarkup(createElement(MatchCard, {match: {...match(), status: 'postponed'}}));
    expect(html).toContain('Schema gewijzigd / verplaatst');
    const result = renderToStaticMarkup(createElement(MatchCard, {match: {...match(), status: 'completed'}}));
    expect(result).toContain('— – —'); expect(result).not.toContain('0 – 0');
  });
  it('public standings are a full accessible table and highlight NSJL', () => {
    const d = data(); d.standings = Array.from({length: 20}, (_, i) => ({id: String(i), teamSeasonId: String(i), name: i === 12 ? 'No Skill Just Luck' : 'Team ' + i, isNsjl: i === 12, position: i + 1, games: 10, wins: 5, losses: 5, winPercentage: '50.00'}));
    const $ = load(renderToStaticMarkup(createElement(StandingsTable, {data: d})));
    expect($('tbody tr')).toHaveLength(20); expect($('caption').text()).toContain('2026/2027');
    expect($('tbody th[scope="row"]')).toHaveLength(20);
    expect($('.pub-our-team').text()).toContain('No Skill Just Luck');
    expect($('[role="region"]').attr('tabindex')).toBe('0');
  });
  it('empty standings, players, news and statistics have meaningful empty states', () => {
    for (const Component of [StandingsTable, PlayerCards, NewsCards]) expect(renderToStaticMarkup(createElement(Component, {data: data()}))).toContain('pub-empty');
    expect(renderToStaticMarkup(createElement(StatsTable, {data: data(), game: 'cricket'}))).toContain('Nog geen officiële Cricket');
  });
  it('an invalid context does not select the regular context implicitly', () => {
    const d = data(); d.context = null;
    const $ = load(renderToStaticMarkup(createElement(CompetitionSelector, {data: d, path: '/stand'})));
    expect($('option[selected]').attr('value')).toBe('');
    expect($('label').attr('for')).toBe($('select').attr('id'));
  });
  it('labels summer data as a separate historical snapshot', () => {
    const d = data(); d.context = {...context, competitionSlug: 'nsjl-zomer'};
    expect(renderToStaticMarkup(createElement(SourceStatus, {data: d}))).toContain('los van de reguliere competitie');
  });
  it('navigation exposes all seven destinations, current page and accessible menu controls', () => {
    const $ = load(renderToStaticMarkup(createElement(PublicNavigation)));
    expect($('.pub-desktop-nav a')).toHaveLength(7);
    expect($('.pub-desktop-nav a[aria-current="page"]').attr('href')).toBe('/stand');
    expect($('button').attr('aria-controls')).toBe('public-mobile-menu');
    expect($('button').attr('aria-expanded')).toBe('false');
    expect($('#public-mobile-menu').attr('hidden')).toBeDefined();
  });
  it('contact inputs are labelled, bounded, validated and have live feedback', () => {
    const $ = load(renderToStaticMarkup(createElement(ContactForm, {endpoint: 'https://formspree.io/f/test', email: 'info@example.invalid'})));
    for (const id of ['contact-name', 'contact-email', 'contact-message']) {
      expect($('label[for="' + id + '"]')).toHaveLength(1);
      expect($('#' + id).attr('required')).toBeDefined();
      expect($('#' + id).attr('maxlength')).toBeDefined();
    }
    expect($('[aria-live="polite"]')).toHaveLength(1);
    expect($('input[name="_gotcha"]').attr('tabindex')).toBe('-1');
  });
  it('404 and error pages have one main heading, a return link and no raw runtime error', () => {
    for (const notFound of [true, false]) {
      const $ = load(renderToStaticMarkup(createElement(PublicErrorState, {notFound})));
      expect($('h1')).toHaveLength(1); expect($('main#main')).toHaveLength(1);
      expect($('a').attr('href')).toBe('/'); expect($.text()).not.toContain('stack');
    }
  });
});
describe('Public date, value and match presentation', () => {
  it('preserves zero and treats absent, invalid and unknown values as unknown', () => {
    expect(numberNL(0)).toBe('0');
    for (const value of [null, undefined, '', 'not a number']) expect(numberNL(value)).toBe('—');
    expect(numberNL('23.45')).toBe('23,45');
  });
  it('handles missing dates and keeps date-only matches on their calendar day', () => {
    expect(dateNL(null)).toBe('Datum volgt'); expect(dateNL('invalid')).toBe('Datum onbekend');
    expect(dateNL('2026-10-25', true)).toBe('25 oktober 2026');
  });
  it('distinguishes completed, cancelled, missing results and upcoming matches', () => {
    expect(matchGroup(match(), '2026-10-07')).toBe('upcoming');
    expect(matchGroup({...match(), scheduledDate: '2026-10-01'}, '2026-10-07')).toBe('pending');
    expect(matchGroup({...match(), status: 'completed'}, '2026-10-07')).toBe('completed');
    expect(matchGroup({...match(), status: 'cancelled'}, '2026-10-07')).toBe('cancelled');
  });
});
