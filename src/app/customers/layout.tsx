import { requireRoleOrRedirect } from '@/lib/auth/guard';
import { AppShell } from '@/components/ui/AppShell';

export default async function CustomersLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(['PRICING', 'SALES', 'EXECUTIVE']);
  return <AppShell user={user}>{children}</AppShell>;
}
