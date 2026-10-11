import { requireRoleOrRedirect } from '@/lib/auth/guard';
import { AppShell } from '@/components/ui/AppShell';

export default async function MarginGuardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(['PRICING']);
  return <AppShell user={user}>{children}</AppShell>;
}
