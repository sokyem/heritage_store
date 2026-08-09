import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdminRole } from '@/lib/roles';
import './admin.css';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!email) {
    redirect('/auth/signin?callbackUrl=/admin');
  }

  // Anyone with an admin-tier role (founder, admin, staff, designer,
  // fulfillment, content_editor, support) can enter the workspace; what they
  // see inside is filtered per-permission by AdminShell.
  if (!isAdminRole(role)) {
    redirect('/customer/dashboard');
  }

  return <AdminShell role={role || ''}>{children}</AdminShell>;
}
