import styles from './AlertCard.module.css';
import type { StatusTone } from './StatusPill';

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
  return (
    <div className={`${styles.card} ${styles[tone]}`}>
      <div>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action}
    </div>
  );
}
