import { requireRoleOrRedirect } from '@/lib/auth/guard';
import { AppShell } from '@/components/ui/AppShell';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(['SALES']);
  return <AppShell user={user}>{children}</AppShell>;
}
