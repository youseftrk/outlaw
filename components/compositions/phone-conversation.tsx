"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUp, CaretLeft, Phone, VideoCamera } from "@phosphor-icons/react";
import { ThinkingOrb } from "thinking-orbs";

import { ChatBubble, ChatBubbleMessage } from "@/components/vendor/shadcn-chat/chat-bubble";
import { ChatMessageList } from "@/components/vendor/shadcn-chat/chat-message-list";
import { ChatInput } from "@/components/vendor/shadcn-chat/chat-input";
import { BlurFade } from "@/components/ui/blur-fade";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { api, useThreadMessages } from "@/lib/hooks/use-data";
import { useLiveEvent } from "@/lib/hooks/use-live";
import { SEVERITY_HEX, dayLabel } from "@/lib/format";
import type { Agent, Message, Tapback, Thread } from "@/lib/types";
import { cn } from "@/lib/utils";

const TAPBACKS: { value: Tapback; glyph: string }[] = [
  { value: "heart", glyph: "♥" },
  { value: "thumbs-up", glyph: "👍" },
  { value: "thumbs-down", glyph: "👎" },
  { value: "haha", glyph: "HA" },
  { value: "!!", glyph: "!!" },
  { value: "?", glyph: "?" },
];

function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const CHANNEL_LABEL: Record<string, string> = { webhook: "webhook", slack: "Slack", twilio: "SMS" };

function deliverySuffix(d: NonNullable<Message["delivery"]>[number]) {
  if (d.status === "sent") return `· sent via ${CHANNEL_LABEL[d.channel] ?? d.channel}`;
  if (d.status === "failed") return "· delivery failed";
  return "· sending…";
}

function Attachment({ a }: { a: NonNullable<Message["attachments"]>[number] }) {
  const href =
    a.type === "threat-card"
      ? `/threats/${a.refId}`
      : a.type === "server-card"
        ? `/fleet?server=${a.refId}`
        : a.type === "trace-link"
          ? `/governance?tab=traces&trace=${a.refId}`
          : a.type === "migration-card"
            ? `/fleet?tab=migrations`
            : `/range`;
  return (
    <Link href={href} className="mt-2 flex items-center gap-2 rounded-[12px] bg-black/10 px-3 py-2 text-[12px] transition-colors hover:bg-black/15">
      <span className="eyebrow text-[9px] opacity-70">{a.type.replace("-card", "").replace("-link", "")}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.title}</span>
        {a.subtitle && <span className="block truncate opacity-70">{a.subtitle}</span>}
      </span>
    </Link>
  );
}

