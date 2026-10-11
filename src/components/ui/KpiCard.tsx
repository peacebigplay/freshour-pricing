import styles from './KpiCard.module.css';

export function KpiCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  caption,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
  caption?: string;
}) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={`${styles.value} tabular`}>{value}</p>
      <div className={styles.footer}>
        {delta && <span className={`${styles.delta} ${styles[deltaTone]}`}>{delta}</span>}
        {caption && <span className={styles.caption}>{caption}</span>}
      </div>
    </div>
  );
}
