import Image from 'next/image';
import {notFound} from 'next/navigation';
import sanitizeHtml from 'sanitize-html';
import {publicMediaUrl} from '@/lib/media';
import {getNewsArticleData} from '@/lib/public-data';
import {Button, Page, SectionHeading} from '@/components/public/ui';
import {dateNL} from '@/components/public/format';
export const dynamic = 'force-dynamic';
export async function generateMetadata({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params, post = (await getNewsArticleData(slug)).news.find(n => n.slug === slug);
  return {title: post?.title || 'Nieuws', description: post?.excerpt, alternates: {canonical: '/nieuws/' + slug}, openGraph: {title: post?.title, description: post?.excerpt, type: 'article', images: [{url: '/img/logo-nsjl-blauw.png'}]}};
}
export default async function NewsArticle({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params, data = await getNewsArticleData(slug), post = data.news.find(n => n.slug === slug);
  if (!post) notFound();
  const media = data.media.find(m => m.id === post.featuredMediaId);
  return <Page narrow><article><SectionHeading as="h1" title={post.title} eyebrow={post.category}/><p className="pub-context-label"><time dateTime={post.publishedAt?.toISOString()}>{dateNL(post.publishedAt, true)}</time></p><p className="pub-intro">{post.excerpt}</p>{media && <Image unoptimized className="pub-article-image" src={publicMediaUrl(media.id)} width={media.width || 1200} height={media.height || 800} sizes="(max-width: 900px) 100vw, 820px" alt={media.altText}/>}<div className="pub-article" dangerouslySetInnerHTML={{__html: sanitizeHtml(post.content ?? '', {allowedTags: ['p', 'br', 'strong', 'em', 'h2', 'h3', 'ul', 'ol', 'li', 'a'], allowedAttributes: {a: ['href', 'title']}, allowedSchemes: ['https', 'mailto']})}}/></article><Button href="/nieuws" secondary>Alle nieuwsberichten</Button></Page>;
}
