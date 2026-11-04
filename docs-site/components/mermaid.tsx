'use client';

import { useEffect, useRef } from 'react';

type MermaidApi = (typeof import('mermaid'))['default'];

/**
 * Mermaid fences are authored in plain `.md` files, so they are not converted to
 * an MDX component at build time. We upgrade them in the browser instead:
 * the highlighted source stays visible until the diagram is ready.
 */

const DIAGRAM_START =
  /^\s*(?:%%\{[\s\S]*?\}%%\s*)?(?:graph\s+(?:TD|TB|BT|RL|LR)|flowchart\s+(?:TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie(?:\s|$)|quadrantChart|requirementDiagram|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|mindmap|timeline|zenuml|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta|radar-beta|treemap)/;

const THEMES = {
  light: {
    background: '#ffffff',
    primaryColor: '#fafafa',
    primaryTextColor: '#171717',
    primaryBorderColor: '#e5e5e5',
    secondaryColor: '#f2f2f2',
    tertiaryColor: '#ffffff',
    lineColor: '#8f8f8f',
    textColor: '#171717',
    mainBkg: '#fafafa',
    nodeBorder: '#e5e5e5',
    clusterBkg: '#fafafa',
    clusterBorder: '#ebebeb',
    titleColor: '#171717',
    edgeLabelBackground: '#ffffff',
    noteBkgColor: '#fafafa',
    noteBorderColor: '#ebebeb',
    noteTextColor: '#171717',
    actorBkg: '#fafafa',
    actorBorder: '#e5e5e5',
    actorTextColor: '#171717',
    signalColor: '#8f8f8f',
    signalTextColor: '#171717',
    labelBoxBkgColor: '#f2f2f2',
    labelBoxBorderColor: '#e5e5e5',
    labelTextColor: '#171717',
    loopTextColor: '#171717',
    sequenceNumberColor: '#ffffff',
    sectionBkgColor: '#fafafa',
    altSectionBkgColor: '#ffffff',
    gridColor: '#ebebeb',
  },
  dark: {
    background: '#0a0a0a',
    primaryColor: '#141414',
    primaryTextColor: '#ededed',
    primaryBorderColor: '#333333',
    secondaryColor: '#1f1f1f',
    tertiaryColor: '#161616',
    lineColor: '#6b6b6b',
    textColor: '#ededed',
    mainBkg: '#141414',
    nodeBorder: '#333333',
    clusterBkg: '#111111',
    clusterBorder: '#2e2e2e',
    titleColor: '#ededed',
    edgeLabelBackground: '#0a0a0a',
    noteBkgColor: '#161616',
    noteBorderColor: '#2e2e2e',
    noteTextColor: '#ededed',
    actorBkg: '#141414',
    actorBorder: '#333333',
    actorTextColor: '#ededed',
    signalColor: '#6b6b6b',
    signalTextColor: '#ededed',
    labelBoxBkgColor: '#1f1f1f',
    labelBoxBorderColor: '#333333',
    labelTextColor: '#ededed',
    loopTextColor: '#ededed',
    sequenceNumberColor: '#0a0a0a',
    sectionBkgColor: '#111111',
    altSectionBkgColor: '#0a0a0a',
    gridColor: '#2e2e2e',
  },
} as const;

type ThemeName = keyof typeof THEMES;

function currentTheme(): ThemeName {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function configFor(theme: ThemeName) {
  return {
    startOnLoad: false,
    securityLevel: 'strict' as const,
    suppressErrorRendering: true,
    theme: 'base' as const,
    fontFamily: 'var(--font-sans)',
    themeVariables: {
      ...THEMES[theme],
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
    },
    flowchart: { useMaxWidth: true, htmlLabels: false },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  };
}

let mermaidPromise: Promise<MermaidApi> | null = null;
let renderId = 0;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => module.default);
  }
  return mermaidPromise;
}

function isMermaidBlock(pre: HTMLElement) {
  const code = pre.querySelector('code');
  if (!code) return false;

  const language =
    code.getAttribute('data-language') ??
    pre.getAttribute('data-language') ??
    null;

  if (language) return language === 'mermaid';

  const className = `${code.className ?? ''} ${pre.className ?? ''}`;
  if (/\blanguage-mermaid\b/.test(className)) return true;

  // Shiki has no mermaid grammar, so the fence falls back to plain text.
  return DIAGRAM_START.test(code.textContent ?? '');
}

interface Target {
  figure: HTMLElement;
  container: HTMLElement;
  source: string;
}

