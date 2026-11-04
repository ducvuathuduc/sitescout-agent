import defaultMdxComponents from 'fumadocs-ui/mdx';
import {
  CodeBlock,
  CodeBlockTab as DefaultCodeBlockTab,
  CodeBlockTabs as DefaultCodeBlockTabs,
  CodeBlockTabsList as DefaultCodeBlockTabsList,
  Pre,
} from 'fumadocs-ui/components/codeblock';
import { Callout } from 'fumadocs-ui/components/callout';
import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { MDXComponents } from 'mdx/types';
import { Mermaid } from '@/components/mermaid';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function languageOf(node: ReactNode): string | undefined {
  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  const props = node.props;
  const className = typeof props.className === 'string' ? props.className : '';
  const fromClass = /language-([\w+-]+)/.exec(className);
  if (fromClass?.[1]) return fromClass[1];
  const fromAttribute = props['data-language'];
  return typeof fromAttribute === 'string' ? fromAttribute : undefined;
}

const SHELL_LANGUAGES = new Set([
  'bash',
  'sh',
  'shell',
  'shellscript',
  'zsh',
  'console',
  'terminal',
]);

const SHELL_FIRST_LINE =
  /^(?:\$|>|#!\/)\s*\S|^(?:npm|npx|pnpm|yarn|bun|git|cd|curl|wget|docker|kubectl|brew|export|uv|uvx|pip3?|python3?|node|deno|sitescout|gh|wrangler)\s+\S/;

const NON_SHELL_HINT =
  /(?:^|\n)\s*(?:import|export|const|let|var|function|class|def|package|public|private|type|interface)\s|=>|;\s*$/;

function looksLikeShell(text: string) {
  if (!text.trim()) return false;
  if (NON_SHELL_HINT.test(text)) return false;
  const firstLine = text.replace(/^\s+/, '').split('\n')[0] ?? '';
  return SHELL_FIRST_LINE.test(firstLine);
}

/* ------------------------------------------------------------------ */
/* code blocks                                                         */
/* ------------------------------------------------------------------ */

function TerminalIcon() {
  return (
    <span className="ss-terminal-icon" aria-hidden>
      {'>_'}
    </span>
  );
}

function PreBlock(
  props: HTMLAttributes<HTMLPreElement> & {
    title?: ReactNode;
    'data-in-tab'?: boolean;
  },
) {
  const { title, children, 'data-in-tab': inTab = false, ...rest } = props;
  const language = languageOf(children);
  const isShell = language ? SHELL_LANGUAGES.has(language) : looksLikeShell(textOf(children));
  const resolvedTitle = title ?? (isShell ? 'Terminal' : language ?? 'Code');

  return (
    <CodeBlock
      {...rest}
      title={resolvedTitle}
      icon={isShell ? <TerminalIcon /> : undefined}
    >
      <Pre>{children}</Pre>
    </CodeBlock>
  );
}

const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

const PACKAGE_MANAGER_ORDER = ['pnpm', 'yarn', 'npm', 'bun'];

function tabValuesOf(children: ReactNode): string[] {
  const values: string[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child) || child.type !== CodeBlockTabsList) {
      return;
    }
    Children.forEach(child.props.children, (trigger) => {
      if (isValidElement<{ value?: string }>(trigger) && trigger.props.value) {
        values.push(trigger.props.value);
      }
    });
  });

  return values;
}

function CodeBlockTabs(props: ComponentProps<typeof DefaultCodeBlockTabs>) {
  const className = props.className;
  const merged =
    typeof className === 'function'
      ? (state: Parameters<typeof className>[0]) => cn(className(state), 'ss-code-tabs')
      : cn(className, 'ss-code-tabs');

  const values = tabValuesOf(props.children);
  const isPackageManager =
    values.length > 1 && values.every((value) => PACKAGE_MANAGERS.includes(value));
  const defaultValue = props.defaultValue ?? (isPackageManager ? 'pnpm' : values[0]);

  return (
    <DefaultCodeBlockTabs
      {...props}
      defaultValue={defaultValue}
      className={merged}
      {...(isPackageManager ? { groupId: 'ss-package-manager', persist: true } : {})}
    />
  );
}

function CodeBlockTabsList(props: ComponentProps<typeof DefaultCodeBlockTabsList>) {
  const ranked = Children.toArray(props.children).map((child, index) => {
    const value = isValidElement<{ value?: string }>(child) ? child.props.value : undefined;
    const rank = value ? PACKAGE_MANAGER_ORDER.indexOf(value) : -1;
    return { child, index, rank: rank === -1 ? PACKAGE_MANAGER_ORDER.length : rank };
  });

  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);

  return (
    <DefaultCodeBlockTabsList {...props}>
      {ranked.map(({ child }) => child)}
    </DefaultCodeBlockTabsList>
  );
}

function CodeBlockTab(props: ComponentProps<typeof DefaultCodeBlockTab>) {
  const children = Children.map(props.children, (child) =>
    isValidElement(child) && typeof child.type !== 'string'
      ? cloneElement(child as ReactElement<{ 'data-in-tab'?: boolean }>, {
          'data-in-tab': true,
        })
      : child,
  );

  return <DefaultCodeBlockTab {...props}>{children}</DefaultCodeBlockTab>;
}

/* ------------------------------------------------------------------ */
/* github alerts (`> [!NOTE]`)                                          */
/* ------------------------------------------------------------------ */

const ALERT = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

const ALERT_TYPES = {
  NOTE: 'info',
  TIP: 'info',
  IMPORTANT: 'info',
  WARNING: 'warning',
  CAUTION: 'error',
} as const;

const ALERT_TITLES: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};

function stripLeading(node: ReactNode, count: number): ReactNode {
  if (count <= 0) return node;

  if (typeof node === 'string') return node.slice(count);

  if (Array.isArray(node)) {
    const output: ReactNode[] = [];
    let remaining = count;
    for (const child of node) {
      if (remaining <= 0) {
        output.push(child);
        continue;
      }
      const length = textOf(child).length;
      if (length <= remaining) {
        remaining -= length;
        continue;
      }
      output.push(stripLeading(child, remaining));
      remaining = 0;
    }
    return output;
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return cloneElement(node, {}, stripLeading(node.props.children, count));
  }

  return node;
}

function Blockquote(props: ComponentProps<'blockquote'>) {
  const items = Children.toArray(props.children);
  const first = items[0];

  if (isValidElement<{ children?: ReactNode }>(first) && first.type === 'p') {
    const text = textOf(first.props.children);
    const match = ALERT.exec(text);

    if (match) {
      const key = match[1].toUpperCase();
      const rest = stripLeading(first.props.children, match[0].length);
      const body = Array.isArray(rest) ? rest : [rest];

      return (
        <Callout
          type={ALERT_TYPES[key as keyof typeof ALERT_TYPES] ?? 'info'}
          title={ALERT_TITLES[key]}
        >
          {cloneElement(first, {}, ...body)}
          {items.slice(1)}
        </Callout>
      );
    }
  }

  return <blockquote {...props} />;
}

/* ------------------------------------------------------------------ */
/* registry                                                            */
/* ------------------------------------------------------------------ */

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    pre: PreBlock,
    CodeBlockTabs,
    CodeBlockTabsList,
    CodeBlockTab,
    blockquote: Blockquote,
    Mermaid,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
