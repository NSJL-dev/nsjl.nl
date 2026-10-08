import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import postcss from 'postcss';
import {describe, expect, it, vi} from 'vitest';
vi.mock('next/navigation', () => ({usePathname: () => '/admin/sponsors'}));
import {AdminShell, adminSections} from '@/components/admin-shell';
import AdminIdentityLayout from '@/app/admin/layout';
import {AdminNavLink} from '@/components/admin-nav-link';
import {RecordActions} from '@/components/admin-record-actions';
const css = postcss.parse(readFileSync('app/admin/admin.css', 'utf8'));
function style(selector: string, property: string, width: number) {
  let value: string | undefined;
  css.walkRules(rule => {
    if (!rule.selectors.includes(selector)) return;
    let parent = rule.parent;
    while (parent && parent.type !== 'root') {
      if (parent.type === 'atrule' && parent.name === 'media') {
        if (parent.params.includes('prefers-reduced-motion')) return;
        const max = parent.params.match(/max-width:\s*(\d+)px/); if (max && width > Number(max[1])) return;
      }
      parent = parent.parent;
    }
    rule.walkDecls(property, declaration => {value = declaration.value;});
  });
  return value;
}
function luminance(hex: string) {const values = hex.replace('#', '').match(/../g)!.map(channel => {const n = parseInt(channel,16)/255; return n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4;}); return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
function contrast(a: string,b: string) {const [light,dark] = [luminance(a),luminance(b)].sort((x,y)=>y-x); return (light+.05)/(dark+.05);}
describe('NSJL admin identity, responsive navigation and isolation', () => {
  it('scopes all rules to admin and shares identity tokens without changing public markup', () => {
    css.walkRules(rule => {for (const selector of rule.selectors) expect(selector).toContain('.admin-site');});
    const tokens = readFileSync('app/design-tokens.css','utf8'); for (const value of ['#0c1f4a','#2563eb','#f59e0b','Nunito','Bebas Neue']) expect(tokens).toContain(value);
    const publicStyle = readFileSync('app/(public)/public.css','utf8'); expect(publicStyle).toContain('--pub-navy: var(--nsjl-navy)'); expect(css.toString()).not.toContain('.public-site');
    expect(load(renderToStaticMarkup(AdminIdentityLayout({children:createElement('p',null,'Fixture')})))('.admin-site')).toHaveLength(1);
  });
  it('uses the original blue logo and exposes every module on desktop and mobile', () => {
    const $ = load(renderToStaticMarkup(AdminShell({name:'Fixture admin',children:createElement('h1',null,'Beheer')})));
    expect($('.brand img')).toHaveLength(2); expect($('.brand img').attr('alt')).toBe('No Skill Just Luck');
    for (const section of adminSections) expect($(`nav[aria-label="Alle beheeronderdelen"] a[href="/admin/${section.slug}"]`)).toHaveLength(1);
    expect($('[aria-current="page"]').map((_,node)=>$(node).attr('href')).get()).toEqual(['/admin/sponsors','/admin/sponsors']);
    expect($('nav[aria-label="Mobiel beheer"] a')).toHaveLength(5);
  });
  it('does not mark an unrelated navigation item as the current page', () => {
    const $ = load(renderToStaticMarkup(AdminNavLink({href:'/admin/spelers',children:'Spelers'}))); expect($('a').attr('aria-current')).toBeUndefined();
  });
  for (const width of [1440,1200,1024,900,768,660,420,360,320]) it(`supports deliberate admin layout at ${width}px`, () => {
    expect(style('.admin-site .admin-grid','display',width)).toBe(width <= 900 ? 'block' : 'grid');
    expect(style('.admin-site .admin-sidebar','display',width)).toBe(width <= 900 ? 'none' : undefined);
    expect(style('.admin-site .admin-mobile-header','display',width)).toBe(width <= 900 ? 'flex' : 'none');
    expect(style('.admin-site .mobile-admin-nav','display',width)).toBe(width <= 900 ? 'grid' : 'none');
    expect(style('.admin-site .admin-cards','grid-template-columns',width)).toBe(width <= 420 ? '1fr' : width <= 1200 ? 'repeat(2,minmax(0,1fr))' : undefined);
    expect(style('.admin-site .two-col','grid-template-columns',width)).toBe(width <= 660 ? '1fr' : 'repeat(2,minmax(0,1fr))');
    expect(style('.admin-site .standing-table','overflow-x',width)).toBe('auto'); expect(style('.admin-site .admin-confirm-dialog','width',width)).toBe('min(560px,calc(100% - 32px))');
  });
  it('provides reduced motion, visible focus, sufficient text and control contrast', () => {
    expect(css.toString()).toContain('prefers-reduced-motion: reduce'); expect(css.toString()).toContain('outline: 3px solid');
    for (const foreground of ['#0c1f4a','#2563eb','#1d4ed8','#536176','#a61b2c','#925b00']) expect(contrast(foreground,'#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#7185a1','#ffffff')).toBeGreaterThanOrEqual(3);
  });
  it('keeps destructive actions in a separate zone and defaults confirmation focus to cancel', () => {
    const $ = load(renderToStaticMarkup(createElement(RecordActions,{resource:'sponsors',id:crypto.randomUUID(),name:'Sponsor fixture',revision:'a'.repeat(64),archived:true})));
    expect($('.delete-zone > .danger-link')).toHaveLength(1); expect($('dialog button[autofocus]').text()).toBe('Annuleren'); expect($('input[name=typedName]').attr('autocomplete')).toBe('off');
  });
});
