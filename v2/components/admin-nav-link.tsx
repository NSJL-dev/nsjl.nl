'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export function AdminNavLink({href, children}: {href: string; children: React.ReactNode}) {
  const pathname = usePathname(), active = pathname === href;
  return <Link href={href} aria-current={active ? 'page' : undefined}>{children}</Link>;
}
