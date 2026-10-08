import 'server-only';
import {NextResponse} from 'next/server';
import {AccessError} from './security';

export const MEDIA_RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Vary': 'Cookie',
};

export function mediaResponse(bytes:Uint8Array){
  return new NextResponse(new Uint8Array(bytes),{headers:{...MEDIA_RESPONSE_HEADERS,'Content-Type':'image/webp','Content-Length':String(bytes.byteLength),'Content-Disposition':'inline'}});
}
export function mediaErrorResponse(error:unknown){
  return NextResponse.json({error:error instanceof AccessError?error.message:'Afbeelding niet beschikbaar.'},{status:error instanceof AccessError?error.status:500,headers:MEDIA_RESPONSE_HEADERS});
}
