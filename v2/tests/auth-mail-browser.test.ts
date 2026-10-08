import {describe, expect, it, vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {takeMailFragment, mailBrowserTransportAllowed} from '@/lib/auth-mail-fragment';
import {AuthMailBridge, MailErrorNotice} from '@/components/auth/mail-bridge';
function browser(fragment: string, path = '/') {
  const state = {next: 'existing-history-state'};
  const location = {hash: fragment, pathname: path, search: '?context=regular'};
  const history = {state, replaceState: (preserved: unknown, _unused: string, url: string | URL | null | undefined) => {
    expect(preserved).toBe(state); expect(url).toBe(path + '?context=regular'); location.hash = '';
  }};
  return {location, history};
}
describe('Browser-only Supabase fragment handoff', () => {
  it.each(['invite', 'recovery'])('captures %s on the default Site URL and clears tokens synchronously', type => {
    const b = browser(`#access_token=fixture-access&refresh_token=fixture-refresh&token_type=bearer&type=${type}&expires_in=3600`);
    const fragment = takeMailFragment(b); expect(b.location.hash).toBe('');
    expect(fragment).toEqual({kind: 'tokens', tokens: {access_token: 'fixture-access', refresh_token: 'fixture-refresh', type}});
    expect(takeMailFragment(b)).toBeNull();
  });
  it('also captures a callback landing fragment', () => {
    const b = browser('#access_token=fixture-access&refresh_token=fixture-refresh&token_type=bearer&type=invite', '/auth/voltooien');
    expect(takeMailFragment(b)?.kind).toBe('tokens'); expect(b.location.hash).toBe('');
  });
  it('clears a fragment when the client module first executes, before mounting or fetching', async () => {
    const b = browser('#access_token=fixture-access&refresh_token=fixture-refresh&token_type=bearer&type=recovery');
    const fetch = vi.fn(); vi.resetModules(); vi.stubGlobal('window', b); vi.stubGlobal('fetch', fetch);
    try { await import('@/components/auth/mail-bridge'); expect(b.location.hash).toBe(''); expect(fetch).not.toHaveBeenCalled(); }
    finally { vi.unstubAllGlobals(); }
  });
  it.each(['#error=access_denied&error_description=sensitive-details', '#access_token=fixture-access', '#type=recovery', '#access_token=a&access_token=b&refresh_token=c&token_type=bearer&type=invite', '#access_token=a&refresh_token=b&token_type=bearer&type=signup', '#access_token=a&refresh_token=b&type=invite'])('strips malformed or error fragment %s without returning sensitive details', hash => {
    const b = browser(hash); expect(takeMailFragment(b)).toEqual({kind: 'invalid'}); expect(b.location.hash).toBe('');
  });
  it.each(['#stand', '#team', '#nieuws', ''])('preserves normal public fragment %s', hash => {
    const b = browser(hash); expect(takeMailFragment(b)).toBeNull(); expect(b.location.hash).toBe(hash);
  });
  it('does not change normal public or admin server markup', () => { expect(renderToStaticMarkup(createElement(AuthMailBridge))).toBe(''); });
  it.each(['MAIL_JSON_UNREADABLE', 'MAIL_PREVIEW_INVALID', 'MAIL_STATE_PUBLISH_FAILED'] as const)('shows safe diagnostic %s without calling it an unsafe link', category => {
    const markup = renderToStaticMarkup(createElement(MailErrorNotice, {category}));
    expect(markup).toContain('role="alert"'); expect(markup).toContain(`<code>${category}</code>`);
    expect(markup).not.toContain('Deze maillink kan niet veilig worden verwerkt');
  });
  it('preserves the generic link rejection for authentication or fragment failures', () => {
    const markup = renderToStaticMarkup(createElement(MailErrorNotice));
    expect(markup).toContain('Deze maillink kan niet veilig worden verwerkt'); expect(markup).not.toContain('Foutcategorie:');
  });
  it('allows HTTPS and only explicitly enabled localhost HTTP', () => {
    expect(mailBrowserTransportAllowed({protocol: 'https:', hostname: 'staging.example.invalid'}, false)).toBe(true);
    expect(mailBrowserTransportAllowed({protocol: 'http:', hostname: 'localhost'}, true)).toBe(true);
    expect(mailBrowserTransportAllowed({protocol: 'http:', hostname: 'localhost'}, false)).toBe(false);
    expect(mailBrowserTransportAllowed({protocol: 'http:', hostname: 'staging.example.invalid'}, true)).toBe(false);
  });
});
