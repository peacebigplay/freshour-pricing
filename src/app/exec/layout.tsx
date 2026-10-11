import { requireRoleOrRedirect } from '@/lib/auth/guard';
import { AppShell } from '@/components/ui/AppShell';
import { FloatCard } from '@/components/ui/FloatCard';
import { getAttentionQueue } from '@/lib/queries/executive';

export default async function ExecLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(['EXECUTIVE']);
  const attention = await getAttentionQueue();

  return (
    <AppShell
      user={user}
      floatCard={
        <FloatCard
          icon="⚡"
          title="Executive actions"
          subtitle={attention.length > 0 ? `มี ${attention.length} เรื่องรอตัดสินใจ` : 'ดูสิ่งที่ต้องจัดการก่อน'}
          actionLabel="เปิด Attention Queue"
          href="/exec"
        />
      }
    >
      {children}
    </AppShell>
  );
}
