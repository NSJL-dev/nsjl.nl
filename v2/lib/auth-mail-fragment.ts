export type MailTokens = {access_token: string; refresh_token: string; type: 'invite' | 'recovery'};
export type MailFragment = {kind: 'tokens'; tokens: MailTokens} | {kind: 'invalid'};
type BrowserLocation = {location: Pick<Location, 'hash' | 'pathname' | 'search'>; history: Pick<History, 'state' | 'replaceState'>};
export function takeMailFragment(browser: BrowserLocation): MailFragment | null {
  const params = new URLSearchParams(browser.location.hash.slice(1));
  if (!['access_token', 'refresh_token', 'error', 'error_code', 'error_description'].some(key => params.has(key)) && !['invite', 'recovery'].includes(params.get('type') || '')) return null;
  // Remove even malformed/error fragments before validation, UI or any network request.
  browser.history.replaceState(browser.history.state, '', browser.location.pathname + browser.location.search);
  const access = params.get('access_token'), refresh = params.get('refresh_token'), type = params.get('type');
  if (params.has('error') || params.has('error_code') || params.has('error_description') || !access || !refresh || access.length > 4096 || refresh.length > 4096 || !['invite', 'recovery'].includes(type || '') || params.get('token_type')?.toLowerCase() !== 'bearer' || ['access_token', 'refresh_token', 'type', 'token_type'].some(key => params.getAll(key).length !== 1)) return {kind: 'invalid'};
  return {kind: 'tokens', tokens: {access_token: access, refresh_token: refresh, type: type as 'invite' | 'recovery'}};
}
export function mailBrowserTransportAllowed(location: Pick<Location, 'protocol' | 'hostname'>, allowLocalHttp: boolean) {
  return location.protocol === 'https:' || (allowLocalHttp && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && location.protocol === 'http:');
}
