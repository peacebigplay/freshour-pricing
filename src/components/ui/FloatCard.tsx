import Link from 'next/link';

export function FloatCard({
  icon,
  title,
  subtitle,
  actionLabel,
  href,
}: {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <div className="float">
      <div className="ic">{icon}</div>
      <b>{title}</b>
      <span>{subtitle}</span>
      <Link
        href={href}
        style={{
          display: 'block',
          width: '100%',
          background: 'var(--blue)',
          color: '#fff',
          border: 0,
          borderRadius: 9,
          padding: 9,
          fontFamily: 'var(--ff)',
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'center',
          textDecoration: 'none',
        }}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
