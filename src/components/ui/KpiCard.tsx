import Link from 'next/link';
import styles from './KpiCard.module.css';

export type KpiPillTone = 'neutral' | 'success' | 'warning' | 'danger';

export function KpiCard({
  icon,
  label,
  value,
  caption,
  pill,
  pillTone = 'neutral',
  lead = false,
  href,
}: {
  icon?: string;
  label: string;
  value: string;
  caption?: string;
  pill?: string;
  pillTone?: KpiPillTone;
  lead?: boolean;
  href?: string;
}) {
  const card = (
    <div className={`${styles.card} ${lead ? styles.lead : ''} ${href ? styles.tap : ''}`}>
      <div className={styles.top}>
        {icon && <span className={styles.icon}>{icon}</span>}
        {pill && <span className={`${styles.pill} ${styles[pillTone]}`}>{pill}</span>}
      </div>
      <p className={styles.label}>{label}</p>
      <p className={`${styles.value} tabular`}>{value}</p>
      {caption && <p className={styles.caption}>{caption}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={styles.link}>
        {card}
      </Link>
    );
  }
  return card;
}
