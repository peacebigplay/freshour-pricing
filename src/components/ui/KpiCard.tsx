import Link from 'next/link';

export type KpiPillTone = 'neutral' | 'success' | 'warning' | 'danger';

const PILL_CLASS: Record<KpiPillTone, string> = {
  neutral: 'pill',
  success: 'pill g',
  warning: 'pill a',
  danger: 'pill r',
};

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
    <div className={`k${lead ? ' lead' : ''}${href ? ' tap' : ''}`}>
      <div className="kt">
        {icon && <div className="ic">{icon}</div>}
        {pill && <span className={PILL_CLASS[pillTone]}>{pill}</span>}
      </div>
      <div className="lb">{label}</div>
      <div className="v">{value}</div>
      {caption && <div className="c">{caption}</div>}
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{card}</Link>;
  }
  return card;
}
