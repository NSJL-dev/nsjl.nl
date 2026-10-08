'use client';
import {AdminForm} from './admin-form';

export function RecordActions({resource, id, name, revision, archived}: {resource: 'spelers' | 'nieuws' | 'agenda' | 'sponsors'; id: string; name: string; revision: string; archived: boolean}) {
  const action = archived && resource === 'spelers' ? 'delete' : 'archive';
  if (archived && resource !== 'spelers') return <p className="muted">Gearchiveerd. Het item en eventuele afbeeldingen blijven bewaard.</p>;
  const deleting = action === 'delete';
  const confirmation = deleting
    ? `“${name}” definitief verwijderen? Dit kan niet worden hersteld. De actie wordt geweigerd als er lidmaatschappen, spelerkoppelingen of statistieken bestaan. Afbeeldingen blijven bewaard.`
    : `“${name}” archiveren? Het item verdwijnt uit de publieke weergave. Het record, koppelingen, statistieken en afbeeldingen blijven bewaard.`;
  return <div>
    {deleting && <p className="muted">Definitief verwijderen kan alleen voor een verborgen profiel zonder lidmaatschappen, spelerkoppelingen of statistieken.</p>}
    <AdminForm action={`/api/admin/${resource}`} className="" confirmation={confirmation}>
      <input type="hidden" name="id" value={id}/>
      <input type="hidden" name="action" value={action}/>
      <input type="hidden" name="expectedRevision" value={revision}/>
      <input type="hidden" name="confirmedName" value={name}/>
      {/* Without JavaScript this button cannot submit without confirmation. */}
      <button type="button" className={`text-button${deleting ? ' danger-link' : ''}`} onClick={event => event.currentTarget.form?.requestSubmit()}>{deleting ? 'Definitief verwijderen' : 'Archiveren'}</button>
    </AdminForm>
  </div>;
}
