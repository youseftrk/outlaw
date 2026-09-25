"use client";

import * as React from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, Clock, Power } from "@phosphor-icons/react";

import { AgentAvatar } from "@/components/shell/agent-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { STATUS_LABEL, authorityApi, durationLabel, scopeLabel, useRefreshAuthority } from "@/lib/hooks/use-authority";
import { ago } from "@/lib/format";
import { CAPABILITY_LABEL, type Agent, type AuthorityLease, type Entity, type Server } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface Directory {
  entities: Entity[];
  agents: Agent[];
  servers: Server[];
}

export function useDirectoryNames(dir: Directory) {
  return React.useMemo(
    () => ({
      entity: (id?: string) => dir.entities.find((e) => e.id === id)?.name ?? id ?? "—",
      entityShort: (id?: string) => dir.entities.find((e) => e.id === id)?.shortName ?? id ?? "—",
      agent: (id?: string) => dir.agents.find((a) => a.id === id)?.name ?? id ?? "—",
      host: (id: string) => dir.servers.find((s) => s.id === id)?.hostname ?? id,
    }),
    [dir],
  );
}

const STATUS_CLASS: Record<AuthorityLease["status"], string> = {
  pending: "border-sev-medium/40 text-sev-medium",
  "pending-step-up": "border-sev-medium/40 text-sev-medium",
  active: "border-lime/40 text-lime",
  expired: "border-line text-text-3",
  revoked: "border-sev-critical/40 text-sev-critical",
  declined: "border-line text-text-3",
};

function TimeLeft({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className="mono-data tabular-nums text-text-2" aria-label="time left">
      {m}:{s.toString().padStart(2, "0")} left
    </span>
  );
}

/**
 * One permission, readable by anyone: who asked, who owns the system, what the agent
 * may do, where, for how long — and the switch that takes it back.
 */
