import { requireRoleOrRedirect } from '@/lib/auth/guard';
import { AppShell } from '@/components/ui/AppShell';

export default async function MemoryLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(['EXECUTIVE', 'PRICING', 'SALES', 'ADMIN']);
  return <AppShell user={user}>{children}</AppShell>;
}
