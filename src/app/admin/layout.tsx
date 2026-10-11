import { requireRoleOrRedirect } from '@/lib/auth/guard';
import { AppShell } from '@/components/ui/AppShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(['ADMIN']);
  return <AppShell user={user}>{children}</AppShell>;
}
