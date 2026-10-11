import styles from './charts.module.css';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ slices, centerLabel, centerValue }: { slices: DonutSlice[]; centerLabel?: string; centerValue?: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={styles.donutRow}>
      <div className={styles.donutWrap}>
        <svg viewBox="0 0 100 100" width={104} height={104}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border-soft)" strokeWidth="12" />
          {slices.map((s, i) => {
            const frac = s.value / total;
            const dash = frac * circumference;
            const circle = (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return circle;
          })}
        </svg>
        {(centerLabel || centerValue) && (
          <div className={styles.donutMid}>
            {centerValue && <b>{centerValue}</b>}
            {centerLabel && <span>{centerLabel}</span>}
          </div>
        )}
      </div>
      <ul className={styles.donutLegend}>
        {slices.map((s, i) => (
          <li key={i}>
            <b style={{ background: s.color }} />
            <span>{s.label}</span>
            <i>{((s.value / total) * 100).toFixed(0)}%</i>
          </li>
        ))}
      </ul>
    </div>
  );
}
