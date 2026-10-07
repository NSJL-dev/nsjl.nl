import Link from 'next/link';
import type {ReactNode} from 'react';

export function Button({href, children, secondary = false}: {href: string; children: ReactNode; secondary?: boolean}) {
  return <Link className={`pub-button${secondary ? ' pub-button--secondary' : ''}`} href={href}>{children}</Link>;
}
export function SectionHeading({title, intro, eyebrow, href, linkLabel = 'Bekijk alles', as = 'h2'}: {title: string; intro?: string; eyebrow?: string; href?: string; linkLabel?: string; as?: 'h1' | 'h2'}) {
  const Heading = as;
  return <div className="pub-section-heading"><div>{eyebrow && <p className="pub-eyebrow">{eyebrow}</p>}<Heading>{title}</Heading>{intro && <p className="pub-intro">{intro}</p>}</div>{href && <Link className="pub-text-link" href={href}>{linkLabel} <span aria-hidden="true">→</span></Link>}</div>;
}
export function EmptyState({title, children, compact = false}: {title: string; children?: ReactNode; compact?: boolean}) {
  return <div className={`pub-empty${compact ? ' pub-empty--compact' : ''}`}><span className="pub-empty-mark" aria-hidden="true">🎯</span><div><p className="pub-empty-title">{title}</p>{children && <div className="pub-empty-copy">{children}</div>}</div></div>;
}
export function Metric({label, value, detail}: {label: string; value: ReactNode; detail?: string}) {
  return <div className="pub-metric"><dt>{label}</dt><dd>{value}</dd>{detail && <span>{detail}</span>}</div>;
}
export function Page({children, narrow = false}: {children: ReactNode; narrow?: boolean}) {
  return <main id="main" className={`pub-page pub-container${narrow ? ' pub-container--narrow' : ''}`} tabIndex={-1}>{children}</main>;
}
