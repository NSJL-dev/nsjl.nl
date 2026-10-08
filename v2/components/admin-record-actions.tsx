'use client';
import {useRef, useState} from 'react';
import {AdminForm} from './admin-form';

type Resource = 'spelers' | 'nieuws' | 'agenda' | 'sponsors' | 'media' | 'wedstrijden';
type Identity = {resource: Resource; id: string; name: string; revision: string};
export function ConfirmedRecordAction({resource, id, name, revision, action = 'delete', label = 'Definitief verwijderen', consequences, disabled = false, expectedMediaId}: Identity & {action?: 'delete' | 'detach'; label?: string; consequences: string; disabled?: boolean; expectedMediaId?: string}) {
  const dialog = useRef<HTMLDialogElement>(null), [typed, setTyped] = useState('');
  const headingId = `${action}-${resource}-${id}-title`, inputId = `${headingId}-name`;
  function close() { dialog.current?.close(); setTyped(''); }
  return <>
    <button type="button" className={action === 'delete' ? 'text-button danger-link' : 'text-button'} disabled={disabled} onClick={() => { setTyped(''); dialog.current?.showModal(); }}>{label}</button>
    <dialog ref={dialog} className="admin-confirm-dialog" aria-labelledby={headingId} onClose={() => setTyped('')}>
      <h2 id={headingId}>{label}</h2><p>Geselecteerd: <strong>{name}</strong></p><p>{consequences}</p>
      <AdminForm action={`/api/admin/${resource}`} typedConfirmation={name}>
        <input type="hidden" name="id" value={id}/><input type="hidden" name="action" value={action}/><input type="hidden" name="expectedRevision" value={revision}/><input type="hidden" name="confirmedName" value={name}/>
        {expectedMediaId && <input type="hidden" name="expectedMediaId" value={expectedMediaId}/>}
        <label htmlFor={inputId}>Typ de naam exact over: <strong>{name}</strong></label>
        <input id={inputId} name="typedName" value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" required aria-describedby={`${headingId}-warning`}/>
        <p id={`${headingId}-warning`} className="muted">{action === 'delete' ? 'Definitief verwijderen kan niet ongedaan worden gemaakt.' : 'Alleen deze afbeeldingskoppeling wordt losgemaakt.'}</p>
        <div className="admin-confirm-buttons"><button type="button" className="secondary" autoFocus onClick={close}>Annuleren</button><button type="submit" className={action === 'delete' ? 'danger' : 'button'} disabled={disabled || typed !== name}>{label}</button></div>
      </AdminForm>
    </dialog>
  </>;
}

export function RecordActions({resource, id, name, revision, archived, mediaId}: Identity & {archived: boolean; mediaId?: string | null}) {
  const confirmation = `“${name}” archiveren? Het item verdwijnt uit de publieke weergave. Het record, koppelingen, statistieken en afbeeldingen blijven bewaard.`;
  const consequences = resource === 'media'
    ? 'De registratie en het originele privébestand worden definitief verwijderd. Dit kan alleen zonder verwijzingen of oude publieke kopie. Andere bestanden blijven bewaard. Een onderbroken verwijdering blijft gearchiveerd en kan veilig worden hervat.'
    : resource === 'spelers'
      ? 'Alleen dit verborgen profiel wordt verwijderd, zonder lidmaatschappen, spelerkoppelingen of statistieken. Afbeeldingen, andere profielen en auditgeschiedenis blijven bewaard.'
      : resource === 'wedstrijden'
        ? 'Alleen deze geannuleerde, handmatige wedstrijd wordt verwijderd. Verwijderen is geblokkeerd bij uitslagen, bronrapporten, correcties of externe koppelingen. Teams, competitiegegevens en historie blijven bewaard.'
        : 'Alleen dit gearchiveerde item wordt definitief verwijderd. Afbeeldingen, andere items en auditgeschiedenis blijven bewaard. Een bestaande publieke pagina kan daarna niet meer worden geopend.';
  return <div className="record-actions">
    <div className="record-actions-buttons">
      {!archived && !['media', 'wedstrijden'].includes(resource) && <AdminForm action={`/api/admin/${resource}`} className="" confirmation={confirmation}>
        <input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="archive"/><input type="hidden" name="expectedRevision" value={revision}/><input type="hidden" name="confirmedName" value={name}/>
        <button type="button" className="text-button" onClick={event => event.currentTarget.form?.requestSubmit()}>Archiveren</button>
      </AdminForm>}
      {mediaId && <ConfirmedRecordAction resource={resource} id={id} name={name} revision={revision} action="detach" expectedMediaId={mediaId} label="Afbeelding losmaken" consequences="Alleen de koppeling met dit item wordt verwijderd. Het mediabestand en koppelingen met andere items blijven bestaan."/>}
    </div>
    <div className="delete-zone"><p className="muted">{archived ? 'Controleer de gevolgen voordat je dit item definitief verwijdert.' : resource === 'wedstrijden' ? 'Annuleer de handmatige wedstrijd eerst. Bronwedstrijden kunnen niet worden verwijderd.' : 'Archiveer dit item eerst. Definitief verwijderen is een aparte actie.'}</p><ConfirmedRecordAction resource={resource} id={id} name={name} revision={revision} consequences={consequences} disabled={!archived}/></div>
  </div>;
}
