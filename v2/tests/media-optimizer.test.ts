import {describe,expect,it} from 'vitest';
import type {IncomingMessage} from 'node:http';
import {ImageOptimizerCache} from 'next/dist/server/image-optimizer';
import type {NextConfigRuntime} from 'next/dist/server/config-shared';
import {imageConfigDefault} from 'next/dist/shared/lib/image-config';
import config from '../next.config';

// The real parameter validator reads only images and basePath; it does not
// require a booted Next server or unrelated normalized runtime configuration.
const nextConfig={basePath:config.basePath??'',images:{...imageConfigDefault,...config.images}} satisfies Pick<NextConfigRuntime,'images'|'basePath'>;
function validate(url:string){return ImageOptimizerCache.validateParams({headers:{accept:'image/webp'}} as IncomingMessage,{url,w:'640',q:'75'},nextConfig as NextConfigRuntime,false);}
describe('Next optimizer cannot turn controlled media into an independently cached URL',()=>{
  it.each([
    '/api/media/fixture','/api/admin/media/fixture','/api/media/fixture?cacheNonce=fixture',
    '/img/../api/media/fixture','/img/%2e%2e/api/media/fixture',
    'https://fixture.supabase.co/storage/v1/object/public/published-media/fixture.webp',
    'https://fixture.supabase.co/storage/v1/object/sign/private-media/fixture.webp',
  ])('rejects the source %s before image cache lookup',url=>{expect(validate(url)).toHaveProperty('errorMessage');});
  it('preserves optimization of the original static NSJL logo',()=>{expect(validate('/img/logo-nsjl-blauw.png')).not.toHaveProperty('errorMessage');});
});
