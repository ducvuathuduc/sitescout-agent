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
    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-[#ebebeb] bg-[#fafafa] dark:border-[#2e2e2e] dark:bg-[#111]">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="agent-prompt-body"
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[14px] font-medium text-[#171717] dark:text-[#ededed]"
        >
          <FileText aria-hidden className="size-4 shrink-0 text-[#666] dark:text-[#a1a1a1]" />
          <span className="truncate">Agent prompt</span>
          <ChevronDown aria-hidden className={`ms-auto size-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>
        <CopyButton value={PROMPT} label="Copy the agent prompt" />
      </div>
      <div id="agent-prompt-body" className="border-t border-[#ebebeb] px-4 py-4 dark:border-[#2e2e2e]">
        <pre className={`${open ? '' : 'line-clamp-2'} whitespace-pre-wrap break-words font-sans text-[14px] leading-6 text-[#666] dark:text-[#a1a1a1]`}>
          <code>{PROMPT}</code>
        </pre>
      </div>
    </div>
  );
}
