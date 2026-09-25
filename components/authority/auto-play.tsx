"use client";

import * as React from "react";
import { toast } from "sonner";
import { FastForward, Stop } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { authorityApi, callProtected, useRefreshAuthority } from "@/lib/hooks/use-authority";
import type { AuthorityLease, DrillState } from "@/lib/types";

const AGENT_ID = "agt-hisn";
const REQUESTER = "ent-response";
const OWNER = "ent-data";
const CAPABILITY = "contain" as const;
const BEAT_MS = 4500;

class Stopped extends Error {}

type Beat = { label: string; run: () => Promise<void> };

/**
 * Runs the whole story by itself, one real API call per beat, pausing between beats so
 * the presenter can talk. Every step still goes through the server — the screen only follows.
 */
export function AutoPlay({ system, className }: { system: DrillState["system"]; className?: string }) {
  const refresh = useRefreshAuthority();
  const [playing, setPlaying] = React.useState<string | null>(null);
  const stopRef = React.useRef(false);

  const pause = async (ms: number) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (stopRef.current) throw new Stopped();
      await new Promise((r) => setTimeout(r, 150));
    }
  };

  const play = async () => {
    stopRef.current = false;
    let lease: AuthorityLease | null = null;
    let code: string | undefined;

    const knock = () => callProtected({ ownerEntityId: OWNER, capability: CAPABILITY, actorId: AGENT_ID, serverId: system.serverId });

    const beats: Beat[] = [
      { label: "Clean slate", run: async () => void (await authorityApi.reset({ fromOnboarding: true })) },
      {
        label: "Onboard the system",
        run: async () =>
          void (await authorityApi.onboard({
            serverId: system.serverId,
            ownerEntityId: OWNER,
            dataClasses: system.dataClasses.length ? system.dataClasses : ["personal-data", "infrastructure"],
            by: OWNER,
          })),
      },
      { label: "Hisn tries — refused", run: async () => void (await knock()) },
      {
        label: "Hisn asks for permission",
        run: async () => {
          const s = await authorityApi.suggest({ agentId: AGENT_ID, capability: CAPABILITY, serverId: system.serverId });
          lease = await authorityApi.request({
            requestingEntityId: REQUESTER,
            ownerEntityId: OWNER,
            agentId: AGENT_ID,
            capability: CAPABILITY,
            scope: { serverIds: [system.serverId] },
            justification: s.justification,
            durationSec: s.durationSec,
          });
        },
      },
      {
        label: "The owner says yes",
        run: async () => {
          if (!lease) throw new Error("no permission to accept");
          const res = (await authorityApi.accept(lease.id, OWNER)) as AuthorityLease & { stepUpCode?: string };
          code = res.stepUpCode;
          if (res.status === "pending-step-up" && !code) throw new Error("The one-time code is only shown when the server runs in demo mode.");
        },
      },
      {
        label: "A person enters the one-time code",
        run: async () => {
          if (lease && code) await authorityApi.stepUp(lease.id, code);
        },
      },
      { label: "Hisn tries again — allowed", run: async () => void (await knock()) },
      {
        label: "The owner takes it back",
        run: async () => {
          if (lease) await authorityApi.revoke(lease.id, OWNER, "Drill over");
        },
      },
      { label: "Hisn tries once more — refused", run: async () => void (await knock()) },
    ];

    try {
      for (const beat of beats) {
        setPlaying(beat.label);
        await beat.run();
        await refresh();
        await pause(BEAT_MS);
      }
      toast.success("That is the whole story. Every line on the right was written by the server.");
    } catch (e) {
      if (!(e instanceof Stopped)) toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Auto-play stopped");
    } finally {
      setPlaying(null);
      await refresh();
    }
  };

  if (playing) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-lime" aria-hidden />
          <span className="text-[12.5px] text-text-2">{playing}</span>
          <Button variant="ghost" size="sm" onClick={() => (stopRef.current = true)} className="gap-1.5 text-text-3">
            <Stop className="size-3.5" weight="fill" /> Stop
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void play()} className={className} data-cuelume-press>
      <FastForward className="size-3.5" weight="fill" /> Auto-play
    </Button>
  );
}