async function renderTargets(targets: Target[], theme: ThemeName, isCancelled: () => boolean) {
  const mermaid = await loadMermaid();
  if (isCancelled()) return;

  mermaid.initialize(configFor(theme));

  for (const target of targets) {
    if (isCancelled()) return;
    try {
      const { svg } = await mermaid.render(`ss-mermaid-${renderId++}`, target.source);
      if (isCancelled()) return;
      target.container.innerHTML = svg;
      target.container.dataset.state = 'ready';
      target.figure.style.display = 'none';
      target.figure.setAttribute('data-mermaid-hidden', 'true');
    } catch {
      target.container.dataset.state = 'error';
      target.container.remove();
      target.figure.style.display = '';
      target.figure.removeAttribute('data-mermaid-hidden');
    }
  }
}

/**
 * Mounted once per docs page. Finds mermaid code fences inside the article and
 * replaces them with rendered diagrams, lazily loading mermaid only when needed.
 */
export function MermaidDiagrams() {
  useEffect(() => {
    const article = document.getElementById('nd-page') ?? document.body;
    const targets: Target[] = [];

    for (const pre of Array.from(article.querySelectorAll<HTMLElement>('pre'))) {
      if (!isMermaidBlock(pre)) continue;
      const figure = pre.closest('figure') ?? pre;
      if (figure.getAttribute('data-mermaid-hidden') === 'true') continue;

      const container = document.createElement('div');
      container.className = 'ss-mermaid not-prose';
      container.dataset.state = 'loading';
      container.setAttribute('data-mermaid', '');
      container.setAttribute('role', 'img');
      container.setAttribute('aria-label', 'Diagram');

      figure.insertAdjacentElement('afterend', container);
      targets.push({
        figure,
        container,
        source: pre.querySelector('code')?.textContent ?? '',
      });
    }

    if (targets.length === 0) return;

    let cancelled = false;
    let renderedTheme = currentTheme();
    let queue: Promise<void> = Promise.resolve();

    const isCancelled = () => cancelled;

    const schedule = () => {
      queue = queue.then(async () => {
        try {
          await renderTargets(targets, renderedTheme, isCancelled);
        } catch {
          // mermaid failed to load: fall back to the highlighted source
          for (const target of targets) {
            if (target.container.dataset.state === 'loading') target.container.remove();
          }
        }
      });
    };

    schedule();

    const observer = new MutationObserver(() => {
      const theme = currentTheme();
      if (theme === renderedTheme) return;
      renderedTheme = theme;
      schedule();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = () => {
      const theme = currentTheme();
      if (theme === renderedTheme) return;
      renderedTheme = theme;
      schedule();
    };
    media.addEventListener('change', onMediaChange);

    return () => {
      cancelled = true;
      observer.disconnect();
      media.removeEventListener('change', onMediaChange);
    };
  }, []);

  return null;
}

/**
 * MDX component for hand-written `.mdx` pages: `<Mermaid chart="graph TD; ..." />`
 */
export function Mermaid({ chart, className }: { chart: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderedTheme = currentTheme();
    let queue: Promise<void> = Promise.resolve();

    const render = () => {
      queue = queue
        .then(async () => {
          const mermaid = await loadMermaid();
          if (cancelled || !containerRef.current) return;
          mermaid.initialize(configFor(renderedTheme));
          const { svg } = await mermaid.render(`ss-mermaid-${renderId++}`, chart);
          if (cancelled || !containerRef.current) return;
          containerRef.current.innerHTML = svg;
          containerRef.current.dataset.state = 'ready';
          sourceRef.current?.setAttribute('hidden', '');
        })
        .catch(() => {
          if (cancelled) return;
          containerRef.current?.remove();
          sourceRef.current?.removeAttribute('hidden');
        });
    };

    render();

    const observer = new MutationObserver(() => {
      const theme = currentTheme();
      if (theme === renderedTheme) return;
      renderedTheme = theme;
      render();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [chart]);

  return (
    <div className={`ss-mermaid-block not-prose my-4${className ? ` ${className}` : ''}`}>
      <pre
        ref={sourceRef}
        tabIndex={0}
        className="ss-mermaid-source overflow-auto rounded-lg border bg-fd-muted p-4 font-mono text-[13px] leading-6"
      >
        <code>{chart}</code>
      </pre>
      <div
        ref={containerRef}
        data-mermaid=""
        data-state="loading"
        role="img"
        aria-label="Diagram"
        className="ss-mermaid"
      />
    </div>
  );
}
