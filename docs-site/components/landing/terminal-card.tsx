'use client';

import { useEffect, useRef, useState } from 'react';
import { CopyButton } from './copy-button';

type Tab = {
  id: string;
  label: string;
  command: string;
};

const TABS: Tab[] = [
  {
    id: 'local',
    label: 'Run locally',
    command: [
      'git clone https://github.com/ducvuathuduc/sitescout-agent.git',
      'cd sitescout-agent',
      'npm ci',
      'npm run build',
      'export GEOAPIFY_API_KEY=YOUR_KEY',
      'node dist/cli.js scout "Where should I open a specialty coffee shop in Thảo Điền?" --id my-coffee',
    ].join('\n'),
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    command:
      'claude mcp add sitescout -e GEOAPIFY_API_KEY=YOUR_KEY -- node "$PWD/dist/mcp-server.js"',
  },
  {
    id: 'ask',
    label: 'Ask a question',
    command: 'GEOAPIFY_API_KEY=YOUR_KEY npm run ask -- --question thaodien-coffee',
  },
];

// Keep every byte of the copied command; only add presentation spans. Shell
// command names stay neutral and arguments, flags and strings are green.
function ShellCommand({ command }: { command: string }) {
  return command.split('\n').map((line, index) => {
    const [, executable = line, args = ''] = /^(\S+)(.*)$/.exec(line) ?? [];
    return <span key={index}>{index > 0 ? '\n' : ''}{executable}<span className="ss-shell-args">{args}</span></span>;
  });
}

function TerminalPanel({ tab, active }: { tab: Tab; active: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, scroll: 0 });
  const [scroll, setScroll] = useState({ width: 100, left: 0, value: 0 });
  function update() {
    const el = viewport.current;
    if (!el?.clientWidth) return;
    const maximum = el.scrollWidth - el.clientWidth;
    setScroll({ width: el.clientWidth / el.scrollWidth * 100,
      left: el.scrollLeft / el.scrollWidth * 100,
      value: maximum ? Math.round(el.scrollLeft / maximum * 100) : 0 });
  }
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    observer.observe(el.querySelector('pre')!);
    update();
    return () => observer.disconnect();
  }, [active]);

  return (
    <div hidden={!active}>
      <div ref={viewport} role="tabpanel" id={`terminal-panel-${tab.id}`}
        aria-labelledby={`terminal-tab-${tab.id}`} tabIndex={0} onScroll={update}
        className="ss-terminal-scroll overflow-x-auto py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#171717] dark:focus-visible:outline-[#ededed]">
        <pre className="w-max min-w-full px-4 font-mono text-[13px] leading-5 whitespace-pre text-[#171717] dark:text-[#ededed]">
          <code><ShellCommand command={tab.command} /></code>
        </pre>
      </div>
      <div className="ss-terminal-track" role="scrollbar" aria-label={`${tab.label} terminal horizontal scroll`}
        aria-controls={`terminal-panel-${tab.id}`} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={scroll.value} tabIndex={scroll.width < 100 ? 0 : -1}
        onPointerDown={event => {
          const el = viewport.current!;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          if (event.target === event.currentTarget) {
            const box = event.currentTarget.getBoundingClientRect();
            el.scrollLeft = (event.clientX - box.left) / box.width * el.scrollWidth - el.clientWidth / 2;
          }
          drag.current = { x: event.clientX, scroll: el.scrollLeft };
          update();
        }}
        onPointerMove={event => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const el = viewport.current!;
          el.scrollLeft = drag.current.scroll + (event.clientX - drag.current.x) * el.scrollWidth / el.clientWidth;
        }}
        onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={event => {
          const el = viewport.current!;
          const delta = { ArrowLeft: -40, ArrowRight: 40, PageUp: -el.clientWidth, PageDown: el.clientWidth }[event.key];
          if (event.key === 'Home') el.scrollLeft = 0;
          else if (event.key === 'End') el.scrollLeft = el.scrollWidth;
          else if (delta !== undefined) el.scrollLeft += delta;
          else return;
          event.preventDefault();
        }}>
        <span aria-hidden className="ss-terminal-thumb" style={{ width: `${scroll.width}%`, left: `${scroll.left}%` }} />
      </div>
    </div>
  );
}

export function TerminalCard() {
  const [active, setActive] = useState(TABS[0].id);
  const tabsRef = useRef<HTMLDivElement>(null);
  const current = TABS.find((tab) => tab.id === active) ?? TABS[0];

  return (
    <div className="w-full min-w-0">
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Ways to run SiteScout"
        className="mb-4 flex gap-5 overflow-x-auto border-b border-[#ebebeb] dark:border-[#2e2e2e]"
      >
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`terminal-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`terminal-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => {
                const index = TABS.findIndex((item) => item.id === tab.id);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
                  : event.key === 'ArrowRight' ? (index + 1) % TABS.length
                  : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : null;
                if (next === null) return;
                event.preventDefault();
                setActive(TABS[next].id);
                tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
              }}
              className={`relative shrink-0 whitespace-nowrap pb-2 text-[13px] leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] motion-reduce:transition-none dark:focus-visible:outline-[#ededed] ${
                selected
                  ? 'text-[#171717] dark:text-[#ededed]'
                  : 'text-[#666] hover:text-[#171717] dark:text-[#a1a1a1] dark:hover:text-[#ededed]'
              }`}
            >
              {tab.label}
              <span
                aria-hidden
                className={`absolute inset-x-0 bottom-0 h-px ${
                  selected ? 'bg-[#171717] dark:bg-[#ededed]' : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#ebebeb] bg-white dark:border-[#2e2e2e] dark:bg-[#0a0a0a]">
        <div className="flex h-10 items-center justify-between gap-2 border-b border-[#ebebeb] bg-[#fafafa] px-4 dark:border-[#2e2e2e] dark:bg-[#111]">
          <span className="font-mono text-[13px] leading-5 text-[#666] dark:text-[#a1a1a1]">
            &gt;_ Terminal
          </span>
          <CopyButton key={active} value={current.command} label={`Copy the ${current.label} command`} />
        </div>

        {TABS.map(tab => <TerminalPanel key={tab.id} tab={tab} active={tab.id === active} />)}
      </div>
    </div>
  );
}
