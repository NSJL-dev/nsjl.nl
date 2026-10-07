import {redirect} from 'next/navigation';
import {authenticatedClient,requireAdmin} from '@/lib/auth';
import {AdminShell} from '@/components/admin-shell';
export const dynamic='force-dynamic';export const metadata={robots:{index:false,follow:false}};
export default async function AdminLayout({children}:{children:React.ReactNode}){
  const identity=await authenticatedClient().catch(()=>null);if(!identity)redirect('/admin/login');
  const verified=await requireAdmin().catch(()=>null);if(!verified)redirect('/admin/mfa');
  return <AdminShell name={verified.profile.name}>{children}</AdminShell>;
}
