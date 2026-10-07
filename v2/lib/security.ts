import { timingSafeEqual, createHash } from 'node:crypto';
export class AccessError extends Error{constructor(public status:number,message:string){super(message);}}
export function assertOrigin(origin:string|null,appUrl:string){if(!origin||new URL(origin).origin!==new URL(appUrl).origin)throw new AccessError(403,'Ongeldige aanvraagherkomst');}
export function secretMatches(actual:string|null,expected:string|undefined){
  if(!expected||expected.length<32||!actual)return false;
  const a=Buffer.from(actual),b=Buffer.from(`Bearer ${expected}`);return a.length===b.length&&timingSafeEqual(a,b);
}
export function rateLimitKey(kind:string,identity:string){return `${kind}:${createHash('sha256').update(identity).digest('hex')}`;}
export function assertAdminIdentity(user:{id:string}|null,profile:{id:string;role:string;isActive:boolean}|null,aal:string){
  if(!user||!profile||profile.id!==user.id||!profile.isActive||profile.role!=='admin')throw new AccessError(403,'Beheerderstoegang vereist');
  if(aal!=='aal2')throw new AccessError(403,'Tweestapsverificatie vereist');
}
