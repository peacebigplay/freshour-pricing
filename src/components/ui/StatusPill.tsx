export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'pill2 n',
  success: 'pill2 g',
  warning: 'pill2 a',
  danger: 'pill2 r',
  primary: 'pill2 b',
};

export function StatusPill({ tone = 'neutral', children }: { tone?: StatusTone; children: React.ReactNode }) {
  return <span className={TONE_CLASS[tone]}>{children}</span>;
}
