/**
 * Telemetry channel — the ONLY path from the range/attacker into the
 * agents' observable world. Emits TelemetrySignal to the ring buffer + bus.
 */
import type { Severity, TelemetrySignal } from "@/lib/types";
import { bus } from "./bus";
import { ids } from "./ids";
import { store } from "./store";

export interface EmitSignalOpts {
  serverId?: string;
  cluster?: string;
  severity?: Severity;
  attributes?: Record<string, string | number | boolean>;
  at?: string;
}

export function emitSignal(
  signal: TelemetrySignal["signal"],
  opts: EmitSignalOpts = {}
): TelemetrySignal {
  const sig: TelemetrySignal = {
    id: ids.telemetry(),
    at: opts.at ?? store.now(),
    serverId: opts.serverId,
    cluster: opts.cluster,
    signal,
    severity: opts.severity ?? "info",
    attributes: opts.attributes ?? {},
  };
  store.pushTelemetry(sig);
  const host = sig.serverId ? store.server(sig.serverId)?.hostname : undefined;
  bus.emit("telemetry", sig, {
    severity: sig.severity,
    summary: `${sig.signal}${host ? ` on ${host}` : ""}`,
    href: sig.serverId ? `/fleet?server=${sig.serverId}` : undefined,
  });
  store.markDirty();
  return sig;
}

/** Telemetry inside a rolling sim-time window (seconds). */
export function telemetryWindow(seconds: number): TelemetrySignal[] {
  const cutoff = store.s.simNowMs - seconds * 1000;
  return store.s.telemetry.filter((t) => new Date(t.at).getTime() >= cutoff);
}
