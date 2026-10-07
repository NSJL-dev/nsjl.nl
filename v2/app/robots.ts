import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{return{rules:process.env.APP_ENV==='production'?{userAgent:'*',allow:'/',disallow:['/admin/','/api/','/auth/']}:{userAgent:'*',disallow:'/'},sitemap:`${process.env.APP_URL||'http://localhost:3000'}/sitemap.xml`};}
