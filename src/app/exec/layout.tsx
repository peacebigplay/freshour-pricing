import { requireRoleOrRedirect } from '@/lib/auth/guard';
import { AppShell } from '@/components/ui/AppShell';

export default async function ExecLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(['EXECUTIVE']);
  return <AppShell user={user}>{children}</AppShell>;
}
