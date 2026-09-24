"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "@phosphor-icons/react";

import { AgentAvatar } from "@/components/shell/agent-avatar";
import { PhoneConversation } from "@/components/compositions/phone-conversation";
import { Iphone } from "@/components/ui/iphone";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { LiveProvider } from "@/lib/hooks/use-live";
import { useBootstrap, useThreads } from "@/lib/hooks/use-data";
import { ago } from "@/lib/format";

function PhoneInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: threads } = useThreads();
  const { data: boot } = useBootstrap();
  const selected = params.get("thread");
  const sorted = [...(threads ?? [])].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  const thread = sorted.find((t) => t.id === selected);
  const agent = thread && thread.id !== "thr-outlaw" ? boot?.agents.find((a) => a.id === thread.agentId) : undefined;

  return (
    <main className="thermal relative grid min-h-svh place-items-center overflow-hidden p-6">
      <FlickeringGrid className="absolute inset-0 -z-0 opacity-30 [mask-image:radial-gradient(60%_60%_at_50%_50%,black,transparent)]" squareSize={3} gridGap={8} color="#24c7d6" maxOpacity={0.25} flickerChance={0.08} />
      <span className="grain fixed inset-0" />
      <Link href="/messages" className="absolute right-5 top-5 z-10 grid size-9 place-items-center rounded-full bg-bg-1/70 text-text-2 backdrop-blur hover:text-text-1" aria-label="Back to Outlaw">
        <X weight="bold" className="size-4" />
      </Link>
      <div className="relative z-10 w-[400px] max-w-full">
        <Iphone className="drop-shadow-[0_60px_120px_rgba(0,0,0,0.6)]" screenClassName="bg-[#040c14]">
          {thread ? (
            <PhoneConversation thread={thread} agent={agent} onBack={() => router.replace("/phone")} />
          ) : (
            <div className="flex h-full flex-col bg-[#040c14] pt-14 text-text-1">
              <h1 className="px-5 text-[28px] font-semibold tracking-tight">Messages</h1>
              <ul className="mt-3 flex flex-col">
                {sorted.map((t) => {
                  const a = t.id === "thr-outlaw" ? undefined : boot?.agents.find((x) => x.id === t.agentId);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => router.replace(`/phone?thread=${t.id}`)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04]"
                      >
                        <span className="relative">
                          {a ? <AgentAvatar agent={a} size={44} /> : <span className="aura block size-11 rounded-full" />}
                          {t.unread > 0 && <span className="absolute -left-1 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-lime" />}
                        </span>
                        <span className="min-w-0 flex-1 border-b border-white/[0.06] pb-2.5">
                          <span className="flex items-baseline justify-between">
                            <span className="font-medium">{a?.name ?? t.title}</span>
                            <span className="text-[11px] text-text-3">{ago(t.lastMessageAt)}</span>
                          </span>
                          <span className="line-clamp-2 text-[12.5px] text-text-2">{t.lastPreview}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Iphone>
      </div>
    </main>
  );
}

export default function PhonePage() {
  return (
    <LiveProvider>
      <React.Suspense fallback={null}>
        <PhoneInner />
      </React.Suspense>
    </LiveProvider>
  );
}
