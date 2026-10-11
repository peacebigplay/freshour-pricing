import styles from './charts.module.css';

export interface Column {
  label: string;
  value: number;
  displayValue: string;
}

/** Vertical bar chart — matches V29's `.hist`/`.hb` monthly-revenue pattern. */
export function ColumnChart({ columns, color = 'var(--primary)' }: { columns: Column[]; color?: string }) {
  const max = Math.max(...columns.map((c) => c.value), 1);
  return (
    <div className={styles.hist}>
      {columns.map((c, i) => (
        <div key={i} className={styles.histCol}>
          <span className={styles.histValue}>{c.displayValue}</span>
          <div className={styles.histBar} style={{ height: `${Math.max(3, (c.value / max) * 100)}px`, background: color }} />
          <span className={styles.histLabel}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}
