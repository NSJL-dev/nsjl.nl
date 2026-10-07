import {SiteHeader,SiteFooter} from '@/components/site-shell';
export default function PublicLayout({children}:{children:React.ReactNode}){return <><SiteHeader/>{process.env.DATABASE_MODE!=='postgres'&&<div className="dev-banner">V2 ontwikkelpreview · gecontroleerde bronmomentopname · geen realtime uitslagen</div>}{children}<SiteFooter/></>;}