export function PermissionCard({
  lease,
  dir,
  actingAs,
  compact,
  className,
}: {
  lease: AuthorityLease;
  dir: Directory;
  /** the entity the viewer is acting for; owners get the switch and the accept/decline buttons */
  actingAs: string;
  compact?: boolean;
  className?: string;
}) {
  const names = useDirectoryNames(dir);
  const refresh = useRefreshAuthority();
  const isOwner = actingAs === lease.ownerEntityId;
  const [busy, setBusy] = React.useState<"accept" | "decline" | "revoke" | "code" | null>(null);
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [issuedCode, setIssuedCode] = React.useState<string | null>(null);
  const by = names.entityShort(actingAs);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<unknown>, ok: string) => {
    setBusy(kind);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const accept = () =>
    run(
      "accept",
      async () => {
        const res = (await authorityApi.accept(lease.id, by)) as AuthorityLease & { stepUpCode?: string };
        if (res.stepUpCode) setIssuedCode(res.stepUpCode);
      },
      lease.stepUpRequired ? "Accepted — a one-time code is now needed" : "Permission is on",
    );
  const decline = () => run("decline", () => authorityApi.decline(lease.id, by), "Said no");
  const revoke = () =>
    run("revoke", () => authorityApi.revoke(lease.id, by), "Permission taken back — the next attempt is refused").then(() => setConfirmRevoke(false));
  const enterCode = () =>
    run(
      "code",
      async () => {
        await authorityApi.stepUp(lease.id, code.trim());
        setCode("");
        setIssuedCode(null);
      },
      "Code accepted — permission is on",
    );

  const on = lease.status === "active";
  const waiting = lease.status === "pending" || lease.status === "pending-step-up";

  return (
    <Card
      data-slot="permission"
      data-status={lease.status}
      className={cn(
        "bezel-core relative gap-0 overflow-hidden border-0 p-0 transition-shadow",
        on && "shadow-[inset_0_0_0_1px_rgba(208,255,120,0.25)]",
        lease.status === "revoked" && "shadow-[inset_0_0_0_1px_rgba(255,93,108,0.25)]",
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <AgentAvatar agentId={lease.agentId} size={compact ? 32 : 40} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium text-text-1">
              {names.agent(lease.agentId)} <span className="text-text-3">may</span> {CAPABILITY_LABEL[lease.capability].toLowerCase()}
            </p>
            <Badge variant="outline" className={cn("mono-data h-5 text-[10.5px] uppercase", STATUS_CLASS[lease.status])}>
              {STATUS_LABEL[lease.status]}
            </Badge>
          </div>
          <p className="mt-0.5 text-[13px] text-text-2">
            on <span className="text-text-1">{scopeLabel(lease.scope, names.host)}</span> · owned by{" "}
            <span className="text-text-1">{names.entity(lease.ownerEntityId)}</span>
          </p>
          {!compact && (
            <p className="mt-2 text-[13px] text-text-2">
              <span className="text-text-3">Why:</span> {lease.justification}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-3">
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> {durationLabel(lease.durationSec)}
            </span>
            <span>
              asked by {names.entityShort(lease.requestingEntityId)} {ago(lease.requestedAt)}
            </span>
            {lease.acceptedBy && <span>accepted by {lease.acceptedBy}</span>}
            {on && lease.expiresAt && <TimeLeft expiresAt={lease.expiresAt} />}
            {lease.status === "revoked" && (
              <span className="text-sev-critical">
                taken back by {lease.revokedBy} {ago(lease.revokedAt)}
              </span>
            )}
            {lease.uses > 0 && <span>used {lease.uses}×</span>}
          </div>
        </div>

        {isOwner && (on || lease.status === "revoked" || lease.status === "expired") && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Switch
              aria-label={on ? "Take this permission back" : "Permission is off"}
              checked={on}
              disabled={!on || busy !== null}
              onCheckedChange={(next) => {
                if (!next) setConfirmRevoke(true);
              }}
              data-cuelume-toggle
            />
            <span className="text-[11px] text-text-3">{on ? "On" : "Off"}</span>
          </div>
        )}
      </div>

      {isOwner && lease.status === "pending" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-bg-2/60 px-4 py-3">
          <p className="mr-auto text-[13px] text-text-2">{names.entityShort(lease.ownerEntityId)} decides. Nothing happens until you say yes.</p>
          <Button size="sm" variant="secondary" loading={busy === "decline"} disabled={busy !== null} onClick={decline}>
            No
          </Button>
          <Button size="sm" loading={busy === "accept"} disabled={busy !== null} onClick={accept} data-cuelume-press className="gap-1.5">
            Yes, allow it <ArrowRight weight="bold" className="size-3.5" />
          </Button>
        </div>
      )}

      {lease.status === "pending-step-up" && (
        <div className="flex flex-col gap-2 border-t border-line bg-bg-2/60 px-4 py-3">
          <p className="text-[13px] text-text-2">
            This is a powerful action, so a person at {names.entityShort(lease.ownerEntityId)} must type the one-time code before it starts.
            {issuedCode ? (
              <>
                {" "}
                Your code: <span className="mono-data rounded bg-bg-3 px-1.5 py-0.5 text-text-1">{issuedCode}</span>
              </>
            ) : (
              " It was sent to the owner's Messages."
            )}
          </p>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) void enterCode();
            }}
          >
            <Label htmlFor={`code-${lease.id}`} className="sr-only">
              One-time code
            </Label>
            <Input
              id={`code-${lease.id}`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="mono-data h-8 w-36 border-line bg-bg-1 tracking-[0.2em]"
            />
            <Button size="sm" type="submit" loading={busy === "code"} disabled={busy !== null || code.trim().length < 4} data-cuelume-press>
              Confirm
            </Button>
          </form>
        </div>
      )}

      {!isOwner && waiting && (
        <div className="border-t border-line bg-bg-2/60 px-4 py-2.5 text-[13px] text-text-3">
          Waiting for {names.entity(lease.ownerEntityId)}. The agent is refused until they say yes.
        </div>
      )}

      <Dialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <DialogContent className="border-line bg-bg-1 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Power weight="bold" className="size-4 text-sev-critical" /> Take this permission back?
            </DialogTitle>
            <DialogDescription>
              {names.agent(lease.agentId)} will be refused on the very next attempt to {CAPABILITY_LABEL[lease.capability].toLowerCase()} on{" "}
              {scopeLabel(lease.scope, names.host)}. This is written to the record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmRevoke(false)} disabled={busy !== null}>
              Keep it on
            </Button>
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button variant="destructive" onClick={revoke} loading={busy === "revoke"} disabled={busy !== null} data-cuelume-press>
                Take it back now
              </Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
