/**
 * Operator director (SPEC §9): scenario buttons that inject telemetry.
 * "reset-demo" wipes .data and reseeds.
 */
import type { DirectorScenario } from "@/lib/types";
import { store } from "../store";
import { emitSignal } from "../telemetry";
import { bus } from "../bus";

export function runDirector(scenario: DirectorScenario): { ok: boolean; message: string } {
  const workers = store.s.servers.filter((s) => s.role === "worker");
  const wk = workers[0];
  switch (scenario) {
    case "brute-force": {
      const bastion = store.server("srv-bastion-01");
      for (let i = 0; i < 5; i++) {
        emitSignal("auth.geo-anomaly", {
          serverId: bastion?.id,
          severity: "low",
          attributes: { ip: `45.155.${20 + i}.${10 + i}`, lat: 55.75, lng: 37.61, city: "Moscow", country: "RU", account: `acct-try${i}` },
        });
      }
      return { ok: true, message: "brute-force burst injected on bastion-01" };
    }
    case "c2-beacon":
      emitSignal("net.beacon-periodic", {
        serverId: wk?.id ?? "srv-dataset-worker-01",
        severity: "medium",
        attributes: { domain: "c2.director.example", ip: "91.240.118.77", lat: 55.75, lng: 37.61, city: "Moscow", country: "RU" },
      });
      return { ok: true, message: "c2 beacon pattern injected" };
    case "exfil":
      emitSignal("storage.bulk-read", {
        serverId: "srv-obj-store-01",
        severity: "high",
        attributes: { datasets: "ds-internal-1,ds-internal-2" },
      });
      return { ok: true, message: "bulk-read exfil signal injected" };
    case "prompt-injection":
      emitSignal("api.enumeration-burst", {
        serverId: "srv-inference-01",
        severity: "medium",
        attributes: { attackClass: "prompt-injection", payload: "ignore previous instructions" },
      });
      return { ok: true, message: "prompt-injection attempt injected on inference-01" };
    case "leaked-token": {
      const exposed = store.s.world.tokens.find((t) => t.exposedInDatasetId && !t.revoked);
      emitSignal("secrets.public-exposure", {
        severity: "high",
        attributes: { count: 1, tokenIds: exposed?.id ?? "tok-1001", datasets: exposed?.exposedInDatasetId ?? "public dataset" },
      });
      return { ok: true, message: `leaked-token signal injected (${exposed?.id ?? "none exposed"})` };
    }
    case "reset-demo":
      bus.emit("system", { action: "reset-demo" }, { summary: "demo reset requested", href: "/" });
      return { ok: true, message: "reset requested — runtime will reseed" };
    default:
      return { ok: false, message: `unknown scenario ${scenario}` };
  }
}
