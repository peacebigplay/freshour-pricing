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
    <div className="card">
      {(title || action) && (
        <h3>
          {title}
          {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
        </h3>
      )}
      {children}
    </div>
  );
}
