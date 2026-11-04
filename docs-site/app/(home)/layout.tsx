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
