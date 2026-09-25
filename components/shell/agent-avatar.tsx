"use client";

/**
 * Maps a Qalaa agent onto libraries.dev `bot-avatars` (sourced component).
 * Each agent has a fixed body shape + brand colour so they're recognisable everywhere.
 */
import { BotAvatar } from "bot-avatars";
import type { Agent, AgentStatus } from "@/lib/types";

type Shape = "star" | "triangle" | "hexagon" | "flower" | "square" | "ghost" | "clover";

export const AGENT_LOOK: Record<string, { type: Shape; color: string; seed: number }> = {
  "agt-cassidy": { type: "star", color: "#D0FF78", seed: 0.05 },
  "agt-sundance": { type: "triangle", color: "#24C7D6", seed: 0.22 },
  "agt-doc": { type: "hexagon", color: "#7FD1DC", seed: 0.41 },
  "agt-belle": { type: "flower", color: "#61E7DB", seed: 0.58 },
  "agt-ringo": { type: "square", color: "#10B6CB", seed: 0.73 },
  "agt-calamity": { type: "ghost", color: "#D0FFC8", seed: 0.9 },
};

export function agentLook(agentId: string) {
  return AGENT_LOOK[agentId] ?? { type: "clover" as Shape, color: "#9DB9C3", seed: 0.5 };
}

export function avatarState(status?: AgentStatus): "default" | "working" | "sleeping" {
  if (status === "investigating" || status === "acting") return "working";
  if (status === "paused" || status === "idle") return "sleeping";
  return "default";
}

export function AgentAvatar({
  agent,
  agentId,
  status,
  size = 40,
  face = "eyes",
  interactive = false,
  className,
}: {
  agent?: Pick<Agent, "id" | "status">;
  agentId?: string;
  status?: AgentStatus;
  size?: number;
  face?: "eyes" | "mouth";
  interactive?: boolean;
  className?: string;
}) {
  const id = agent?.id ?? agentId ?? "";
  const look = agentLook(id);
  return (
    <span className={className} style={{ display: "inline-flex", width: size, height: size }} aria-hidden>
      <BotAvatar
        type={look.type}
        color={look.color}
        seed={look.seed}
        size={size}
        face={face}
        state={avatarState(status ?? agent?.status)}
        interactive={interactive}
        theme="dark"
        turn={0.6}
        jumpEvery={interactive ? 8 : 0}
      />
    </span>
  );
}
