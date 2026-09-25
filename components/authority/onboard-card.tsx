"use client";

import * as React from "react";
import { ShieldCheck } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { authorityApi, useEntities, useRefreshAuthority } from "@/lib/hooks/use-authority";
import { DATA_CLASS_LABEL, type DataClass, type DrillState } from "@/lib/types";
import { cn } from "@/lib/utils";

const CLASSES = Object.keys(DATA_CLASS_LABEL) as DataClass[];

/**
 * The first thing an organisation does with Qalaa: put one of its systems under
 * an owner. Until then nobody can ask, grant or take anything back on it.
 */
export function OnboardCard({ system, className }: { system: DrillState["system"]; className?: string }) {
  const { data: entities = [] } = useEntities();
  const refresh = useRefreshAuthority();
  const owners = entities.filter((e) => !e.operatesAgents);
  const [ownerId, setOwnerId] = React.useState<string>("");
  const [classes, setClasses] = React.useState<DataClass[]>(system.dataClasses.length ? system.dataClasses : ["personal-data"]);
  const [busy, setBusy] = React.useState(false);

  const owner = owners.find((o) => o.id === ownerId) ?? owners[0];

  const toggle = (c: DataClass) => setClasses((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const submit = async () => {
    if (!owner) return;
    setBusy(true);
    try {
      await authorityApi.onboard({ serverId: system.serverId, ownerEntityId: owner.id, dataClasses: classes });
      toast.success(`${system.hostname} is now under ${owner.shortName}. Nothing touches it without their say.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not onboard the system");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-slot="onboard-card" className={cn("flex flex-col gap-4 rounded-[14px] border border-line bg-bg-2 p-4", className)}>
      <div>
        <p className="eyebrow mb-1">Onboard a system</p>
        <p className="font-display text-[18px] leading-snug text-text-1">{system.hostname}</p>
        <p className="mt-1 text-[13px] text-text-2">
          Two answers and it is protected: who owns it, and what kind of data lives on it. From then on, an agent from any other organisation needs the owner&rsquo;s permission to touch it.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[12px] text-text-3">Who owns it?</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Owner">
          {owners.map((o) => {
            const on = o.id === owner?.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setOwnerId(o.id)}
                className={cn(
                  "rounded-[10px] border px-3 py-1.5 text-left text-[13px] transition-colors",
                  on ? "border-lime bg-lime/10 text-text-1" : "border-line text-text-2 hover:border-line-strong",
                )}
              >
                <span className="block">{o.name}</span>
                <span className="block text-[11.5px] text-text-3">{o.shortName}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[12px] text-text-3">What data lives on it?</legend>
        <div className="flex flex-wrap gap-2">
          {CLASSES.map((c) => {
            const on = classes.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  on ? "border-lime bg-lime/10 text-text-1" : "border-line text-text-3 hover:border-line-strong",
                )}
              >
                {DATA_CLASS_LABEL[c]}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-text-3">Owners can mark some of this as never shared, whatever a permission says.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} loading={busy} disabled={busy || !owner} className="gap-1.5">
          <ShieldCheck weight="fill" className="size-3.5" /> Put it under {owner?.shortName ?? "an owner"}
        </Button>
        <span className="text-[12.5px] text-text-3">This is written on the record too.</span>
      </div>
    </div>
  );
}
