'use client';
import {useState, type FormEvent, type ReactNode} from 'react';

export function AdminForm({action, children, disabled=false, multipart=false, className='form-grid'}: {action:string; children:ReactNode; disabled?:boolean; multipart?:boolean; className?:string}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); if(busy||disabled)return;
    const form=event.currentTarget,body=new FormData(form);setBusy(true);setError('');
    try{
      const response=await fetch(action,{method:'POST',body,credentials:'same-origin'});
      if(response.redirected&&response.ok){const target=new URL(response.url);if(target.origin!==window.location.origin)throw new Error('Onverwachte doorverwijzing.');window.location.assign(target.href);return;}
      const data=await response.json().catch(()=>null);
      throw new Error(typeof data?.error==='string'?data.error:'Opslaan mislukt. Probeer opnieuw; je invoer blijft staan.');
    }catch(cause){setError(cause instanceof Error?cause.message:'De verbinding is onderbroken. Je invoer blijft staan.');}
    finally{setBusy(false);}
  }
  return <form action={action} method="post" encType={multipart?'multipart/form-data':undefined} className={className} onSubmit={submit} aria-busy={busy}>
    <fieldset disabled={disabled||busy} className="admin-form-fields">{children}</fieldset>
    {error&&<p className="notice error" role="alert">{error}</p>}
    <span className="admin-form-feedback" role="status" aria-live="polite">{busy?'Bezig met opslaan…':''}</span>
  </form>;
}
