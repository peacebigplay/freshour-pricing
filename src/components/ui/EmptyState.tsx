export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="err" style={{ textAlign: 'center' }}>
      <b style={{ display: 'block', color: 'var(--tx-2)', fontWeight: 600, marginBottom: description ? 4 : 0 }}>{title}</b>
      {description && <span>{description}</span>}
    </div>
  );
}
