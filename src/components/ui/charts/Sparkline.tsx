import styles from './charts.module.css';

export interface SparklinePoint {
  label: string;
  value: number;
}

/** Simple SVG line chart with value labels — matches V29's `.ex-spark`/`sparkline()` pattern. */
export function Sparkline({ points, lineColor = 'var(--primary)' }: { points: SparklinePoint[]; lineColor?: string }) {
  if (points.length === 0) return null;
  const w = 640;
  const h = 180;
  const pl = 8;
  const pr = 8;
  const pt = 24;
  const pb = 24;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;

  const x = (i: number) => pl + ((w - pl - pr) * (points.length === 1 ? 0.5 : i / (points.length - 1)));
  const y = (v: number) => pt + ((hi - v) / (hi - lo)) * (h - pt - pb);

  const pts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');

  return (
    <svg className={styles.sparkSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <polyline fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round" points={pts} />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r={4}
          fill={i === points.length - 1 ? 'var(--danger)' : lineColor}
          stroke="#fff"
          strokeWidth={1.5}
        />
      ))}
      {points.map((p, i) => (
        <text key={`l${i}`} className={styles.sparkLabel} x={x(i)} y={h - 6} textAnchor="middle">
          {p.label}
        </text>
      ))}
    </svg>
  );
}
