import Link from 'next/link';
import {
  ChartBar,
  Coins,
  MessagesSquare,
  Network,
  Plug,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { TerminalCard } from '@/components/landing/terminal-card';
import { AgentPrompt } from '@/components/landing/agent-prompt';

type Card = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

const CARDS: Card[] = [
  {
    title: 'MCP usage',
    description: 'Five tools that run a whole analysis from your AI assistant.',
    href: '/docs/mcp',
    icon: Plug,
  },
  {
    title: 'Demo proxy',
    description: 'How the Worker keeps the key secret and shares one daily budget.',
    href: '/docs/demo-proxy',
    icon: Network,
  },
  {
    title: 'Credits and limits',
    description: 'How each Geoapify call is priced, and the caps the demo enforces.',
    href: '/docs/credits',
    icon: Coins,
  },
  {
    title: 'How it works',
    description: 'Plan, geocode, isolines, scoring — and where each step lives.',
    href: '/docs/how-it-works',
    icon: Workflow,
  },
  {
    title: 'Recorded sessions',
    description: 'Real agent runs, including the failures that shaped the tools.',
    href: '/docs/agent/sessions',
    icon: MessagesSquare,
  },
  {
    title: 'Benchmarks',
    description: '55 HCMC address queries scored against Wikidata coordinates.',
    href: '/docs/benchmarks/hcmc-addresses',
    icon: ChartBar,
  },
];

const primaryButton =
  'inline-flex h-10 items-center justify-center rounded-lg bg-[#171717] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#383838] motion-reduce:transition-none dark:bg-[#ededed] dark:text-[#0a0a0a] dark:hover:bg-white';

const secondaryButton =
  'inline-flex h-10 items-center justify-center rounded-lg border border-[#ebebeb] bg-white px-4 text-[14px] font-medium text-[#171717] transition-colors hover:bg-[#fafafa] motion-reduce:transition-none dark:border-[#2e2e2e] dark:bg-[#0a0a0a] dark:text-[#ededed] dark:hover:bg-[#111]';

export default function HomePage() {
  return (
    <main
      id="nd-page"
      tabIndex={-1}
      className="w-full min-w-0 [grid-area:main] px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto w-full max-w-[1100px]">
        <section className="grid items-start gap-10 py-12 lg:py-16 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-12">
          <div className="min-w-0">
            <h1 className="text-[clamp(28px,8.5vw,48px)] font-semibold leading-[1.05] tracking-[-0.04em] text-[#171717] dark:text-[#ededed]">
              Find the best spot,
              <br />
              with evidence.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[16px] leading-7 text-[#666] dark:text-[#a1a1a1]">
              Turn a plain-language question — English or Vietnamese — into a site-selection
              analysis: a 10-minute walking isochrone around each candidate, competitors and demand
              counted inside it, drive times from real origins, and a published ranking formula.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/docs" className={primaryButton}>
                Get started
              </Link>
              <a
                href="https://sitescout.huynhthanh.workers.dev"
                className={secondaryButton}
                rel="noreferrer"
              >
                Open the live demo
              </a>
              <Link href="/docs/mcp" className={secondaryButton}>
                MCP usage
              </Link>
            </div>
          </div>

          <div className="min-w-0 xl:pt-7">
            <TerminalCard />
          </div>
        </section>

        <section className="pb-12">
          <div className="grid gap-5">
            <div className="min-w-0">
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#171717] dark:text-[#ededed]">
                Set up your coding agent
              </h2>
              <p className="mt-3 text-[16px] leading-7 text-[#171717] dark:text-[#ededed]">
                Paste the prompt into Claude Code, Cursor or Claude Desktop. It points the agent at
                the machine-readable index and then at the guides.
              </p>
            </div>
            <div className="min-w-0">
              <AgentPrompt />
            </div>
          </div>
        </section>

        <section className="pb-16">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#171717] dark:text-[#ededed]">
            Explore the docs
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex min-w-0 items-start gap-3 rounded-xl border border-[#ebebeb] bg-white p-4 transition-colors hover:border-[#d4d4d4] hover:bg-[#fafafa] motion-reduce:transition-none dark:border-[#2e2e2e] dark:bg-[#0a0a0a] dark:hover:border-[#3f3f3f] dark:hover:bg-[#111]"
                >
                  <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-[#ebebeb] bg-[#fafafa] text-[#171717] dark:border-[#2e2e2e] dark:bg-[#111] dark:text-[#ededed]">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-[#171717] transition-colors group-hover:text-[#0068d6] motion-reduce:transition-none dark:text-[#ededed] dark:group-hover:text-[#52a8ff]">
                      {card.title}
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-[#666] dark:text-[#a1a1a1]">
                      {card.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
