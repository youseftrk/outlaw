"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowsOutSimple, PushPin } from "@phosphor-icons/react";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { PhoneConversation } from "@/components/compositions/phone-conversation";
import { Iphone } from "@/components/ui/iphone";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBootstrap, useThreads } from "@/lib/hooks/use-data";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

function MessagesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: threads } = useThreads();
  const { data: boot } = useBootstrap();

  const sorted = React.useMemo(
    () => [...(threads ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [threads],
  );
  const selectedId = params.get("thread") ?? sorted[0]?.id;
  const thread = sorted.find((t) => t.id === selectedId) ?? sorted[0];
  const agent = thread && thread.id !== "thr-outlaw" ? boot?.agents.find((a) => a.id === thread.agentId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Texts from the gang"
        title="Messages"
        description="Agents text you like a colleague would — alerts, approvals, reports. Text back to give orders. Every command becomes a trace."
        actions={
          <Button variant="secondary" size="sm" className="gap-1.5" nativeButton={false} render={<Link href={`/phone${thread ? `?thread=${thread.id}` : ""}`} />}>
            <ArrowsOutSimple weight="bold" className="size-3.5" /> Phone only
          </Button>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <BlurFade delay={0.05} className="col-span-12 lg:col-span-4">
          <Card className="bezel-core h-[720px] gap-0 border-0 p-0">
            <div className="border-b border-line px-4 py-3">
              <p className="eyebrow">Threads</p>
            </div>
            <ScrollArea className="h-[668px]">
              <ul className="flex flex-col p-2">
                {sorted.map((t) => {
                  const system = t.id === "thr-outlaw";
                  const a = system ? undefined : boot?.agents.find((x) => x.id === t.agentId);
                  const active = t.id === thread?.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => router.replace(`/messages?thread=${t.id}`)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-bg-2",
                          active && "bg-bg-2 ring-1 ring-line-strong",
                        )}
                      >
                        {a ? <AgentAvatar agent={a} size={40} /> : <span className="aura size-10 rounded-full opacity-90" />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-text-1">{a?.name ?? t.title}</span>
                            {t.pinned && <PushPin weight="fill" className="size-3 text-text-3" />}
                            <span className="mono-data ml-auto text-[10px] text-text-3">{ago(t.lastMessageAt)}</span>
                          </span>
                          <span className="block truncate text-[12px] text-text-2">{t.lastPreview}</span>
                        </span>
                        {t.unread > 0 && (
                          <span className="mono-data grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1.5 text-[10px] font-semibold text-carbon">
                            {t.unread}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </Card>
        </BlurFade>

        <BlurFade delay={0.1} className="col-span-12 flex justify-center lg:col-span-8">
          <div className="relative w-[360px]">
            <div className="aura pointer-events-none absolute inset-x-8 top-16 -z-10 h-[520px] rounded-full opacity-[0.16] blur-3xl" />
            <Iphone className="drop-shadow-[0_40px_80px_rgba(0,0,0,0.55)]" screenClassName="bg-[#040c14]">
              {thread ? <PhoneConversation thread={thread} agent={agent} /> : <div className="grid h-full place-items-center text-text-3">No threads yet.</div>}
            </Iphone>
          </div>
        </BlurFade>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <React.Suspense fallback={<div className="text-text-3">Loading messages…</div>}>
      <MessagesInner />
    </React.Suspense>
  );
}
