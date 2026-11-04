import { source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/notebook/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getPageMarkdownUrl } from '@/lib/shared';
import { getPageSourceUrl } from '@/lib/page-source';
import { SiteFooter } from '@/components/site-footer';
import { PageNavigation } from '@/components/page-navigation';
import { MermaidDiagrams } from '@/components/mermaid';
import { MobileToc } from '@/components/mobile-toc';
import { AgentPrompt } from '@/components/landing/agent-prompt';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const sourceUrl = getPageSourceUrl(page.path);
  const actions = (
    <div className="ss-page-actions">
      <MarkdownCopyButton markdownUrl={markdownUrl}>Copy page</MarkdownCopyButton>
      <ViewOptionsPopover
        markdownUrl={markdownUrl}
        githubUrl={sourceUrl}
        aria-label="Page options"
      >
        <span className="sr-only">Page options</span>
      </ViewOptionsPopover>
    </div>
  );

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      breadcrumb={{ enabled: false }}
      tableOfContentPopover={{ enabled: false }}
      footer={{ enabled: false }}
    >
      <div className="ss-mobile-page-bar">
        {actions}
        <MobileToc items={page.data.toc} />
      </div>
      <div className="ss-page-heading">
        <DocsTitle>{page.data.title}</DocsTitle>
        {actions}
      </div>
      <DocsDescription className="mb-0 text-base leading-7 text-fd-foreground">
        {page.data.description}
      </DocsDescription>
      {!params.slug?.length && <AgentPrompt />}
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
        <MermaidDiagrams />
      </DocsBody>
      <div className="ss-page-source">
        <a href={sourceUrl}>Edit this page on GitHub</a>
      </div>
      <PageNavigation slug={page.slugs.join('/')} />
      <SiteFooter />
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      title: `${page.data.title} · SiteScout Docs`,
      description: page.data.description,
      type: 'article',
    },
  };
}
