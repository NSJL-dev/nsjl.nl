import {NextRequest, NextResponse} from 'next/server';
import {writeSessionCookies} from '@/lib/auth-client';
import {AccessError} from '@/lib/security';
import {ZodError} from 'zod';
import {MAIL_CSRF_COOKIE, MAIL_CONFIRM_COOKIE, assertMailTransport, assertNoMailSession, newMailChallenge, mailCookieOptions, mailInput, mailConfirmation, sameMailSecret, previewMailSession, activateMailSession, limitMailRequests} from '@/lib/auth-mail';

const headers = {'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer'};
function failure(error: unknown) {
  const status = error instanceof AccessError ? error.status : error instanceof ZodError || error instanceof SyntaxError ? 400 : 503;
  return NextResponse.json({error: status === 409 ? 'Log eerst expliciet uit voordat je deze maillink verder verwerkt.' : 'Deze maillink kan niet veilig worden verwerkt. Vraag zo nodig een nieuwe link aan.'}, {status, headers});
}
export async function GET(request: NextRequest) {
  try {
    assertMailTransport(request); assertNoMailSession(request.cookies);
    const csrf = newMailChallenge(), response = NextResponse.json({csrf}, {headers});
    response.cookies.set(MAIL_CSRF_COOKIE, csrf, mailCookieOptions());
    response.cookies.set(MAIL_CONFIRM_COOKIE, '', {...mailCookieOptions(), maxAge: 0});
    return response;
  } catch (error) { return failure(error); }
}
async function boundedJson(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new AccessError(415, 'Ongeldige aanvraag.');
  const reader = request.body?.getReader(); if (!reader) throw new AccessError(400, 'Ongeldige aanvraag.');
  const parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.byteLength; if (length > 10000) { await reader.cancel(); throw new AccessError(413, 'Ongeldige aanvraag.'); }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
  } finally { reader.releaseLock(); }
}
export async function POST(request: NextRequest) {
  try {
    assertMailTransport(request, true); assertNoMailSession(request.cookies);
    const input = mailInput.parse(await boundedJson(request));
    if (!sameMailSecret(request.cookies.get(MAIL_CSRF_COOKIE)?.value, input.csrf)) throw new AccessError(403, 'Ongeldige aanvraag.');
    if (input.action === 'activate' && !sameMailSecret(request.cookies.get(MAIL_CONFIRM_COOKIE)?.value, mailConfirmation(input))) throw new AccessError(403, 'Bevestig eerst je account.');
    await limitMailRequests();
    if (input.action === 'preview') {
      const identity = await previewMailSession(input), response = NextResponse.json(identity, {headers});
      response.cookies.set(MAIL_CONFIRM_COOKIE, mailConfirmation(input), mailCookieOptions());
      return response;
    }
    const session = await activateMailSession(input), response = NextResponse.json({destination: '/admin/wachtwoord'}, {headers});
    writeSessionCookies(response.cookies, session);
    for (const name of [MAIL_CSRF_COOKIE, MAIL_CONFIRM_COOKIE]) response.cookies.set(name, '', {...mailCookieOptions(), maxAge: 0});
    return response;
  } catch (error) { return failure(error); }
}
