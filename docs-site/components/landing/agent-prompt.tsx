'use client';

import { useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { CopyButton } from './copy-button';

const PROMPT = [
  'Read https://sitescout-docs.pages.dev/llms.txt, then follow https://sitescout-docs.pages.dev/docs.',
  'Use SiteScout to answer site-selection questions for Ho Chi Minh City and cite every number with its [Tn] reference.',
].join(' ');

export function AgentPrompt() {
  const [open, setOpen] = useState(false);

  return (
    <div className="ss-agent-prompt relative mb-4 w-full min-w-0 rounded-md border border-[#ebebeb] bg-white dark:border-[#2e2e2e] dark:bg-[#0a0a0a]">
      <div className="flex h-12 items-center gap-2 rounded-t-md bg-[#fafafa] px-4 dark:bg-[#111]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="agent-prompt-body"
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] text-[#666] dark:text-[#a1a1a1]"
        >
          <FileText aria-hidden className="size-4 shrink-0 text-[#666] dark:text-[#a1a1a1]" />
          <span className="truncate">Agent prompt</span>
        </button>
        <CopyButton value={PROMPT} label="Copy the agent prompt" />
        <button type="button" onClick={() => setOpen(value => !value)} aria-label={open ? 'Collapse agent prompt' : 'Expand agent prompt'} aria-expanded={open} aria-controls="agent-prompt-body" className="ss-icon-btn">
          <ChevronDown aria-hidden className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div id="agent-prompt-body" className={`ss-agent-preview border-t border-[#ebebeb] px-4 py-4 dark:border-[#2e2e2e] ${open ? '' : 'ss-agent-collapsed'}`}>
        <p className="text-[14px] leading-6 text-[#666] dark:text-[#a1a1a1]">{PROMPT}</p>
      </div>
      <button type="button" className="ss-show-more" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="agent-prompt-body">{open ? 'Show less' : 'Show more'}</button>
    </div>
  );
}
