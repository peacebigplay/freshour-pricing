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
    <div className="top">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: who ? 0 : 'auto' }}>{actions}</div>
      )}
      {who && (
        <div className="who">
          <span className="av">{who[0]}</span>
          <span>
            <b>{who[1]}</b>
            <span>{who[2]}</span>
          </span>
        </div>
      )}
    </div>
  );
}
