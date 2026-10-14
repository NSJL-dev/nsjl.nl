import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createElement, type FormEvent, type ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
const state = vi.hoisted(() => ({updates: [] as string[], fields: {} as Record<string,string>}));
vi.mock('react', async original => ({...await original<typeof import('react')>(), useState: (initial: string) => [initial,(value: string) => state.updates.push(value)], useRef: (value: unknown) => ({current: value})}));
import {ContactForm} from '@/components/public/contact-form';
import {ContactSection} from '@/components/public/contact';
import {DEFAULT_FORMSPREE_ENDPOINT, contactErrorMessage, contactResponseStatus, formspreeEndpoint} from '@/lib/formspree';
const NativeFormData = globalThis.FormData;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  state.updates=[];state.fields={naam:'Fixture naam',email:'contact-fixture@example.invalid',bericht:'Dit is een lokaal fixturebericht.',_gotcha:''};fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  vi.stubGlobal('FormData',class extends NativeFormData {constructor(){super();for(const [key,value]of Object.entries(state.fields))this.set(key,value);}});
});
afterEach(() => {vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
function form(endpoint: string|null=DEFAULT_FORMSPREE_ENDPOINT) {
  const tree=ContactForm({endpoint,email:'info@example.invalid'}) as ReactElement<{onSubmit:(event:FormEvent<HTMLFormElement>)=>Promise<void>}>;
  const reset=vi.fn(),reportValidity=vi.fn(()=>true),preventDefault=vi.fn();
  const event={currentTarget:{reset,reportValidity},preventDefault} as unknown as FormEvent<HTMLFormElement>;
  return {submit:()=>tree.props.onSubmit(event),reset,reportValidity,preventDefault};
}
describe('Safe reuse of the legacy Formspree submission endpoint',()=>{
  it('defaults to the existing public form ID without an API key',()=>{expect(formspreeEndpoint()).toBe('https://formspree.io/f/mdajbaba');expect(formspreeEndpoint('')).toBe(DEFAULT_FORMSPREE_ENDPOINT);});
  it('supports a configured public Formspree ID and trims harmless spacing',()=>{expect(formspreeEndpoint(' https://formspree.io/f/fixture123 ')).toBe('https://formspree.io/f/fixture123');});
  it.each(['not a URL','http://formspree.io/f/mdajbaba','https://evil.invalid/f/mdajbaba','https://formspree.io.evil.invalid/f/mdajbaba','https://formspree.io:444/f/mdajbaba','https://user:PRIVATE_PASSWORD@formspree.io/f/mdajbaba','https://formspree.io/f/mdajbaba?token=PRIVATE_TOKEN','https://formspree.io/f/mdajbaba#PRIVATE_TOKEN','https://formspree.io/info@example.invalid','https://formspree.io/f/mdajbaba/','javascript:alert(1)','https://formspree.io/f/a;b'])('rejects unsafe configuration without exposure: %s',value=>{expect(formspreeEndpoint(value)).toBeNull();});
  it('does not serialize credentials or token parameters from server configuration into public HTML',()=>{
    vi.stubEnv('FORM_SPREE_ENDPOINT','https://user:PRIVATE_PASSWORD@formspree.io/f/mdajbaba?token=PRIVATE_TOKEN');
    const html=renderToStaticMarkup(createElement(ContactSection,{settings:{contact_email:'info@example.invalid'}})), $=load(html);
    expect(html).not.toContain('PRIVATE_PASSWORD');expect(html).not.toContain('PRIVATE_TOKEN');expect($('.pub-contact-form').attr('action')).toBeUndefined();expect($('.pub-contact-form button').attr('disabled')).toBeDefined();expect($('[role=alert]').text()).toContain('niet beschikbaar');
  });
  it('preserves Dutch field names, JSON acceptance and public endpoint without cookies or credentials',async()=>{
    fetcher.mockResolvedValue(new Response('{"ok":true}',{status:200}));const f=form();await f.submit();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(DEFAULT_FORMSPREE_ENDPOINT,expect.objectContaining({method:'POST',headers:{Accept:'application/json'},credentials:'omit'}));
    const body=fetcher.mock.calls[0][1].body as FormData;expect(Object.fromEntries(body)).toEqual(state.fields);expect(state.updates).toEqual(['sending','success']);expect(f.reset).toHaveBeenCalledTimes(1);expect(f.preventDefault).toHaveBeenCalled();
  });
  it('does not falsely report delivery failure if resetting the accepted form fails',async()=>{
    fetcher.mockResolvedValue(new Response('{"ok":true}',{status:200}));const f=form();f.reset.mockImplementation(()=>{throw new Error('PRIVATE DOM EXCEPTION');});await f.submit();expect(state.updates).toEqual(['sending','success']);
  });
  it.each([[400,'validation'],[422,'validation'],[401,'unavailable'],[403,'unavailable'],[404,'unavailable'],[410,'unavailable'],[429,'limited'],[500,'service'],[503,'service']] as const)('maps HTTP %i to %s, preserves input and hides raw provider body',async(code,category)=>{
    const raw='PRIVATE_PROVIDER_INPUT_MARKER',response=new Response(JSON.stringify({error:raw,email:raw}),{status:code}),json=vi.spyOn(response,'json'),error=vi.spyOn(console,'error'),log=vi.spyOn(console,'log');
    fetcher.mockResolvedValue(response);const f=form();await f.submit();expect(state.updates.at(-1)).toBe(category);expect(f.reset).not.toHaveBeenCalled();expect(json).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(log).not.toHaveBeenCalled();expect(contactErrorMessage(category)).not.toContain(raw);
  });
  it('treats network/CSP rejection as unconfirmed delivery, without logging raw exceptions',async()=>{
    const error=vi.spyOn(console,'error');fetcher.mockRejectedValue(new Error('PRIVATE NETWORK DETAILS'));const f=form();await f.submit();expect(state.updates.at(-1)).toBe('unconfirmed');expect(f.reset).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(contactErrorMessage('unconfirmed')).toContain('niet bevestigen');
  });
  it('synchronously blocks duplicate submissions before React updates the button',async()=>{
    let done!:(response:Response)=>void;fetcher.mockImplementation(()=>new Promise<Response>(resolve=>{done=resolve;}));const f=form(),pending=f.submit();await f.submit();expect(fetcher).toHaveBeenCalledTimes(1);done(new Response('{}',{status:200}));await pending;expect(f.reset).toHaveBeenCalledTimes(1);
  });
  it('allows a deliberate retry after failure without clearing the user input',async()=>{
    fetcher.mockRejectedValueOnce(new Error('Fixture network failure')).mockResolvedValueOnce(new Response('{}',{status:200}));const f=form();await f.submit();expect(f.reset).not.toHaveBeenCalled();await f.submit();expect(fetcher).toHaveBeenCalledTimes(2);expect(state.updates.at(-1)).toBe('success');
  });
  it('performs no request for invalid browser fields',async()=>{const f=form();f.reportValidity.mockReturnValue(false);await f.submit();expect(fetcher).not.toHaveBeenCalled();expect(f.reset).not.toHaveBeenCalled();});
  it('performs no request for a filled honeypot',async()=>{state.fields._gotcha='Fixture bot';const f=form();await f.submit();expect(fetcher).not.toHaveBeenCalled();expect(state.updates).toEqual(['validation']);expect(f.reset).not.toHaveBeenCalled();});
  it.each([null,'https://foreign.invalid/f/form'])('performs no request with unavailable/unsafe endpoint %s',async endpoint=>{await form(endpoint).submit();expect(fetcher).not.toHaveBeenCalled();expect(state.updates.at(-1)).toBe('unavailable');});
  it('uses fixed Dutch messages, with no invented success on rejected status',()=>{expect(contactResponseStatus(200)).toBe('success');expect(contactResponseStatus(429)).toBe('limited');expect(contactErrorMessage('limited')).toContain('later');expect(contactErrorMessage('success')).toBeNull();});
});
