import styles from './PageHeader.module.css';

export function PageHeader({
  title,
  subtitle,
  actions,
  who,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** V29's top-right "who" pill: [initial, name, caption]. */
  who?: [string, string, string];
}) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      <div className={styles.right}>
        {actions && <div className={styles.actions}>{actions}</div>}
        {who && (
          <div className={styles.who}>
            <span className={styles.avatar}>{who[0]}</span>
            <span>
              <b>{who[1]}</b>
              <em>{who[2]}</em>
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
