import styles from './charts.module.css';

export interface BarRow {
  label: string;
  value: number;
  displayValue: string;
  color?: string;
}

/** Horizontal bar list — matches V29's `.bars`/`.bar` pattern. */
export function BarRows({ rows, color = 'var(--danger)' }: { rows: BarRow[]; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className={styles.barRows}>
      {rows.map((r, i) => (
        <div key={i} className={styles.barRow}>
          <span className={styles.barName}>{r.label}</span>
          <span className={styles.barTrack}>
            <i style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color ?? color }} />
          </span>
          <span className={styles.barValue} style={{ color: r.color ?? color }}>
            {r.displayValue}
          </span>
        </div>
      ))}
    </div>
  );
}
