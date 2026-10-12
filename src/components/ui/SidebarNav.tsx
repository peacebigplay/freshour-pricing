'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  labelTh: string;
  sub?: string;
  icon: string;
  badge?: string;
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {items.map((item) => {
        const on = pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={on ? 'on' : undefined}>
            <i>{item.icon}</i>
            <span className="txt">
              {item.labelTh}
              {item.sub && <em>{item.sub}</em>}
            </span>
            {item.badge && <span className="bdg">{item.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