export function PhoneConversation({
  thread,
  agent,
  onBack,
  className,
  compact = false,
}: {
  thread: Thread;
  agent?: Agent;
  onBack?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const { data: messages, mutate } = useThreadMessages(thread.id);
  const [draft, setDraft] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  useLiveEvent(["message.sent", "message.updated"], (e) => {
    const p = e.payload as { threadId?: string } | undefined;
    if (!p?.threadId || p.threadId === thread.id) {
      setTyping(false);
      void mutate();
    }
  });

  React.useEffect(() => {
    if (thread.unread > 0) void api.messages.read(thread.id);
  }, [thread.id, thread.unread]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setDraft("");
    setTyping(true);
    try {
      await api.messages.send(thread.id, t);
      void mutate();
    } catch (e) {
      setTyping(false);
      toast.error(e instanceof Error ? e.message : "Message didn't send");
    } finally {
      setSending(false);
    }
  };

  const tapback = async (m: Message, tb: Tapback) => {
    try {
      await api.messages.tapback(m.id, m.tapback === tb ? null : tb);
      void mutate();
    } catch {
      /* ignore */
    }
  };

  const list = messages ?? [];
  const title = agent?.name ?? thread.title;

  return (
    <div className={cn("flex h-full flex-col bg-[#040c14] text-text-1", className)}>
      {/* iOS-style header */}
      <div className={cn("flex items-center gap-2 border-b border-white/[0.06] bg-[#0a1a28]/90 px-3 backdrop-blur-xl", compact ? "pt-3 pb-2" : "pt-12 pb-2")}>
        {onBack ? (
          <button type="button" onClick={onBack} className="text-cerulean" aria-label="Back to threads">
            <CaretLeft weight="bold" className="size-5" />
          </button>
        ) : (
          <span className="w-5" />
        )}
        <div className="flex flex-1 flex-col items-center">
          {agent ? <AgentAvatar agent={agent} size={compact ? 28 : 44} face="mouth" /> : <span className="aura size-9 rounded-full" />}
          <span className="mt-1 text-[12px] font-medium leading-none">{title}</span>
          <span className="mt-0.5 text-[10px] text-text-3">Qalaa · {agent ? agent.role : "system"} ›</span>
        </div>
        <div className="flex w-10 justify-end gap-2 text-cerulean">
          <VideoCamera weight="regular" className="size-4" />
          <Phone weight="regular" className="size-4" />
        </div>
      </div>

      <ChatMessageList smooth className="gap-0 px-3 py-3">
        {list.map((m, i) => {
          const prev = list[i - 1];
          const newDay = !prev || dayLabel(prev.sentAt) !== dayLabel(m.sentAt);
          const gap = !prev || new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() > 15 * 60 * 1000;
          const fromAgent = m.from !== "operator";
          const last = i === list.length - 1;
          return (
            <React.Fragment key={m.id}>
              {(newDay || gap) && (
                <p className="mono-data my-2 text-center text-[10px] text-text-3">
                  {newDay ? `${dayLabel(m.sentAt)} · ` : ""}
                  {timeShort(m.sentAt)}
                </p>
              )}
              <ChatBubble variant={fromAgent ? "received" : "sent"} className="max-w-[82%] gap-1.5">
                <HoverCard>
                  <HoverCardTrigger delay={400} render={<div className="relative" />}>
                    <ChatBubbleMessage
                      variant={fromAgent ? "received" : "sent"}
                      className={cn(
                        "relative px-3 py-2 text-[13.5px] leading-[1.35] shadow-[0_1px_0_rgba(255,255,255,0.04)]",
                        fromAgent ? (m.from === "system" ? "bubble-system" : "bubble-agent") : "bubble-operator",
                        m.kind === "alert" && m.severity && "pl-4",
                      )}
                    >
                      {m.kind === "alert" && m.severity && (
                        <span className="absolute left-1.5 top-2 bottom-2 w-[3px] rounded-full" style={{ background: SEVERITY_HEX[m.severity] }} />
                      )}
                      {m.kind === "approval-request" && <span className="eyebrow mb-1 block text-[9px] opacity-70">approval needed</span>}
                      {m.kind === "report" && <span className="eyebrow mb-1 block text-[9px] opacity-70">report</span>}
                      <span className="whitespace-pre-wrap">{m.text}</span>
                      {m.attachments?.map((a) => <Attachment key={`${a.type}-${a.refId}`} a={a} />)}
                      {m.tapback && (
                        <span
                          className={cn(
                            "absolute -top-3 grid h-6 min-w-6 place-items-center rounded-full border border-white/10 bg-bg-3 px-1.5 text-[11px] text-text-1 shadow-md",
                            fromAgent ? "-right-2" : "-left-2",
                          )}
                        >
                          {TAPBACKS.find((t) => t.value === m.tapback)?.glyph}
                        </span>
                      )}
                    </ChatBubbleMessage>
                  </HoverCardTrigger>
                  <HoverCardContent side="top" className="w-auto rounded-full border-white/10 bg-bg-3 px-2 py-1">
                    <div className="flex items-center gap-1">
                      {TAPBACKS.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => tapback(m, t.value)}
                          className={cn(
                            "grid size-7 place-items-center rounded-full text-[12px] transition-transform hover:scale-110 hover:bg-white/10",
                            m.tapback === t.value && "bg-cerulean text-white",
                          )}
                          aria-label={t.value}
                        >
                          {t.glyph}
                        </button>
                      ))}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </ChatBubble>
              {m.quickReplies && m.quickReplies.length > 0 && last && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-1">
                  {m.quickReplies.map((q, qi) => (
                    <BlurFade key={q.command} delay={0.08 + qi * 0.06} duration={0.35} direction="up" offset={6}>
                      <Button
                        size="xs"
                        variant={q.tone === "danger" ? "destructive" : q.tone === "primary" ? "default" : "secondary"}
                        className="rounded-full"
                        onClick={() => send(q.command)}
                      >
                        {q.label}
                      </Button>
                    </BlurFade>
                  ))}
                </div>
              )}
              {!fromAgent && last && (
                <span className="mono-data mt-0.5 self-end pr-1 text-[10px] text-text-3">{m.readAt ? "Read" : m.deliveredAt ? "Delivered" : "Sent"}</span>
              )}
              {fromAgent && m.delivery?.length ? (
                <span className="mono-data mt-0.5 self-start pl-1 text-[10px] text-text-3">{timeShort(m.sentAt)} {deliverySuffix(m.delivery[m.delivery.length - 1])}</span>
              ) : null}
            </React.Fragment>
          );
        })}
        {typing && (
          <ChatBubble variant="received" className="max-w-[60%]">
            <ChatBubbleMessage variant="received" className="bubble-system flex items-center gap-2 px-3 py-2">
              <ThinkingOrb state="composing" size={20} theme="dark" />
              <span className="text-[11px] text-text-3">{title} is typing</span>
            </ChatBubbleMessage>
          </ChatBubble>
        )}
        {list.length === 0 && (
          <p className="mt-10 text-center text-[12px] text-text-3">
            No texts yet. Say hi — try <span className="mono-data text-text-2">status</span> or <span className="mono-data text-text-2">help</span>.
          </p>
        )}
      </ChatMessageList>

      <form
        className="flex items-end gap-2 border-t border-white/[0.06] bg-[#0a1a28]/90 px-3 pt-2 pb-5 backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <ChatInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder="iMessage"
          className="min-h-9 max-h-28 flex-1 resize-none rounded-[18px] border border-white/10 bg-[#040c14] px-3.5 py-2 text-[13.5px] text-text-1 placeholder:text-text-3 focus-visible:ring-1 focus-visible:ring-cerulean"
        />
        <Button type="submit" size="icon-sm" disabled={!draft.trim() || sending} className="size-8 rounded-full bg-lime text-carbon hover:bg-lime/85" aria-label="Send">
          <ArrowUp weight="bold" className="size-4" />
        </Button>
      </form>
    </div>
  );
}
