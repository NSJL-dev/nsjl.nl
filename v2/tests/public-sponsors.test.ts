import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {eq} from 'drizzle-orm';
import * as s from '@/db/schema';
import {testDatabase} from './database';
import {preparedAdminForm} from './admin-input';
const state = vi.hoisted(() => ({database: vi.fn(), admin: vi.fn(), invalidate: vi.fn()}));
vi.mock('@/db/client', () => ({getDatabase: state.database}));
vi.mock('@/lib/auth', () => ({requireAdmin: state.admin}));
vi.mock('next/cache', () => ({revalidatePath: state.invalidate}));
vi.mock('next/navigation', () => ({usePathname: () => '/sponsors'}));
import {getSponsorsData} from '@/lib/public-data';
import {sponsorWebsite} from '@/components/public/sponsors';
import {PublicNavigation} from '@/components/public/navigation';
import SponsorsPage, {dynamic, metadata} from '@/app/(public)/sponsors/page';
import sitemap from '@/app/sitemap';
import {POST} from '@/app/api/admin/[resource]/route';
let c: Awaited<ReturnType<typeof testDatabase>>, actor: string;
beforeAll(async () => {c = await testDatabase(); actor = crypto.randomUUID(); await c.db.insert(s.users).values({id: actor, name: 'Sponsor fixture', email: 'sponsor-fixture@example.invalid'});});
afterAll(async () => {await c?.client.close();});
beforeEach(async () => {
  await c.db.delete(s.sponsors); vi.clearAllMocks(); state.database.mockResolvedValue(c.db); state.admin.mockResolvedValue({user: {id: actor}});
  for (const [key, value] of Object.entries({APP_ENV: 'development', APP_URL: 'http://localhost:3000', DATABASE_MODE: 'local', SYNC_ENABLED: 'false'})) vi.stubEnv(key, value);
  vi.stubEnv('VERCEL', undefined);
});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs();});
async function store(extra: Partial<typeof s.sponsors.$inferInsert> = {}) {return (await c.db.insert(s.sponsors).values({name: 'Sponsor fixture', ...extra}).returning())[0];}
async function write(form: Record<string, string>) {
  return POST(new Request('http://localhost:3000/api/admin/sponsors', {method: 'POST', headers: {origin: 'http://localhost:3000'}, body: new URLSearchParams(await preparedAdminForm(c.db, 'sponsors', form))}), {params: Promise.resolve({resource: 'sponsors'})});
}
describe('Public sponsors use scoped editorial data and controlled media', () => {
  it('shows only active sponsors, never archived/deactivated ones', async () => {
    await store({name: 'Actieve fixture'}); await store({name: 'Verborgen fixture', isActive: false});
    const data = await getSponsorsData(); expect(data.sponsors.map(row => row.name)).toEqual(['Actieve fixture']);
    expect(renderToStaticMarkup(await SponsorsPage())).not.toContain('Verborgen fixture');
  });
  it('respects sortOrder, with stable name/id tie breakers', async () => {
    await store({name: 'Laatste', sortOrder: 9}); await store({name: 'B tweede', sortOrder: 2}); await store({name: 'A eerste', sortOrder: 2});
    expect((await getSponsorsData()).sponsors.map(row => row.name)).toEqual(['A eerste', 'B tweede', 'Laatste']);
  });
  it('renders a complete accessible empty page', async () => {
    const $ = load(renderToStaticMarkup(await SponsorsPage())); expect($('main#main,h1')).toHaveLength(2); expect($('.pub-empty').text()).toContain('Nog geen sponsors'); expect($('.pub-sponsor-card')).toHaveLength(0);
  });
  it('renders optional description and an accessible external website', async () => {
    await store({name: 'Zichtbare sponsor', description: 'Regel één.\nRegel twee.', websiteUrl: 'https://sponsor.example.invalid'});
    const $ = load(renderToStaticMarkup(await SponsorsPage())); expect($('h2').text()).toBe('Zichtbare sponsor'); expect($('.pub-sponsor-description').text()).toContain('Regel één.\nRegel twee.');
    expect($('a').attr('target')).toBe('_blank'); expect($('a').attr('rel')).toBe('noopener noreferrer'); expect($('a').attr('aria-label')).toContain('nieuw tabblad');
  });
  it('does not invent website, description or logo when missing', async () => {
    await store(); const $ = load(renderToStaticMarkup(await SponsorsPage())); expect($('img,a,.pub-sponsor-description')).toHaveLength(0); expect($('.pub-sponsor-logo--empty')).toHaveLength(1);
  });
  it('escapes sponsor text and suppresses unsafe legacy website values', async () => {
    await store({name: '<script>Fixture</script>', description: '<img src=x onerror=alert(1)>', websiteUrl: 'javascript:alert(1)'});
    const $ = load(renderToStaticMarkup(await SponsorsPage())); expect($('script,img,a')).toHaveLength(0); expect($('h2').text()).toContain('<script>');
  });
  it.each(['javascript:alert(1)', 'data:text/html,fixture', 'ftp://fixture.invalid', '/relative', 'https://user:pass@fixture.invalid', '', null])('rejects unsuitable website %s', value => {expect(sponsorWebsite(value)).toBeUndefined();});
  it.each(['https://fixture.example.invalid/path', 'http://fixture.example.invalid'])('accepts safe website %s', value => {expect(sponsorWebsite(value)).toBe(new URL(value).href);});
  it.each(['private', 'archived', 'wrong-bucket'])('does not expose a %s logo or a Storage path', async kind => {
    const [image] = await c.db.insert(s.media).values({filename: 'fixture.webp', storagePath: `fixtures/${crypto.randomUUID()}.webp`, bucket: kind === 'wrong-bucket' ? 'published-media' : 'private-media', mimeType: 'image/webp', size: 24, status: kind === 'wrong-bucket' ? 'published' : kind}).returning();
    await store({logoMediaId: image.id}); const data = await getSponsorsData(), html = renderToStaticMarkup(await SponsorsPage()); expect(data.media).toHaveLength(0); expect(html).not.toContain(image.storagePath); expect(load(html)('img')).toHaveLength(0);
  });
  it('published logos use only the controlled route without Next image optimization', async () => {
    const [image] = await c.db.insert(s.media).values({filename: 'logo.webp', storagePath: `uploads/${crypto.randomUUID()}.webp`, bucket: 'private-media', mimeType: 'image/webp', size: 24, status: 'published', altText: 'Fixture logo'}).returning();
    await store({logoMediaId: image.id}); const $ = load(renderToStaticMarkup(await SponsorsPage())); expect($('img').attr('src')).toBe(`/api/media/${image.id}`); expect($('img').attr('alt')).toBe('Fixture logo'); expect($.html()).not.toContain('/_next/image');
    await c.db.update(s.media).set({status: 'private'}).where(eq(s.media.id, image.id)); expect((await getSponsorsData()).media).toHaveLength(0);
  });
  it('batches logo reads instead of an N+1 query and needs no competition context', async () => {
    await store(); await store({name: 'Tweede fixture'}); const select = vi.spyOn(c.db, 'select'); const data = await getSponsorsData(); expect(data.sponsors).toHaveLength(2); expect(select).toHaveBeenCalledTimes(1);
    expect(Object.keys(data.sponsors[0]).sort()).toEqual(['description', 'id', 'logoMediaId', 'name', 'sortOrder', 'websiteUrl'].sort());
  });
  it('has active Sponsors links on desktop and mobile', () => {
    const $ = load(renderToStaticMarkup(createElement(PublicNavigation))); expect($('a[href="/sponsors"]')).toHaveLength(2); expect($('a[href="/sponsors"][aria-current="page"]')).toHaveLength(2);
  });
  it('is dynamic and appears in canonical metadata and sitemap', async () => {
    expect(dynamic).toBe('force-dynamic'); expect(metadata.alternates.canonical).toBe('/sponsors'); expect((await sitemap()).some(row => row.url.endsWith('/sponsors'))).toBe(true);
  });
  it('admin creation/edit/archive/delete changes the public query and preserves logo media', async () => {
    const form = {name: 'Admin sponsor fixture', websiteUrl: 'https://fixture.example.invalid', description: 'Origineel', sortOrder: '3', isActive: 'on'};
    expect((await write(form)).status).toBe(303); const [row] = await getSponsorsData().then(data => data.sponsors);
    expect((await write({...form, id: row.id, name: 'Bijgewerkte sponsor'})).status).toBe(303); expect((await getSponsorsData()).sponsors[0].name).toBe('Bijgewerkte sponsor');
    expect((await write({id: row.id, action: 'archive'})).status).toBe(303); expect((await getSponsorsData()).sponsors).toHaveLength(0);
    const before = await c.db.select().from(s.media); expect((await write({id: row.id, action: 'delete'})).status).toBe(303);
    expect(await c.db.select().from(s.sponsors)).toHaveLength(0); expect(await c.db.select().from(s.media)).toEqual(before); expect(state.invalidate).toHaveBeenCalledWith('/sponsors', 'layout');
  });
  it('a database error remains a real server error rather than a misleading empty state', async () => {
    state.database.mockRejectedValueOnce(new Error('Fixture database failure')); await expect(getSponsorsData()).rejects.toThrow('Fixture database failure');
  });
});
