// Form IDs are public submission addresses, not API keys. Never expose URL
// credentials, query tokens, fragments or arbitrary destinations from config.
export const DEFAULT_FORMSPREE_ENDPOINT = 'https://formspree.io/f/mdajbaba';

export function formspreeEndpoint(value?: string): string | null {
  try {
    const url = new URL(value?.trim() || DEFAULT_FORMSPREE_ENDPOINT);
    if (url.origin !== 'https://formspree.io' || url.username || url.password || url.search || url.hash || !/^\/f\/[a-zA-Z0-9]+$/.test(url.pathname)) return null;
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}

export type ContactStatus = 'idle' | 'sending' | 'success' | 'validation' | 'unavailable' | 'limited' | 'service' | 'unconfirmed';
export function contactResponseStatus(status: number): ContactStatus {
  if (status >= 200 && status < 300) return 'success';
  if (status === 429) return 'limited';
  if (status === 400 || status === 422) return 'validation';
  if ([401, 403, 404, 410].includes(status)) return 'unavailable';
  return 'service';
}
export function contactErrorMessage(status: ContactStatus): string | null {
  switch (status) {
    case 'validation': return 'Het formulier is niet geaccepteerd. Controleer je naam, e-mailadres en bericht. Je invoer blijft staan.';
    case 'limited': return 'Het formulier accepteert momenteel geen nieuwe berichten. Probeer het later opnieuw. Je invoer blijft staan.';
    case 'unavailable': return 'Het contactformulier is momenteel niet beschikbaar.';
    case 'service': return 'De berichtendienst is tijdelijk niet beschikbaar. Probeer het later opnieuw. Je invoer blijft staan.';
    case 'unconfirmed': return 'We konden de verzending niet bevestigen. Je invoer blijft staan. Probeer het later opnieuw.';
    default: return null;
  }
}
