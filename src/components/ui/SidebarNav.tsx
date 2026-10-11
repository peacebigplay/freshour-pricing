'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './AppShell.module.css';

interface NavItem {
  href: string;
  labelTh: string;
  icon: string;
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
          <span className={styles.navIcon}>{item.icon}</span>
          <span className={styles.navTxt}>{item.labelTh}</span>
        </Link>
      ))}
    </>
  );
}
