import Image from 'next/image';
import Link from 'next/link';
import {PublicNavigation} from './navigation';

export function PublicHeader() {
  return <header className="pub-header"><div className="pub-container pub-header-inner"><Link className="pub-logo" href="/" aria-label="NSJL, naar home"><Image src="/img/logo-nsjl-blauw.png" width={50} height={50} alt="No Skill Just Luck" priority/></Link><PublicNavigation/></div></header>;
}
