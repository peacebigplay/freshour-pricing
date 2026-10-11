import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import tableStyles from '@/components/ui/table.module.css';
import { CreateUserForm } from './CreateUserForm';

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <>
      <PageHeader title="Users" subtitle="การจัดการผู้ใช้งานและสิทธิ์" />

      <Card title="เพิ่มผู้ใช้งานใหม่">
        <CreateUserForm />
      </Card>

      <div style={{ height: 20 }} />

      <Card title="ผู้ใช้งานทั้งหมด">
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>อีเมล</th>
                <th>สิทธิ์</th>
                <th>สถานะ</th>
                <th>เข้าสู่ระบบล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <StatusPill tone={u.active ? 'success' : 'neutral'}>{u.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</StatusPill>
                  </td>
                  <td>{u.lastLoginAt?.toLocaleString('th-TH') ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
