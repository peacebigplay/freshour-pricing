import type { StatusTone } from './StatusPill';

const TONE_STYLE: Record<'warning' | 'danger' | 'success' | 'neutral', { bg: string; border: string; accent: string }> = {
  warning: { bg: 'var(--amber-l)', border: 'var(--amber-b)', accent: 'var(--amber)' },
  danger: { bg: 'var(--red-l)', border: 'var(--red-b)', accent: 'var(--red)' },
  success: { bg: 'var(--green-l)', border: 'var(--green-b)', accent: 'var(--green)' },
  neutral: { bg: 'var(--line-2)', border: 'var(--line)', accent: 'var(--tx-2)' },
};

export function AlertCard({
  tone = 'warning',
  title,
  description,
  action,
}: {
  tone?: Extract<StatusTone, 'warning' | 'danger' | 'success' | 'neutral'>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const t = TONE_STYLE[tone];
  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderLeft: `4px solid ${t.accent}`,
        borderRadius: 'var(--r2)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: t.accent }}>{title}</p>
        {description && <p style={{ fontSize: 11.5, color: 'var(--tx-2)', marginTop: 3 }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}
