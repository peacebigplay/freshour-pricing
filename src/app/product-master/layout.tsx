import { requireRoleOrRedirect } from '@/lib/auth/guard';
import { AppShell } from '@/components/ui/AppShell';

export default async function ProductMasterLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(['PRICING', 'ADMIN']);
  return <AppShell user={user}>{children}</AppShell>;
}
