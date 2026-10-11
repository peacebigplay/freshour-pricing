import type { Role } from '@/lib/domain/rbac';
import styles from './AppShell.module.css';
import { LogoutButton } from './LogoutButton';
import { SidebarNav } from './SidebarNav';

interface NavItem {
  href: string;
  label: string;
  labelTh: string;
  icon: string;
}

const MENU: NavItem[] = [
  { href: '/exec', label: 'Executive', labelTh: 'ผู้บริหาร', icon: '🏠' },
  { href: '/pricing', label: 'Pricing', labelTh: 'ตั้งราคา', icon: '🧮' },
  { href: '/customers', label: 'Customers', labelTh: 'ลูกค้า', icon: '👥' },
  { href: '/sales', label: 'Sales', labelTh: 'ฝ่ายขาย', icon: '📊' },
  { href: '/cost-market', label: 'Cost & Market', labelTh: 'ต้นทุน & ตลาด', icon: '📦' },
];

const TOOLS: NavItem[] = [
  { href: '/pricing/requests', label: 'Price Requests', labelTh: 'คำขอปรับราคา', icon: '📨' },
  { href: '/product-master', label: 'Product Master', labelTh: 'ฐานข้อมูลสินค้า', icon: '🧩' },
  { href: '/summary', label: 'Summary', labelTh: 'สรุปภาพรวม', icon: '🧠' },
  { href: '/process', label: 'Process', labelTh: 'ขั้นตอนงาน', icon: '🛤️' },
  { href: '/memory', label: 'Memory', labelTh: 'ประวัติ', icon: '🗂️' },
  { href: '/principles', label: 'Principles', labelTh: 'หลักการ', icon: '📜' },
  { href: '/margin-guard', label: 'Margin Guard', labelTh: 'การ์ดมาร์จิ้น', icon: '⚙️' },
  { href: '/admin', label: 'Admin', labelTh: 'ผู้ดูแลระบบ', icon: '🛠️' },
];

const ROLE_MENU_ACCESS: Record<Role, Set<string>> = {
  EXECUTIVE: new Set(['/exec', '/customers', '/summary', '/process', '/memory', '/principles']),
  PRICING: new Set([
    '/pricing', '/customers', '/cost-market', '/product-master', '/summary',
    '/process', '/memory', '/principles', '/margin-guard', '/pricing/requests',
  ]),
  SALES: new Set(['/customers', '/sales', '/summary', '/process', '/memory', '/principles']),
  ADMIN: new Set([
    '/product-master', '/summary', '/process', '/memory', '/principles', '/admin',
  ]),
};

export function AppShell({
  user,
  floatCard,
  children,
}: {
  user: { name: string; role: Role };
  /** Optional sidebar CTA box, matching V29's `.float` pattern (e.g. "N tasks need attention"). */
  floatCard?: React.ReactNode;
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

        {floatCard && <div className={styles.floatSlot}>{floatCard}</div>}

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
