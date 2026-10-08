import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createElement, type FormEvent, type ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
const state = vi.hoisted(() => ({updates: [] as unknown[], fields: {} as Record<string, string>}));
vi.mock('react', async original => ({...await original<typeof import('react')>(), useRef: (value: unknown) => ({current: value}), useState: (value: unknown) => [value, (next: unknown) => state.updates.push(next)]}));
import {AdminForm} from '@/components/admin-form';
import {RecordActions} from '@/components/admin-record-actions';
const originalFormData = globalThis.FormData;
let confirm: ReturnType<typeof vi.fn>, fetcher: ReturnType<typeof vi.fn>, assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  state.updates = []; state.fields = {action: 'delete', confirmedName: 'Fixture profiel'}; confirm = vi.fn(() => true); fetcher = vi.fn(); assign = vi.fn();
  vi.stubGlobal('window', {confirm, location: {origin: 'http://localhost:3000', assign}}); vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('FormData', class extends originalFormData {constructor() {super(); for (const [key, value] of Object.entries(state.fields)) this.set(key, value);}});
});
afterEach(() => {vi.unstubAllGlobals();});
function submitter(confirmation = '“Fixture profiel” definitief verwijderen?', archiveConfirmation?: {field: 'status' | 'isActive'; name: string}) {
  const rendered = AdminForm({action: '/api/admin/spelers', confirmation, archiveConfirmation, children: createElement('button', {type: 'button'}, 'Definitief verwijderen')}) as ReactElement<{onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>}>;
  const event = {preventDefault: vi.fn(), currentTarget: {}} as unknown as FormEvent<HTMLFormElement>;
  return {submit: () => rendered.props.onSubmit(event), event};
}
function redirectResponse(url = 'http://localhost:3000/admin/spelers?message=Profiel%20verwijderd') {return {redirected: true, ok: true, url} as Response;}

describe('Named confirmation and double-click protection', () => {
  it('canceling the named confirmation performs no request', async () => {
    confirm.mockReturnValue(false); const form = submitter(); await form.submit();
    expect(confirm).toHaveBeenCalledWith('“Fixture profiel” definitief verwijderen?'); expect(form.event.preventDefault).toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled();
  });
  it('canceling leaves the action available for a later explicit confirmation', async () => {
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true); fetcher.mockResolvedValue(redirectResponse()); const form = submitter();
    await form.submit(); await form.submit(); expect(fetcher).toHaveBeenCalledTimes(1); expect(assign).toHaveBeenCalledTimes(1);
  });
  it('two clicks while a request is pending yield one confirmation and one credentialed POST', async () => {
    let resolve!: (response: Response) => void; fetcher.mockImplementation(() => new Promise<Response>(done => {resolve = done;}));
    const form = submitter(), first = form.submit(); await form.submit();
    expect(confirm).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/admin/spelers', expect.objectContaining({method: 'POST', credentials: 'same-origin', body: expect.any(originalFormData)}));
    resolve(redirectResponse()); await first; expect(assign).toHaveBeenCalledWith('http://localhost:3000/admin/spelers?message=Profiel%20verwijderd');
  });
  it('a rejected stale or linked removal shows the safe server error without a success navigation', async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({error: 'Dit profiel heeft koppelingen en blijft behouden.'}), {status: 409, headers: {'content-type': 'application/json'}}));
    await submitter().submit(); expect(state.updates).toContain('Dit profiel heeft koppelingen en blijft behouden.'); expect(assign).not.toHaveBeenCalled(); expect(state.updates.at(-1)).toBe(false);
  });
  it('unexpected redirects cannot send an administrator to a foreign origin', async () => {
    fetcher.mockResolvedValue(redirectResponse('https://foreign.example.invalid/')); await submitter().submit(); expect(assign).not.toHaveBeenCalled(); expect(state.updates).toContain('Onverwachte doorverwijzing.');
  });
  it('a connection failure releases the pending guard for a retry', async () => {
    fetcher.mockRejectedValueOnce(new Error('Fixture offline')).mockResolvedValueOnce(redirectResponse()); const form = submitter();
    await form.submit(); await form.submit(); expect(fetcher).toHaveBeenCalledTimes(2); expect(assign).toHaveBeenCalledTimes(1);
  });
  it.each(['nieuws', 'agenda', 'sponsors', 'spelers'] as const)('%s archive action includes the exact name and revision, with an inert no-JS button', resource => {
    const props = {resource, id: crypto.randomUUID(), name: '<script>Fixture name</script>', revision: 'a'.repeat(64), archived: false};
    const tree = RecordActions(props)! as ReactElement<{children: ReactElement[]}>;
    const form = tree.props.children.find(child => child && child.type === AdminForm)! as ReactElement<{confirmation: string}>;
    expect(form.props.confirmation).toContain(props.name); expect(form.props.confirmation).toContain('blijven bewaard');
    const $ = load(renderToStaticMarkup(createElement(RecordActions, props)));
    expect($('button').attr('type')).toBe('button'); expect($('button').text()).toBe('Archiveren'); expect($('script')).toHaveLength(0);
    expect($('input[name=confirmedName]').attr('value')).toBe(props.name); expect($('input[name=expectedRevision]').attr('value')).toBe(props.revision);
    expect($('input[name=action]').attr('value')).toBe('archive'); expect($.text()).not.toContain('Definitief verwijderen');
  });
  it('only archived players get the distinct irreversible delete action', () => {
    const $ = load(renderToStaticMarkup(createElement(RecordActions, {resource: 'spelers', id: crypto.randomUUID(), name: 'Fixture profiel', revision: 'a'.repeat(64), archived: true})));
    expect($('button').text()).toBe('Definitief verwijderen'); expect($('input[name=action]').attr('value')).toBe('delete'); expect($.text()).toContain('zonder lidmaatschappen');
  });
  it.each(['status', 'isActive'] as const)('archiving through an editor field %s also requires named confirmation', async field => {
    state.fields = field === 'status' ? {status: 'archived'} : {}; fetcher.mockResolvedValue(redirectResponse());
    await submitter('', {field, name: 'Fixture item'}).submit(); expect(confirm).toHaveBeenCalledWith(expect.stringContaining('“Fixture item” archiveren?'));
    expect((fetcher.mock.calls[0][1].body as FormData).get('confirmedName')).toBe('Fixture item');
  });
  it('ordinary editor saves require no archive confirmation', async () => {
    state.fields = {isActive: 'on'}; fetcher.mockResolvedValue(redirectResponse()); await submitter('', {field: 'isActive', name: 'Fixture item'}).submit();
    expect(confirm).not.toHaveBeenCalled(); expect((fetcher.mock.calls[0][1].body as FormData).get('confirmedName')).toBeNull();
  });
  it('canceling an archive selected through an editor also performs no write', async () => {
    state.fields = {status: 'archived'}; confirm.mockReturnValue(false); await submitter('', {field: 'status', name: 'Fixture item'}).submit(); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['nieuws', 'agenda', 'sponsors'] as const)('archived %s preserves the item and offers no permanent delete form', resource => {
    const $ = load(renderToStaticMarkup(createElement(RecordActions, {resource, id: crypto.randomUUID(), name: 'Fixture item', revision: 'a'.repeat(64), archived: true})));
    expect($('form,button')).toHaveLength(0); expect($.text()).toContain('Gearchiveerd'); expect($.text()).toContain('blijven bewaard');
  });
});
