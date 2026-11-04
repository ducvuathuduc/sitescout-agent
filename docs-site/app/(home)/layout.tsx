import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from '@/lib/layout.shared';
import { SiteHeader } from '@/components/site-header';
import { SidebarSearch } from '@/components/sidebar-search';
import { SidebarSeparator } from '@/components/sidebar-separator';

export default function Layout({ children }: LayoutProps<'/'>) {
  const options = baseOptions();

  return (
    <DocsLayout
      tree={source.getPageTree()}
      tabMode="sidebar"
      tabs={false}
      {...options}
      nav={{ ...options.nav, mode: 'top' }}
      slots={{ header: SiteHeader }}
      containerProps={{
        // The landing page needs the full main column: the notebook grid's
        // outer `1fr` gutters otherwise take a third of the width.
        style: { gridTemplateColumns: '0 var(--fd-sidebar-col) minmax(0, 1fr) 0 0' },
      }}
      sidebar={{
        collapsible: false,
        banner: <SidebarSearch />,
        components: {
          Separator: SidebarSeparator,
        },
      }}
    >
      {children}
    </DocsLayout>
  );
}
