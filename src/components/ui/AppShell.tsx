import Link from 'next/link';
import type { Role } from '@/lib/domain/rbac';
import { LogoutButton } from './LogoutButton';
import { SidebarNav, type NavItem } from './SidebarNav';

const MENU: NavItem[] = [
  { href: '/exec', labelTh: 'ผู้บริหาร', sub: 'ตัดสินใจ', icon: '🏠' },
  { href: '/pricing', labelTh: 'ตั้งราคา', sub: 'พุธ · ใบละเจ้า', icon: '🧮' },
  { href: '/customers', labelTh: 'ลูกค้า', sub: 'สัญญา + Margin Guard', icon: '👥' },
  { href: '/sales', labelTh: 'Sales', sub: 'ประกาศราคา · ต่อรอง · ปิดการขาย', icon: '📊' },
  { href: '/cost-market', labelTh: 'รับทุน & ตลาด', sub: 'อังคาร · ทุน + ราคาตลาด', icon: '📦' },
];

const TOOLS: NavItem[] = [
  { href: '/pricing/requests', labelTh: 'คำขอปรับราคา', sub: 'เจรจาราคาสัญญา', icon: '📨' },
  { href: '/summary', labelTh: 'สรุป', sub: 'อยู่ตรงไหน ไปไหนต่อ', icon: '🧠' },
  { href: '/process', labelTh: 'เส้นทาง', sub: 'ตันสถานีไหน', icon: '🛤️' },
  { href: '/memory', labelTh: 'ความจำ', sub: 'ข้อมูลทุกอย่าง', icon: '🗂️' },
  { href: '/principles', labelTh: 'หลักการ', sub: 'กฎที่ระบบใช้จริง', icon: '📜' },
  { href: '/margin-guard', labelTh: 'ตั้งค่า Margin Guard', sub: 'Target รายหมวด + SKU override', icon: '⚙️' },
  { href: '/product-master', labelTh: 'Product Master', sub: 'SKU · Mapping · Alias', icon: '🧩' },
  { href: '/admin', labelTh: 'Admin', sub: 'ระบบ · สิทธิ์ · Audit', icon: '🛠️' },
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
  /** V29's sidebar CTA box (`.float`) — e.g. "N tasks need attention". */
  floatCard?: React.ReactNode;
  children: React.ReactNode;
}) {
  const allowed = ROLE_MENU_ACCESS[user.role];
  const menu = MENU.filter((item) => allowed.has(item.href));
  const tools = TOOLS.filter((item) => allowed.has(item.href));

  return (
    <div className="app">
      <aside className="side">
        <Link className="brand" href="/">
          <span className="mk">F</span>
          <span>
            <b>Freshour</b>
            <span>{user.name} · {user.role}</span>
          </span>
        </Link>

        <div className="navs">
          <div className="lb">MENU</div>
          <SidebarNav items={menu} />

          {tools.length > 0 && (
            <>
              <div className="lb">TOOLS</div>
              <SidebarNav items={tools} />
            </>
          )}
        </div>

        {floatCard}

        <LogoutButton />
      </aside>

      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}
