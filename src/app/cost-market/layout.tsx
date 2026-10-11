import { requireRoleOrRedirect } from '@/lib/auth/guard';
import { AppShell } from '@/components/ui/AppShell';

export default async function CostMarketLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(['PRICING', 'ADMIN']);
  return <AppShell user={user}>{children}</AppShell>;
}
