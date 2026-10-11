'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './AppShell.module.css';

interface NavItem {
  href: string;
  labelTh: string;
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={pathname.startsWith(item.href) ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
        >
          {item.labelTh}
        </Link>
      ))}
    </>
  );
}
