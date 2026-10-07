import {describe, expect, it, vi} from 'vitest';
import {createMailHandoff, type MailView} from '@/lib/auth-mail-browser';
const tokens = {access_token: 'fixture-access', refresh_token: 'fixture-refresh', type: 'recovery' as const};
function setup() {
  const states: MailView[] = [], replace = vi.fn();
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if (init?.method === 'GET') return Response.json({csrf: 'a'.repeat(64)});
    const action = JSON.parse(String(init?.body)).action;
    return Response.json(action === 'preview' ? {email: 'verified@example.invalid'} : {destination: 'https://evil.example.invalid'});
  });
  const browser = {location: {protocol: 'https:', hostname: 'staging.example.invalid'}, allowLocalHttp: false, fetch, replace};
  const handoff = createMailHandoff(tokens, browser, state => states.push(state));
  return {handoff, browser, fetch, replace, states};
}
describe('Explicit, storage-free browser mail workflow', () => {
  it('previews a verified identity but never automatically activates or logs out', async () => {
    const c = setup(); await c.handoff.start();
    expect(c.states.at(-1)).toEqual({phase: 'confirm', email: 'verified@example.invalid'});
    expect(c.fetch).toHaveBeenCalledTimes(2); expect(c.replace).not.toHaveBeenCalled();
    expect(JSON.parse(String(c.fetch.mock.calls[1][1]?.body))).toEqual({...tokens, csrf: 'a'.repeat(64), action: 'preview'});
    for (const [url, init] of c.fetch.mock.calls) {expect(url).toBe('/api/auth/mail-session'); expect(init).toMatchObject({credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer'});}
  });
  it('requires explicit confirmation, POSTs only to its own endpoint and ignores an external destination', async () => {
    const c = setup(); await c.handoff.confirm(); expect(c.fetch).not.toHaveBeenCalled();
    await c.handoff.start(); await c.handoff.confirm();
    const [url, init] = c.fetch.mock.calls[2]; expect(url).toBe('/api/auth/mail-session'); expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({...tokens, csrf: 'a'.repeat(64), action: 'activate'});
    expect(c.replace).toHaveBeenCalledWith('/admin/wachtwoord');
    await c.handoff.confirm(); expect(c.fetch).toHaveBeenCalledTimes(3);
  });
  it('waits for explicit logout, then rechecks the consumed mail tokens in memory before separate confirmation', async () => {
    const c = setup(); c.fetch.mockResolvedValueOnce(Response.json({}, {status: 409}));
    await c.handoff.start(); expect(c.states.at(-1)?.phase).toBe('logout'); expect(c.fetch).toHaveBeenCalledTimes(1);
    await c.handoff.confirm(); expect(c.fetch).toHaveBeenCalledTimes(1);
    c.fetch.mockResolvedValueOnce(new Response('Fixture login page after logout', {status: 200}));
    await c.handoff.logoutAndRestart();
    expect(c.fetch.mock.calls[1]).toEqual(['/api/auth/logout', expect.objectContaining({method: 'POST', credentials: 'same-origin', redirect: 'follow', cache: 'no-store', referrerPolicy: 'no-referrer'})]);
    expect(JSON.parse(String(c.fetch.mock.calls[3][1]?.body))).toEqual({...tokens, csrf: 'a'.repeat(64), action: 'preview'});
    expect(c.states.at(-1)).toEqual({phase: 'confirm', email: 'verified@example.invalid'}); expect(c.replace).not.toHaveBeenCalled();
    await c.handoff.confirm(); expect(c.replace).toHaveBeenCalledWith('/admin/wachtwoord');
  });
  it('does not restart a mail or activate after a failed logout', async () => {
    const c = setup(); c.fetch.mockResolvedValueOnce(Response.json({}, {status: 409})); await c.handoff.start();
    c.fetch.mockResolvedValueOnce(Response.json({}, {status: 403})); await c.handoff.logoutAndRestart();
    expect(c.states.at(-1)?.phase).toBe('error'); await c.handoff.confirm(); await c.handoff.logoutAndRestart();
    expect(c.fetch).toHaveBeenCalledTimes(2); expect(c.replace).not.toHaveBeenCalled();
  });
  it('cancels an in-flight preview, erases its tokens and never performs a later POST', async () => {
    const c = setup(); let finish!: (response: Response) => void;
    c.fetch.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const started = c.handoff.start(); c.handoff.cancel(); finish(Response.json({csrf: 'a'.repeat(64)})); await started;
    expect(c.fetch.mock.calls[0][1]?.signal?.aborted).toBe(true); expect(c.replace).toHaveBeenCalledWith('/admin/login');
    await c.handoff.confirm(); expect(c.fetch).toHaveBeenCalledTimes(1); expect(c.states.at(-1)?.phase).toBe('checking');
  });
  it('sends only one activation for concurrent confirm clicks and prevents cancellation during commit', async () => {
    const c = setup(); await c.handoff.start(); let finish!: (response: Response) => void;
    c.fetch.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const first = c.handoff.confirm(); await c.handoff.confirm(); c.handoff.cancel(); expect(c.replace).not.toHaveBeenCalled();
    finish(Response.json({})); await first; expect(c.fetch).toHaveBeenCalledTimes(3); expect(c.replace).toHaveBeenCalledOnce(); expect(c.replace).toHaveBeenCalledWith('/admin/wachtwoord');
  });
  it('does not send any request over non-local HTTP', async () => {
    const c = setup(); c.browser.location.protocol = 'http:';
    const blocked = createMailHandoff(tokens, c.browser, state => c.states.push(state)); await blocked.start();
    expect(c.states.at(-1)?.phase).toBe('error'); expect(c.fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 503])('discards tokens and keeps error details generic after HTTP %s', async status => {
    const c = setup(); c.fetch.mockResolvedValueOnce(Response.json({error: 'Fixture details ' + tokens.access_token}, {status}));
    await c.handoff.start(); await c.handoff.confirm(); expect(c.states.at(-1)).toEqual({phase: 'error'});
    expect(JSON.stringify(c.states)).not.toContain(tokens.access_token); expect(c.fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps network exceptions out of UI and does not retry with discarded credentials', async () => {
    const c = setup(); c.fetch.mockRejectedValueOnce(new Error('Fixture details ' + tokens.refresh_token));
    await c.handoff.start(); await c.handoff.start(); await c.handoff.confirm();
    expect(c.states.at(-1)).toEqual({phase: 'error'}); expect(JSON.stringify(c.states)).not.toContain(tokens.refresh_token); expect(c.fetch).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate preparation when React effects repeat', async () => {
    const c = setup(); await Promise.all([c.handoff.start(), c.handoff.start()]); expect(c.fetch).toHaveBeenCalledTimes(2);
  });
  it('does not accept a malformed preview identity', async () => {
    const c = setup(); c.fetch.mockResolvedValueOnce(Response.json({csrf: 'a'.repeat(64)})).mockResolvedValueOnce(Response.json({email: {html: '<script>fixture</script>'}}));
    await c.handoff.start(); await c.handoff.confirm(); expect(c.states.at(-1)?.phase).toBe('error'); expect(c.fetch).toHaveBeenCalledTimes(2);
  });
});
