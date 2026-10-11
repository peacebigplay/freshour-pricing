import Link from 'next/link';
import styles from './FloatCard.module.css';

export function FloatCard({
  icon,
  title,
  subtitle,
  actionLabel,
  href,
}: {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <div className={styles.float}>
      <div className={styles.icon}>{icon}</div>
      <b>{title}</b>
      <span>{subtitle}</span>
      <Link href={href} className={styles.button}>
        {actionLabel}
      </Link>
    </div>
  );
}
