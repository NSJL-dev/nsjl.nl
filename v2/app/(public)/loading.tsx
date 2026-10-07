import {Page} from '@/components/public/ui';
export default function Loading() {
  return <Page><div role="status" aria-live="polite"><span className="pub-sr-only">De pagina wordt geladen…</span><div aria-hidden="true"><div className="pub-skeleton pub-skeleton--title"/><div className="pub-skeleton"/><div className="pub-detail-grid"><div className="pub-skeleton pub-skeleton--card"/><div className="pub-skeleton pub-skeleton--card"/></div></div></div></Page>;
}
