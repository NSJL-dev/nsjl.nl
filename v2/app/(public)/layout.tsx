import type {Metadata} from 'next';
import {PublicHeader} from '@/components/public/header';
import {PublicFooter} from '@/components/public/footer';
import './public.css';
export const metadata: Metadata = {openGraph: {title: 'NSJL — No Skill Just Luck', description: 'Waar geluk harder werkt dan training.', locale: 'nl_NL', type: 'website', images: [{url: '/img/logo-nsjl-blauw.png', alt: 'No Skill Just Luck'}]}};
export default function PublicLayout({children}: {children: React.ReactNode}) {
  return <div className="public-site"><PublicHeader/>{children}<PublicFooter/></div>;
}
