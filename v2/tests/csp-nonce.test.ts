import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {dynamic} from '@/app/layout';
import {proxy} from '@/proxy';

const mocks = vi.hoisted(() => ({auth: vi.fn()}));
vi.mock('@/lib/auth-client', () => ({ACCESS_COOKIE: 'fixture-access', REFRESH_COOKIE: 'fixture-refresh', newAuthClient: mocks.auth, writeSessionCookies: vi.fn(), expireSessionCookies: vi.fn()}));
vi.mock('@/components/auth/mail-bridge', () => ({AuthMailBridge: () => null}));
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({NODE_ENV: 'production', APP_ENV: 'staging', APP_URL: 'https://staging.example.invalid', DATABASE_MODE: 'postgres', DATABASE_URL: 'postgresql://localhost:1/fixture', SYNC_ENABLED: 'false', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable'})) vi.stubEnv(key, value);
  vi.stubEnv('VERCEL', undefined); vi.stubEnv('FORM_SPREE_ENDPOINT', undefined);
});
afterEach(() => vi.unstubAllEnvs());

function directive(csp: string, name: string) {
  return csp.split(';').map(value => value.trim()).find(value => value.startsWith(name + ' '))!.split(/\s+/).slice(1);
}
describe('Request-bound HTML and nonce propagation', () => {
  it('keeps all HTML, including the shared not-found route, out of static rendering', () => {
    expect(dynamic).toBe('force-dynamic');
    function inspect(directory: string) {
      for (const entry of readdirSync(directory, {withFileTypes: true})) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) inspect(file);
        else if (['page.tsx', 'layout.tsx', 'not-found.tsx', 'global-not-found.tsx'].includes(entry.name)) {
          // A descendant static override would break nonce safety despite the root policy.
          expect(readFileSync(file, 'utf8'), file).not.toMatch(/export\s+const\s+dynamic\s*=\s*['"](?:force-static|error)['"]/);
        }
      }
    }
    inspect('app');
  });
  it.each(['/privacy', '/onbekend-csp-test', '/admin/login', '/auth/voltooien'])('forwards the response nonce to Next.js rendering on %s', async pathname => {
    const request = new NextRequest('https://staging.example.invalid' + pathname, {headers: {'x-nonce': 'untrusted-client-nonce', 'content-security-policy': "script-src 'unsafe-inline'"}});
    const response = await proxy(request), policy = response.headers.get('content-security-policy')!;
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy(); expect(nonce).not.toBe('untrusted-client-nonce');
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
    expect(directive(policy, 'script-src')).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-eval'");
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
    expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it('issues a fresh matching nonce on every privacy/404 request', async () => {
    const policies = await Promise.all(['/privacy', '/privacy', '/onbekend-csp-test', '/onbekend-csp-test'].map(async pathname => (await proxy(new NextRequest('https://staging.example.invalid' + pathname))).headers.get('content-security-policy')!));
    const nonces = policies.map(policy => policy.match(/'nonce-([^']+)'/)?.[1]);
    expect(nonces.every(Boolean)).toBe(true); expect(new Set(nonces).size).toBe(4);
  });
  it('preserves the exact Formspree/Supabase destinations and private Auth caching', async () => {
    const response = await proxy(new NextRequest('https://staging.example.invalid/auth/voltooien'));
    expect(directive(response.headers.get('content-security-policy')!, 'connect-src')).toEqual(["'self'", 'https://fixture.supabase.co', 'https://formspree.io/f/mdajbaba']);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });
});
