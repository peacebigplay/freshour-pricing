import type { Role } from '@/lib/domain/rbac';
import styles from './AppShell.module.css';
import { LogoutButton } from './LogoutButton';
import { SidebarNav } from './SidebarNav';

interface NavItem {
  href: string;
  label: string;
  labelTh: string;
}

const MENU: NavItem[] = [
  { href: '/exec', label: 'Executive', labelTh: 'ผู้บริหาร' },
  { href: '/pricing', label: 'Pricing', labelTh: 'ตั้งราคา' },
  { href: '/customers', label: 'Customers', labelTh: 'ลูกค้า' },
  { href: '/sales', label: 'Sales', labelTh: 'ฝ่ายขาย' },
  { href: '/cost-market', label: 'Cost & Market', labelTh: 'ต้นทุน & ตลาด' },
];

const TOOLS: NavItem[] = [
  { href: '/product-master', label: 'Product Master', labelTh: 'ฐานข้อมูลสินค้า' },
  { href: '/summary', label: 'Summary', labelTh: 'สรุปภาพรวม' },
  { href: '/process', label: 'Process', labelTh: 'ขั้นตอนงาน' },
  { href: '/memory', label: 'Memory', labelTh: 'ประวัติ' },
  { href: '/principles', label: 'Principles', labelTh: 'หลักการ' },
  { href: '/margin-guard', label: 'Margin Guard', labelTh: 'การ์ดมาร์จิ้น' },
  { href: '/admin', label: 'Admin', labelTh: 'ผู้ดูแลระบบ' },
];

const ROLE_MENU_ACCESS: Record<Role, Set<string>> = {
  EXECUTIVE: new Set(['/exec', '/customers', '/summary', '/process', '/memory', '/principles']),
  PRICING: new Set([
    '/pricing', '/customers', '/cost-market', '/product-master', '/summary',
    '/process', '/memory', '/principles', '/margin-guard',
  ]),
  SALES: new Set(['/customers', '/sales', '/summary', '/process', '/memory', '/principles']),
  ADMIN: new Set([
    '/product-master', '/summary', '/process', '/memory', '/principles', '/admin',
  ]),
};

export function AppShell({
  user,
  children,
}: {
  user: { name: string; role: Role };
  children: React.ReactNode;
}) {
  const allowed = ROLE_MENU_ACCESS[user.role];
  const menu = MENU.filter((item) => allowed.has(item.href));
  const tools = TOOLS.filter((item) => allowed.has(item.href));

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.mark}>F</span>
          <div>
            <b>Freshour</b>
            <span>ระบบตั้งราคา</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <p className={styles.navLabel}>เมนูหลัก</p>
          <SidebarNav items={menu} />

          {tools.length > 0 && (
            <>
              <p className={styles.navLabel}>เครื่องมือ</p>
              <SidebarNav items={tools} />
            </>
          )}
        </nav>

        <div className={styles.userBox}>
          <div className={styles.userMeta}>
            <b>{user.name}</b>
            <span>{user.role}</span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
