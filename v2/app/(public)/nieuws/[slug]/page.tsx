import Image from 'next/image';
import {publicMediaUrl} from '@/lib/media';
import {notFound} from 'next/navigation';
import {getSiteData} from '@/lib/queries';
import {SectionHead,dateNL} from '@/components/public-data-ui';
import sanitizeHtml from 'sanitize-html';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const slug=(await params).slug,n=(await getSiteData()).news.find(n=>n.slug===slug);return{title:n?.title||'Nieuws',description:n?.excerpt,alternates:{canonical:`/nieuws/${slug}`}};}
export default async function News({params}:{params:Promise<{slug:string}>}){const slug=(await params).slug,data=await getSiteData(),n=data.news.find(n=>n.slug===slug),media=data.media.find(m=>m.id===n?.featuredMediaId);if(!n)notFound();return <main className="wrap page-content narrow" id="main"><article><SectionHead eyebrow={`${n.category} · ${dateNL(n.publishedAt,true)}`} as="h1" title={n.title}/><p className="section-intro">{n.excerpt}</p>{media&&<Image className="article-image" src={publicMediaUrl(media.storagePath)} width={media.width??1200} height={media.height??800} alt={media.altText}/>}<div className="article-content" dangerouslySetInnerHTML={{__html:sanitizeHtml(n.content,{allowedTags:['p','br','strong','em','h2','h3','ul','ol','li','a'],allowedAttributes:{a:['href','title']},allowedSchemes:['https','mailto']})}}/></article></main>;}
