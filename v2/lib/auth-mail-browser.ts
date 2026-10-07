import {mailBrowserTransportAllowed, type MailTokens} from './auth-mail-fragment';
export type MailView = {phase: 'checking' | 'confirm' | 'activating' | 'error' | 'logout'; email?: string};
type Browser = {location: Pick<Location, 'protocol' | 'hostname'>; fetch: typeof fetch; replace(url: string): void; allowLocalHttp: boolean};

export function createMailHandoff(input: MailTokens, browser: Browser, changed: (view: MailView) => void) {
  let tokens: MailTokens | null = {...input}, csrf = '', view: MailView | null = null, cancelled = false;
  const controller = new AbortController();
  const clear = () => {tokens = null; csrf = '';};
  const show = (next: MailView) => {if (!cancelled) {view = next; changed(next);}};
  async function call(payload?: Record<string, string>) {
    const response = await browser.fetch('/api/auth/mail-session', {method: payload ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal, ...(payload ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)} : {})});
    if (!response.ok) {const error = new Error('Maillink geweigerd.'); Object.assign(error, {status: response.status}); throw error;}
    return await response.json() as {csrf?: string; email?: string};
  }
  function denied(error: unknown) {
    if (cancelled) return;
    if (error instanceof Error && 'status' in error && error.status === 409 && tokens) {csrf = ''; show({phase: 'logout'});}
    else {clear(); show({phase: 'error'});}
  }
  async function prepare() {
    if (!tokens || cancelled) return;
    show({phase: 'checking'});
    if (!mailBrowserTransportAllowed(browser.location, browser.allowLocalHttp)) {denied(null); return;}
    try {
      const challenge = await call(); if (cancelled || !tokens) return;
      if (typeof challenge.csrf !== 'string' || !/^[a-f0-9]{64}$/.test(challenge.csrf)) throw new Error();
      csrf = challenge.csrf;
      const identity = await call({...tokens, csrf, action: 'preview'}); if (cancelled) return;
      if (typeof identity.email !== 'string' || !identity.email || identity.email.length > 254) throw new Error();
      show({phase: 'confirm', email: identity.email});
    } catch (error) {denied(error);}
  }
  return {
    async start() {if (view === null) await prepare();},
    async confirm() {
      if (!tokens || cancelled || view?.phase !== 'confirm') return;
      show({...view, phase: 'activating'});
      try {await call({...tokens, csrf, action: 'activate'}); clear(); browser.replace('/admin/wachtwoord');}
      catch (error) {denied(error);}
    },
    async logoutAndRestart() {
      if (!tokens || cancelled || view?.phase !== 'logout') return;
      show({phase: 'checking'});
      try {
        // Explicit user action only. Keep the already-consumed mail's tokens in
        // memory; the existing logout route clears/revokes the old cookie session.
        const response = await browser.fetch('/api/auth/logout', {method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'follow', referrerPolicy: 'no-referrer', signal: controller.signal});
        if (!response.ok) throw new Error();
        await prepare();
      } catch (error) {denied(error);}
    },
    cancel() {
      if (view?.phase === 'activating') return;
      cancelled = true; controller.abort(); clear(); browser.replace('/admin/login');
    },
  };
}
