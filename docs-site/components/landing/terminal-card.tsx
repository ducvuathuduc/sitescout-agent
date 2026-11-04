'use client';

import { useRef, useState } from 'react';
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
      'export GEOAPIFY_API_KEY=your_key',
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

      <div className="overflow-hidden rounded-lg border border-[#ebebeb] bg-[#fafafa] dark:border-[#2e2e2e] dark:bg-[#0a0a0a]">
        <div className="flex h-10 items-center justify-between gap-2 border-b border-[#ebebeb] px-4 dark:border-[#2e2e2e]">
          <span className="font-mono text-[13px] leading-5 text-[#666] dark:text-[#a1a1a1]">
            &gt;_ Terminal
          </span>
          <CopyButton key={active} value={current.command} label={`Copy the ${current.label} command`} />
        </div>

        {TABS.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`terminal-panel-${tab.id}`}
            aria-labelledby={`terminal-tab-${tab.id}`}
            hidden={tab.id !== active}
            tabIndex={0}
            className="overflow-x-auto px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#171717] dark:focus-visible:outline-[#ededed]"
          >
            <pre className="font-mono text-[13px] leading-6 whitespace-pre text-[#171717] dark:text-[#ededed]">
              <code>{tab.command}</code>
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
