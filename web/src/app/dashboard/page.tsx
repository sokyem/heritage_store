import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// Legacy founder dashboard route. The studio UI now lives at `/admin/*`.
// Customers visiting `/dashboard` land on the customer dashboard instead.
export default async function LegacyDashboardRedirect() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (role === 'founder' || role === 'admin' || role === 'staff') {
    redirect('/admin');
  }
  redirect('/customer/dashboard');
}
