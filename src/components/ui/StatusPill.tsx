import styles from './StatusPill.module.css';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

export function StatusPill({ tone = 'neutral', children }: { tone?: StatusTone; children: React.ReactNode }) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{children}</span>;
}
