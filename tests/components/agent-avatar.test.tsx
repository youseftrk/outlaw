// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import "./setup";

vi.mock("bot-avatars", () => ({
  BotAvatar: (props: Record<string, unknown>) => (
    <svg data-testid="bot" data-type={props.type} data-color={props.color} data-state={props.state} data-size={props.size} />
  ),
}));

import { AgentAvatar, AGENT_LOOK, agentLook, avatarState } from "@/components/shell/agent-avatar";

describe("AgentAvatar", () => {
  it("gives each of the six agents a distinct look and falls back for unknown ids", () => {
    const ids = ["agt-saqr", "agt-hisn", "agt-athar", "agt-miftah", "agt-rahhal", "agt-bawwab"];
    const looks = ids.map((id) => agentLook(id));
    expect(new Set(looks.map((l) => l.type)).size).toBe(6);
    expect(new Set(looks.map((l) => l.color)).size).toBe(6);
    expect(Object.keys(AGENT_LOOK)).toEqual(ids);
    expect(agentLook("agt-unknown")).toEqual({ type: "clover", color: "#9DB9C3", seed: 0.5 });
  });

  it("maps agent status onto the avatar animation state", () => {
    expect(avatarState("investigating")).toBe("working");
    expect(avatarState("acting")).toBe("working");
    expect(avatarState("paused")).toBe("sleeping");
    expect(avatarState("idle")).toBe("sleeping");
    expect(avatarState("awaiting-approval")).toBe("default");
    expect(avatarState(undefined)).toBe("default");
  });

  it("renders a decorative, sized wrapper around the sourced BotAvatar", () => {
    const { container, getByTestId } = render(<AgentAvatar agentId="agt-saqr" status="acting" size={32} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.style.width).toBe("32px");
    expect(wrapper.style.height).toBe("32px");
    const bot = getByTestId("bot");
    expect(bot.dataset.type).toBe("star");
    expect(bot.dataset.color).toBe("#D0FF78");
    expect(bot.dataset.state).toBe("working");
    expect(bot.dataset.size).toBe("32");
  });

  it("takes the id from the agent object and lets an explicit status override it", () => {
    const { getByTestId, rerender } = render(<AgentAvatar agent={{ id: "agt-rahhal", status: "paused" }} agentId="agt-athar" />);
    expect(getByTestId("bot").dataset.type).toBe("square");
    expect(getByTestId("bot").dataset.state).toBe("sleeping");
    rerender(<AgentAvatar agent={{ id: "agt-rahhal", status: "paused" }} status="acting" />);
    expect(getByTestId("bot").dataset.state).toBe("working");
  });
});
