'use client';
import {useRef, useState, type FormEvent, type ReactNode} from 'react';

export type ArchiveConfirmation = {field:'status'|'isActive';name:string};
export function AdminForm({action, children, disabled=false, multipart=false, className='form-grid', confirmation, archiveConfirmation}: {action:string; children:ReactNode; disabled?:boolean; multipart?:boolean; className?:string; confirmation?:string; archiveConfirmation?:ArchiveConfirmation}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const submitting=useRef(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); if(submitting.current||disabled)return;
    submitting.current=true;
    try{
      const body=new FormData(event.currentTarget);
      const archiving=archiveConfirmation&&(archiveConfirmation.field==='status'?body.get('status')==='archived':body.get('isActive')!=='on');
      const message=confirmation||(archiving?`“${archiveConfirmation.name}” archiveren? Het item verdwijnt uit de publieke weergave. Het record, koppelingen, statistieken en afbeeldingen blijven bewaard.`:undefined);
      if(message&&!window.confirm(message))return;
      if(archiving)body.set('confirmedName',archiveConfirmation.name);
      setBusy(true);setError('');
      const response=await fetch(action,{method:'POST',body,credentials:'same-origin'});
      if(response.redirected&&response.ok){const target=new URL(response.url);if(target.origin!==window.location.origin)throw new Error('Onverwachte doorverwijzing.');window.location.assign(target.href);return;}
      const data=await response.json().catch(()=>null);
      throw new Error(typeof data?.error==='string'?data.error:'Opslaan mislukt. Probeer opnieuw; je invoer blijft staan.');
    }catch(cause){setError(cause instanceof Error?cause.message:'De verbinding is onderbroken. Je invoer blijft staan.');}
    finally{submitting.current=false;setBusy(false);}
  }
  return <form action={action} method="post" encType={multipart?'multipart/form-data':undefined} className={className} onSubmit={submit} aria-busy={busy}>
    <fieldset disabled={disabled||busy} className="admin-form-fields">{children}</fieldset>
    {error&&<p className="notice error" role="alert">{error}</p>}
    <span className="admin-form-feedback" role="status" aria-live="polite">{busy?'Bezig met opslaan…':''}</span>
  </form>;
}
