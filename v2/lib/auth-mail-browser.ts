import {mailBrowserTransportAllowed, type MailTokens} from './auth-mail-fragment';
export type MailErrorCategory = 'MAIL_JSON_UNREADABLE' | 'MAIL_PREVIEW_INVALID' | 'MAIL_STATE_PUBLISH_FAILED';
export type MailView = {phase: 'checking' | 'confirm' | 'activating' | 'error' | 'logout'; email?: string; errorCategory?: MailErrorCategory};
type Browser = {location: Pick<Location, 'protocol' | 'hostname'>; fetch: typeof fetch; replace(url: string): void; allowLocalHttp: boolean};

class MailProcessingError extends Error {
  constructor(readonly category: MailErrorCategory) {super('Het antwoord kon niet worden verwerkt.');}
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function previewEmail(value: unknown): string {
  if (!isRecord(value) || !Object.hasOwn(value, 'email') || typeof value.email !== 'string' || !value.email || value.email.length > 254) throw new MailProcessingError('MAIL_PREVIEW_INVALID');
  return value.email;
}

export function createMailHandoff(input: MailTokens, browser: Browser, changed: (view: MailView) => void) {
  let tokens: MailTokens | null = {...input}, csrf = '', view: MailView | null = null, cancelled = false, publishing = false;
  const controller = new AbortController();
  const clear = () => {tokens = null; csrf = '';};
  function show(next: MailView): boolean {
    if (cancelled || publishing) return false;
    view = next; publishing = true;
    try {changed(next); return true;}
    catch {
      clear(); view = {phase: 'error', errorCategory: 'MAIL_STATE_PUBLISH_FAILED'};
      // A broken state publisher may also prevent the error UI from rendering.
      // Emit only this fixed code; never the caught exception or identity.
      try {console.warn('MAIL_STATE_PUBLISH_FAILED');} catch {}
      try {changed(view);} catch {}
      return false;
    } finally {publishing = false;}
  }
  async function call(payload?: Record<string, string>): Promise<unknown> {
    const response = await browser.fetch('/api/auth/mail-session', {method: payload ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal, ...(payload ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)} : {})});
    if (!response.ok) {const error = new Error('Maillink geweigerd.'); Object.assign(error, {status: response.status}); throw error;}
    try {return await response.json();}
    catch {throw new MailProcessingError('MAIL_JSON_UNREADABLE');}
  }
  function denied(error: unknown) {
    if (cancelled) return;
    if (error instanceof Error && 'status' in error && error.status === 409 && tokens) {csrf = ''; show({phase: 'logout'});}
    else {clear(); show(error instanceof MailProcessingError ? {phase: 'error', errorCategory: error.category} : {phase: 'error'});}
  }
  async function prepare() {
    if (!tokens || cancelled) return;
    if (!show({phase: 'checking'})) return;
    if (!mailBrowserTransportAllowed(browser.location, browser.allowLocalHttp)) {denied(null); return;}
    let email: string;
    try {
      const challenge = await call(); if (cancelled || !tokens) return;
      if (!isRecord(challenge) || !Object.hasOwn(challenge, 'csrf') || typeof challenge.csrf !== 'string' || !/^[a-f0-9]{64}$/.test(challenge.csrf)) throw new MailProcessingError('MAIL_PREVIEW_INVALID');
      csrf = challenge.csrf;
      const identity = await call({...tokens, csrf, action: 'preview'}); if (cancelled) return;
      email = previewEmail(identity);
    } catch (error) {denied(error); return;}
    // Publication failures are UI failures, not rejected authentication.
    show({phase: 'confirm', email});
  }
  return {
    async start() {if (view === null && !publishing) await prepare();},
    async confirm() {
      if (!tokens || cancelled || publishing || view?.phase !== 'confirm') return;
      if (!show({...view, phase: 'activating'})) return;
      try {await call({...tokens, csrf, action: 'activate'}); clear(); browser.replace('/admin/wachtwoord');}
      catch (error) {denied(error);}
    },
    async logoutAndRestart() {
      if (!tokens || cancelled || publishing || view?.phase !== 'logout') return;
      if (!show({phase: 'checking'})) return;
      try {
        // Explicit user action only. Keep the already-consumed mail's tokens in
        // memory; the existing logout route clears/revokes the old cookie session.
        const response = await browser.fetch('/api/auth/logout', {method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'follow', referrerPolicy: 'no-referrer', signal: controller.signal});
        if (!response.ok) throw new Error();
        await prepare();
      } catch (error) {denied(error);}
    },
    cancel() {
      if (publishing || view?.phase === 'activating') return;
      cancelled = true; controller.abort(); clear(); browser.replace('/admin/login');
    },
  };
}
