import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {NextRequest} from 'next/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {proxy} from '@/proxy';

const css = readFileSync('app/fonts.css', 'utf8');
const faces: Record<string, string>[] = [];
postcss.parse(css).walkAtRules('font-face', rule => {
  const declarations: Record<string, string> = {};
  rule.walkDecls(declaration => { declarations[declaration.prop] = declaration.value; });
  faces.push(declarations);
});
const manifest = JSON.parse(readFileSync('public/fonts/manifest.json', 'utf8')) as {
  files: {file: string; family: string; source: string; bytes: number; sha256: string}[];
};
const destinations = () => faces.map(face => face.src.match(/url\('([^']+)'\)/)![1]);

beforeEach(() => {
  for (const [key, value] of Object.entries({NODE_ENV: 'production', APP_ENV: 'development', APP_URL: 'http://localhost:3000', DATABASE_MODE: 'local', SYNC_ENABLED: 'false'})) vi.stubEnv(key, value);
  vi.stubEnv('SUPABASE_URL', undefined); vi.stubEnv('VERCEL', undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('Self-hosted NSJL typography', () => {
  it('keeps the existing weights and character subsets without synthesizing a new family', () => {
    expect([...new Set(faces.map(face => face['font-family']))].sort()).toEqual(["'Bebas Neue'", "'Nunito'"]);
    for (const weight of ['400', '600', '700', '800', '900']) {
      const subsetFaces = faces.filter(face => face['font-family'] === "'Nunito'" && face['font-weight'] === weight);
      expect(subsetFaces).toHaveLength(5);
      expect(new Set(subsetFaces.map(face => face['unicode-range'])).size).toBe(5);
    }
    expect(faces.filter(face => face['font-family'] === "'Bebas Neue'" && face['font-weight'] === '400')).toHaveLength(2);
    expect(faces).toHaveLength(27);
    for (const face of faces) {
      expect(face['font-style']).toBe('normal');
      expect(face['font-display']).toBe('swap');
      expect(face['unicode-range']).toBeTruthy();
    }
  });

  it('ships every referenced subset as an intact official WOFF2 binary', () => {
    expect(new Set(destinations()).size).toBe(7);
    expect(manifest.files).toHaveLength(7);
    for (const url of destinations()) {
      expect(url).toMatch(/^\/fonts\/[a-z-]+\.woff2$/);
      const filename = path.basename(url), entry = manifest.files.find(file => file.file === filename)!;
      expect(entry).toBeDefined();
      expect(new URL(entry.source).origin).toBe('https://fonts.gstatic.com');
      const bytes = readFileSync(path.join('public', url));
      expect(bytes.subarray(0, 4).toString()).toBe('wOF2');
      expect(bytes.length).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    }
  });

  it('includes the complete SIL licenses for both original families', () => {
    for (const family of ['nunito', 'bebas-neue']) {
      const license = readFileSync('public/fonts/OFL-' + family + '.txt', 'utf8');
      expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1');
      expect(license).toContain('Copyright');
      expect(license).toContain('DISCLAIMER');
    }
  });

  it('loads only local fonts and contains no external Google Fonts loaders in shipped UI source', () => {
    expect(readFileSync('app/globals.css', 'utf8')).toMatch(/^@import '\.\/fonts\.css';/);
    function inspect(directory: string) {
      for (const entry of readdirSync(directory, {withFileTypes: true})) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) inspect(file);
        else if (/\.(?:css|tsx?|jsx?|html)$/.test(entry.name)) {
          expect(readFileSync(file, 'utf8'), file).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com|next\/font\/google/);
        }
      }
    }
    for (const directory of ['app', 'components', 'lib', 'public']) inspect(directory);
    expect(css).not.toMatch(/@import|https?:|data:/);
  });

  it.each(['/', '/privacy', '/onbekend-font-test', '/admin/login', '/auth/voltooien'])('permits only same-origin fonts on %s while preserving script nonce security', async pathname => {
    const response = await proxy(new NextRequest('http://localhost:3000' + pathname));
    const policy = response.headers.get('content-security-policy')!;
    const directives = Object.fromEntries(policy.split(';').map(value => value.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));
    expect(directives['font-src']).toEqual(["'self'"]);
    expect(directives['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives['script-src']).toEqual(["'self'", expect.stringMatching(/^'nonce-[^']+'$/), "'strict-dynamic'"]);
    expect(policy).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  });
});
