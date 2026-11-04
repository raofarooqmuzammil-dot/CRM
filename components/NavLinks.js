'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Top bar links. The page you are on is highlighted.
export default function NavLinks({ links }) {
  const path = usePathname() || '';
  return (
    <nav>
      {links.map(([href, label]) => (
        <Link key={href} href={href} className={path === href || path.startsWith(href + '/') ? 'active' : ''}>{label}</Link>
      ))}
    </nav>
  );
}
