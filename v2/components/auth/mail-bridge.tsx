'use client';
import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {takeMailFragment, type MailFragment} from '@/lib/auth-mail-fragment';
import {createMailHandoff, type MailView} from '@/lib/auth-mail-browser';
import styles from './mail-bridge.module.css';

// Capture at the first execution of this client module, before React hydration.
// This mailbox lives only in memory and is consumed by the mounted bridge.
let initialFragment: MailFragment | null = typeof window === 'undefined' ? null : takeMailFragment(window);

export function AuthMailBridge({allowLocalHttp = false}: {allowLocalHttp?: boolean}) {
  const [view, setView] = useState<MailView | null>(null);
  const handoff = useRef<ReturnType<typeof createMailHandoff> | null>(null), started = useRef(false), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const fragment = initialFragment ?? takeMailFragment(window); initialFragment = null;
    if (!fragment) return;
    if (fragment.kind === 'invalid') {queueMicrotask(() => setView({phase: 'error'})); return;}
    handoff.current = createMailHandoff(fragment.tokens, {location: window.location, fetch: window.fetch.bind(window), replace: url => window.location.replace(url), allowLocalHttp}, setView);
    void handoff.current.start();
    // One-time browser handoff; this never refreshes a session on public navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {if (view && dialog.current && !dialog.current.open) dialog.current.showModal();}, [view]);
  function cancel() {if (handoff.current) handoff.current.cancel(); else window.location.replace('/admin/login');}
  if (!view) return null;
  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby="auth-mail-title" aria-describedby="auth-mail-description" onCancel={event => {event.preventDefault(); if (view.phase !== 'activating') cancel();}}>
    <div className="auth-card"><span className="eyebrow">BEVEILIGDE NSJL-MAILLINK</span><h1 id="auth-mail-title">Jouw beheeraccount.</h1>
      <div id="auth-mail-description" aria-live="polite">
        {view.phase === 'checking' && <p>Je maillink wordt veilig gecontroleerd…</p>}
        {(view.phase === 'confirm' || view.phase === 'activating') && <><p>Deze maillink hoort bij <strong>{view.email}</strong>.</p><p>Ga alleen verder als dit jouw eigen beheeraccount is. Tweestapsverificatie blijft verplicht.</p></>}
        {view.phase === 'error' && <p role="alert">Deze maillink kan niet veilig worden verwerkt. Vraag zo nodig een nieuwe uitnodiging of herstelmail aan.</p>}
        {view.phase === 'logout' && <p role="alert">Er staat al een sessie in deze browser. Log eerst expliciet uit. Daarna controleren we deze maillink opnieuw, voordat je je eigen account bevestigt.</p>}
      </div>
      {(view.phase === 'confirm' || view.phase === 'activating') && <button className="button" type="button" onClick={() => void handoff.current?.confirm()} disabled={view.phase === 'activating'}>{view.phase === 'activating' ? 'Veilig afronden…' : 'Doorgaan met mijn account'}</button>}
      {view.phase === 'logout' && <button className="button" type="button" onClick={() => void handoff.current?.logoutAndRestart()}>Uitloggen en maillink controleren</button>}
      <button className="button secondary" type="button" onClick={cancel} disabled={view.phase === 'activating'}>Terug naar inloggen</button>
    </div>
  </dialog>, document.body);
}
