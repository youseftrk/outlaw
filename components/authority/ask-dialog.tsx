"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Sparkle, X } from "@phosphor-icons/react";

import type { Directory } from "@/components/authority/permission-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  authorityApi,
  durationLabel,
  useRefreshAuthority,
} from "@/lib/hooks/use-authority";
import {
  CAPABILITY_LABEL,
  type Capability,
  type PermissionSuggestion,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const CAPS = Object.keys(CAPABILITY_LABEL) as Capability[];
const DURATIONS = [15 * 60, 30 * 60, 60 * 60, 2 * 60 * 60, 4 * 60 * 60];

const CAP_HELP: Record<Capability, string> = {
  observe: "Read signals from the system. Changes nothing.",
  contain: "Cut the system off from the network for a while.",
  credentials: "Reset passwords and keys on the system.",
  data: "Move data into quarantine.",
  repair: "Apply a fix and restart the system.",
};

/**
 * Ask an owner for permission in five plain fields. "Suggest for me" fills them with the
 * smallest request that fits the owner's house rules — the person still sends it.
 */
type AskProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dir: Directory;
  requestingEntityId: string;
  defaults?: { agentId?: string; capability?: Capability; serverId?: string };
  incidentId?: string;
};

export function AskDialog(props: AskProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <AskForm {...props} />}
    </Dialog>
  );
}

function AskForm({
  onOpenChange,
  dir,
  requestingEntityId,
  defaults,
  incidentId,
}: AskProps) {
  const refresh = useRefreshAuthority();
  const ownedServers = dir.servers.filter(
    (s) => s.ownerEntityId && s.ownerEntityId !== requestingEntityId,
  );
  const agents = dir.agents;

  const [agentId, setAgentId] = React.useState(
    defaults?.agentId ?? agents[0]?.id ?? "",
  );
  const [capability, setCapability] = React.useState<Capability>(
    defaults?.capability ?? "observe",
  );
  const [serverId, setServerId] = React.useState(
    defaults?.serverId ?? ownedServers[0]?.id ?? "",
  );
  const [durationSec, setDurationSec] = React.useState(60 * 60);
  const [why, setWhy] = React.useState("");
  const [suggestion, setSuggestion] =
    React.useState<PermissionSuggestion | null>(null);
  const [busy, setBusy] = React.useState<"suggest" | "send" | null>(null);

  const server = dir.servers.find((s) => s.id === serverId);
  const owner = dir.entities.find((e) => e.id === server?.ownerEntityId);

  const suggest = async () => {
    setBusy("suggest");
    try {
      const s = await authorityApi.suggest({
        incidentId,
        agentId,
        capability,
        serverId,
      });
      setSuggestion(s);
      setCapability(s.capability);
      setDurationSec(s.durationSec);
      setWhy(s.justification);
      if (s.scope.serverIds?.[0]) setServerId(s.scope.serverIds[0]);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not build a suggestion",
      );
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!owner || !server) return;
    setBusy("send");
    try {
      await authorityApi.request({
        requestingEntityId,
        ownerEntityId: owner.id,
        agentId,
        capability,
        scope: { serverIds: [server.id] },
        justification: why.trim(),
        incidentId,
        durationSec,
      });
      toast.success(
        `Asked ${owner.shortName}. Nothing happens until they say yes.`,
      );
      await refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not send the request",
      );
    } finally {
      setBusy(null);
    }
  };

  const items = <T extends string>(xs: readonly { id: T; label: string }[]) =>
    Object.fromEntries(xs.map((x) => [x.id, x.label]));

  return (
    <DialogContent className="border-line bg-bg-1 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Ask for permission</DialogTitle>
        <DialogDescription>
          Say who, what, where, how long and why. The owner decides; the agent
          is refused until they say yes.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <Field label="Which agent">
          <Select
            value={agentId}
            onValueChange={(v) => setAgentId(v ?? "")}
            items={items(
              agents.map((a) => ({ id: a.id, label: `${a.name} · ${a.role}` })),
            )}
          >
            <SelectTrigger className="border-line bg-bg-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-line bg-bg-3">
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {a.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="What it may do" hint={CAP_HELP[capability]}>
          <Select
            value={capability}
            onValueChange={(v) => setCapability((v as Capability) ?? "observe")}
            items={CAPABILITY_LABEL}
          >
            <SelectTrigger className="border-line bg-bg-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-line bg-bg-3">
              {CAPS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CAPABILITY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Where"
          hint={owner ? `Owned by ${owner.name}` : undefined}
        >
          <Select
            value={serverId}
            onValueChange={(v) => setServerId(v ?? "")}
            items={items(
              ownedServers.map((s) => ({ id: s.id, label: s.hostname })),
            )}
          >
            <SelectTrigger className="border-line bg-bg-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-line bg-bg-3">
              {ownedServers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.hostname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="For how long">
          <Select
            value={String(durationSec)}
            onValueChange={(v) => setDurationSec(Number(v ?? 3600))}
            items={Object.fromEntries(
              DURATIONS.map((d) => [String(d), durationLabel(d)]),
            )}
          >
            <SelectTrigger className="border-line bg-bg-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-line bg-bg-3">
              {DURATIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {durationLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Why">
          <Textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={3}
            placeholder="One or two sentences the owner will read."
            className="border-line bg-bg-2"
          />
        </Field>

        {suggestion && suggestion.terms.length > 0 && (
          <ul
            className="flex flex-col gap-1 rounded-md border border-line bg-bg-2/60 p-3 text-[12.5px]"
            aria-label="How the suggestion fits the owner's rules"
          >
            {suggestion.terms.map((t) => (
              <li key={t.label} className="flex items-start gap-2">
                {t.allowed ? (
                  <Check
                    weight="bold"
                    className="mt-0.5 size-3.5 shrink-0 text-lime"
                  />
                ) : (
                  <X
                    weight="bold"
                    className="mt-0.5 size-3.5 shrink-0 text-sev-critical"
                  />
                )}
                <span className={cn(t.allowed ? "text-text-2" : "text-text-1")}>
                  {t.label} <span className="text-text-3">— {t.why}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        <Button
          variant="ghost"
          onClick={suggest}
          loading={busy === "suggest"}
          disabled={busy !== null}
          className="gap-1.5"
        >
          <Sparkle weight="fill" className="size-3.5 text-lime" /> Suggest for
          me
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={busy !== null}
          >
            Cancel
          </Button>
          <Button
            onClick={send}
            loading={busy === "send"}
            disabled={busy !== null || !owner || why.trim().length < 8}
            data-cuelume-press
          >
            Ask {owner?.shortName ?? "the owner"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[12px] text-text-2">{label}</Label>
      {children}
      {hint && <p className="text-[11.5px] text-text-3">{hint}</p>}
    </div>
  );
}
