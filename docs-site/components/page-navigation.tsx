import Link from 'next/link';
import navConfig from '@/nav.config.json';

const pages = navConfig.groups.flatMap((group) => group.items);

export function PageNavigation({ slug }: { slug: string }) {
  const index = pages.findIndex((page) => page.slug === slug);
  if (index < 0) return null;
  const adjacent = [
    { label: 'Previous', page: pages[index - 1] },
    { label: 'Next', page: pages[index + 1] },
  ];

  return (
    <nav className="ss-page-navigation" aria-label="Page navigation">
      {adjacent.map(({ label, page }) => page ? (
        <Link key={label} href={page.slug ? `/docs/${page.slug}` : '/docs'}
          className="ss-page-navigation-card" data-direction={label.toLowerCase()} rel={label === 'Next' ? 'next' : 'prev'}>
          <span>{label}</span>
          <strong>{page.title}</strong>
        </Link>
      ) : <span key={label} aria-hidden />)}
    </nav>
  );
}
