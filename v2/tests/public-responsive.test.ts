import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import postcss from 'postcss';

const root = postcss.parse(readFileSync('app/(public)/public.css', 'utf8'));
function style(selector: string, property: string, width: number) {
  let value: string | undefined;
  root.walkRules(rule => {
    if (!rule.selectors.includes(selector)) return;
    let parent = rule.parent;
    while (parent && parent.type !== 'root') {
      if (parent.type === 'atrule' && parent.name === 'media') {
        if (parent.params.includes('prefers-reduced-motion')) return;
        const max = parent.params.match(/max-width:\s*(\d+)px/);
        if (max && width > Number(max[1])) return;
      }
      parent = parent.parent;
    }
    rule.walkDecls(property, declaration => { value = declaration.value; });
  });
  return value;
}
describe('Responsive CSS and public/admin isolation', () => {
  it('all public CSS rules are scoped to the public wrapper', () => {
    root.walkRules(rule => { for (const selector of rule.selectors) expect(selector).toContain('.public-site'); });
  });
  for (const width of [1440, 1200, 1024, 900, 768, 660, 420, 360, 320]) it('provides the intended layout at ' + width + 'px', () => {
    expect(style('.public-site .pub-header', 'height', width)).toBe('64px');
    expect(style('.public-site .pub-hero', 'min-height', width)).toBe('calc(100svh - 64px)');
    expect(style('.public-site .pub-menu-toggle', 'display', width)).toBe(width <= 900 ? 'flex' : 'none');
    expect(style('.public-site .pub-players-grid', 'grid-template-columns', width)).toBe(width <= 420 ? '1fr' : width <= 900 ? 'repeat(2,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))');
    expect(style('.public-site .pub-news-grid', 'grid-template-columns', width)).toBe(width <= 660 ? '1fr' : width <= 900 ? 'repeat(2,minmax(0,1fr))' : 'repeat(3,minmax(0,1fr))');
    expect(style('.public-site .pub-contact-grid', 'grid-template-columns', width)).toBe(width <= 660 ? '1fr' : '1fr 1fr');
    expect(style('.public-site .pub-table-scroll', 'overflow-x', width)).toBe('auto');
    expect(style('.public-site .pub-agenda-list', 'grid-template-columns', width)).toBe(width <= 660 ? '1fr' : 'repeat(2,minmax(0,1fr))');
  });
  it('supports reduced motion and reserves image layout dimensions', () => {
    const css = root.toString();
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('animation: none !important');
    expect(style('.public-site .pub-news-image', 'aspect-ratio', 420)).toBe('16/9');
  });
});
