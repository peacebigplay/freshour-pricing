import styles from './Card.module.css';

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.card}>
      {(title || action) && (
        <div className={styles.head}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
