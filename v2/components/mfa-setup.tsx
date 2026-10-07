'use client';
import {useState} from 'react';
import Image from 'next/image';
import {AdminForm} from './admin-form';
export function MfaSetup({next=''}:{next?:string}){
  const [factor,setFactor]=useState<{id:string;qrCode:string;secret:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function enroll(){setBusy(true);setError('');try{const r=await fetch('/api/auth/mfa/enroll',{method:'POST'}),data=await r.json();if(!r.ok)throw new Error(data.error);setFactor(data);}catch(e){setError(e instanceof Error?e.message:'Instellen mislukt.');}finally{setBusy(false);}}
  return <>{error&&<p role="alert" className="notice error">{error}</p>}{!factor?<button className="button" type="button" disabled={busy} onClick={enroll}>{busy?'Even geduld…':'Authenticator instellen'}</button>:<><Image className="qr" src={factor.qrCode.startsWith('data:')?factor.qrCode:`data:image/svg+xml;base64,${btoa(factor.qrCode)}`} unoptimized alt="Scan deze QR-code in je authenticator-app" width={220} height={220}/><details><summary>Handmatige sleutel tonen</summary><code className="secret">{factor.secret}</code></details><AdminForm action="/api/auth/mfa"><input type="hidden" name="next" value={next}/><input type="hidden" name="factorId" value={factor.id}/><label htmlFor="new-code">Code uit je app</label><input id="new-code" name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required maxLength={6}/><button className="button">Activeren en doorgaan</button></AdminForm></>}</>;
}
