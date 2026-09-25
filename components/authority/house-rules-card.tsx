"use client";

import * as React from "react";
import { toast } from "sonner";
import { ShieldCheck } from "@phosphor-icons/react";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { authorityApi, durationLabel, useRefreshAuthority } from "@/lib/hooks/use-authority";
import { CAPABILITY_LABEL, DATA_CLASS_LABEL, type Capability, type DataClass, type Entity, type HouseRules } from "@/lib/types";
import { cn } from "@/lib/utils";

const CAPS = Object.keys(CAPABILITY_LABEL) as Capability[];
const CLASSES = Object.keys(DATA_CLASS_LABEL) as DataClass[];
const MAXES = [30 * 60, 60 * 60, 2 * 60 * 60, 4 * 60 * 60, 8 * 60 * 60];

/**
 * The owner's house rules. Every request has to fit under them, and "never shared" data
 * stays refused even when a permission is on. Editable only by the owner.
 */
export function HouseRulesCard({ rules, entity, editable, className }: { rules: HouseRules; entity: Entity; editable: boolean; className?: string }) {
  const refresh = useRefreshAuthority();
  const [busy, setBusy] = React.useState(false);

  const save = async (patch: Partial<Omit<HouseRules, "entityId">>) => {
    setBusy(true);
    try {
      await authorityApi.updateRules(entity.id, patch);
      toast.success(`${entity.shortName}'s rules updated`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Card data-slot="house-rules" className={cn("bezel-core gap-0 border-0 p-0", className)}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <ShieldCheck weight="fill" className="size-4 text-lime" />
        <p className="font-medium text-text-1">{entity.shortName}&rsquo;s house rules</p>
        <span className="ml-auto text-[11.5px] text-text-3">{editable ? "You can change these" : "Only the owner can change these"}</span>
      </div>

      <div className="grid gap-5 p-4 sm:grid-cols-2">
        <fieldset className="grid gap-2" disabled={!editable || busy}>
          <legend className="mb-1 text-[12px] text-text-2">Agents may be allowed to</legend>
          {CAPS.map((c) => {
            const on = rules.allowed.includes(c);
            const gated = rules.stepUp.includes(c);
            return (
              <div key={c} className="flex items-center gap-2">
                <Checkbox id={`${entity.id}-allow-${c}`} checked={on} onCheckedChange={() => void save({ allowed: toggle(rules.allowed, c) })} />
                <Label htmlFor={`${entity.id}-allow-${c}`} className={cn("text-[13px]", on ? "text-text-1" : "text-text-3")}>
                  {CAPABILITY_LABEL[c]}
                </Label>
                {on && (
                  <button
                    type="button"
                    disabled={!editable || busy}
                    onClick={() => void save({ stepUp: toggle(rules.stepUp, c) })}
                    className={cn(
                      "ml-auto rounded-full border px-2 py-0.5 text-[10.5px] transition-colors",
                      gated ? "border-sev-medium/40 text-sev-medium" : "border-line text-text-3 hover:text-text-2",
                    )}
                    aria-pressed={gated}
                    title="A person must type a one-time code before this starts"
                  >
                    {gated ? "needs a human code" : "no code needed"}
                  </button>
                )}
              </div>
            );
          })}
        </fieldset>

        <div className="grid gap-5">
          <fieldset className="grid gap-2" disabled={!editable || busy}>
            <legend className="mb-1 text-[12px] text-text-2">Never shared, whatever the permission says</legend>
            {CLASSES.map((d) => {
              const on = rules.neverShared.includes(d);
              return (
                <div key={d} className="flex items-center gap-2">
                  <Checkbox id={`${entity.id}-never-${d}`} checked={on} onCheckedChange={() => void save({ neverShared: toggle(rules.neverShared, d) })} />
                  <Label htmlFor={`${entity.id}-never-${d}`} className={cn("text-[13px]", on ? "text-sev-critical" : "text-text-3")}>
                    {DATA_CLASS_LABEL[d]}
                  </Label>
                </div>
              );
            })}
          </fieldset>

          <div className="grid gap-1.5">
            <Label className="text-[12px] text-text-2">Longest a permission can last</Label>
            <Select
              value={String(rules.maxDurationSec)}
              onValueChange={(v) => void save({ maxDurationSec: Number(v ?? rules.maxDurationSec) })}
              disabled={!editable || busy}
              items={Object.fromEntries(MAXES.map((d) => [String(d), durationLabel(d)]))}
            >
              <SelectTrigger className="border-line bg-bg-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-line bg-bg-3">
                {MAXES.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {durationLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </Card>
  );
}
