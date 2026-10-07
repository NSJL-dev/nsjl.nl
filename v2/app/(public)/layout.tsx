import {SiteHeader,SiteFooter} from '@/components/site-shell';
import './public.css';
export default function PublicLayout({children}:{children:React.ReactNode}){return <div className="public-site"><SiteHeader/>{process.env.DATABASE_MODE!=='postgres'&&<div className="dev-banner">V2 ontwikkelpreview · gecontroleerde bronmomentopname · geen realtime uitslagen</div>}{children}<SiteFooter/></div>;}
