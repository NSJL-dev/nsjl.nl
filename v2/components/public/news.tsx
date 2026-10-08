import Image from 'next/image';
import Link from 'next/link';
import type {PublicData} from '@/lib/public-data';
import {publicMediaUrl} from '@/lib/media';
import {dateNL} from './format';
import {EmptyState} from './ui';

export function NewsCards({data, limit}: {data: Pick<PublicData, 'news' | 'media'>; limit?: number}) {
  const news = limit ? data.news.slice(0, limit) : data.news;
  if (!news.length) return <EmptyState title="Even geen nieuws. Wel gezelligheid."><p>Nieuwe berichten verschijnen hier zodra ze gepubliceerd zijn.</p></EmptyState>;
  return <div className="pub-news-grid">{news.map(post => {
    const media = data.media.find(m => m.id === post.featuredMediaId), category = post.category.toLowerCase();
    const mark = category === 'wedstrijdverslag' ? '🏆' : category === 'statistieken' ? '🎯' : category === 'aankondiging' ? '📢' : '📰';
    return <Link className="pub-news-card" href={`/nieuws/${post.slug}`} key={post.id}><div className="pub-news-image">{media ? <Image unoptimized src={publicMediaUrl(media.id)} alt={media.altText} width={720} height={400} sizes="(max-width: 660px) 100vw, (max-width: 900px) 50vw, 400px"/> : <span aria-hidden="true">{mark}</span>}</div><div className="pub-news-body"><span className="pub-category">{post.category}</span><h3>{post.title}</h3><p>{post.excerpt}</p><div className="pub-news-meta"><time dateTime={post.publishedAt?.toISOString()}>{dateNL(post.publishedAt, true)}</time><span className="pub-text-link">Lees meer <span aria-hidden="true">→</span></span></div></div></Link>;
  })}</div>;
}
