/** Run scoring (SPEC §9): grade + vsBaseline. */
import type { RangeRun, RangeScore } from "@/lib/types";
import { store } from "../store";
import { HF_2026, LABEL_DATES, REAL_DETECTION_DATE } from "./scenarios/hf-2026";

export function scoreRun(run: RangeRun): RangeScore {
  const w = store.s.world;
  const blocked = run.stepResults.filter((r) => r.status === "blocked").length;
  const succeeded = run.stepResults.filter((r) => r.status === "succeeded").length;

  const linkedThreats = store.s.threats.filter((t) => t.rangeRunId === run.id);
  const detectedThreat = linkedThreats.length ? linkedThreats : store.s.threats.filter((t) => Date.parse(t.detectedAt) >= Date.parse(run.startedAt));

  const detectedAtMs = detectedThreat.length
    ? Math.min(...detectedThreat.map((t) => Date.parse(t.detectedAt))) - Date.parse(run.startedAt)
    : undefined;
  const firstBlocked = run.stepResults.find((r) => r.status === "blocked" && r.at);
  const containedAtMs = firstBlocked?.at
    ? Date.parse(firstBlocked.at) - Date.parse(run.startedAt)
    : detectedThreat.some((t) => t.status === "contained" || t.status === "neutralized" || t.status === "prevented")
      ? Math.min(...detectedThreat.filter((t) => t.resolvedAt).map((t) => Date.parse(t.resolvedAt!))) - Date.parse(run.startedAt)
      : undefined;

  const maxSucceeded = Math.max(0, ...run.stepResults.map((r, i) => (r.status === "succeeded" ? i + 1 : 0)));
  const grade: RangeScore["grade"] =
    maxSucceeded <= 5 ? "S" : maxSucceeded <= 7 ? "A" : maxSucceeded <= 9 ? "B" : maxSucceeded <= 11 ? "C" : maxSucceeded <= 13 ? "D" : "F";

  // detection speedup vs real world (Jul 14 detection)
  const firstDetectedStepIdx = detectedAtMs !== undefined
    ? Math.max(0, ...detectedThreat.map((t) => {
        const stepIdx = run.stepResults.findIndex((r) => r.threatId === t.id || (r.at && Math.abs(Date.parse(r.at) - Date.parse(t.detectedAt)) < 45_000));
        return stepIdx;
      }))
    : -1;
  const detectedLabel = firstDetectedStepIdx >= 0 ? LABEL_DATES[firstDetectedStepIdx + 1] ?? "Jul 14" : null;
  const speedupLabel = detectedLabel && detectedAtMs !== undefined
    ? (() => {
        const days = Math.round((Date.parse(REAL_DETECTION_DATE) - Date.parse(detectedLabel)) / 86400_000);
        return days > 0 ? `caught at '${detectedLabel}' — ${days} days before the real detection` : "detected at real-world pace";
      })()
    : run.mode === "baseline" ? "baseline — detected at Jul 14 (real-world pace)" : "not detected";

  const infraRebuiltPct = Math.round(
    (store.s.servers.filter((s) => ["compromised", "rebuilding", "isolated"].includes(s.status)).length / Math.max(1, store.s.servers.length)) * 100
  );
  const credentialsHarvested = w.secrets.filter((s) => s.attackerHeld).length;
  const datasetsAccessed = w.attacker.datasetsRead.length;
  const blastRadius = Math.max(0, Math.min(100,
    Math.round(100 - (infraRebuiltPct / Math.max(1, HF_2026.baseline.infraRebuiltPct)) * 50 - (credentialsHarvested / Math.max(1, HF_2026.baseline.credentialsHarvested)) * 25 - (datasetsAccessed / Math.max(1, HF_2026.baseline.datasetsAccessed)) * 25)
  ));

  return {
    detectedAtMs,
    containedAtMs,
    stagesTotal: 14,
    stagesBlocked: blocked,
    stagesSucceeded: succeeded,
    credentialsHarvested,
    datasetsAccessed,
    nodesCompromised: w.clusters.reduce((n, c) => n + c.compromisedNodeIds.length, 0),
    serversIsolated: store.s.servers.filter((s) => s.status === "isolated").length,
    approvalsRequested: store.s.approvals.filter((a) => Date.parse(a.requestedAt) >= Date.parse(run.startedAt)).length,
    falsePositives: detectedThreat.filter((t) => t.status === "false-positive").length,
    grade,
    vsBaseline: { detectionSpeedupLabel: speedupLabel, blastRadiusReductionPct: blastRadius },
  };
}
