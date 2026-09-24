/**
 * Ambient noise (SPEC §2/§9): continuous background telemetry so the
 * dashboard is alive — brute force, credential stuffing, recon scans,
 * prompt-injection attempts, config drift — from varied geos.
 * Brain correlates these into routine (low/medium) threats.
 */
import type { TelemetrySignal } from "@/lib/types";
import { makeRng } from "../rng";
import { store } from "../store";
import { emitSignal } from "../telemetry";

const ORIGINS = [
  { ip: "185.220.101.9", lat: 52.52, lng: 13.4, city: "Berlin", country: "DE", actor: "Tor exit" },
  { ip: "185.220.102.17", lat: 52.37, lng: 4.9, city: "Amsterdam", country: "NL", actor: "Tor exit" },
  { ip: "103.75.190.42", lat: 21.03, lng: 105.85, city: "Hanoi", country: "VN", actor: "residential proxy" },
  { ip: "177.54.144.90", lat: -23.55, lng: -46.63, city: "São Paulo", country: "BR", actor: "bulletproof host" },
  { ip: "91.240.118.33", lat: 55.75, lng: 37.61, city: "Moscow", country: "RU", actor: "VPS" },
  { ip: "119.123.44.87", lat: 22.54, lng: 114.06, city: "Shenzhen", country: "CN", actor: "residential proxy" },
  { ip: "73.41.208.92", lat: 32.77, lng: -96.8, city: "Dallas", country: "US", actor: "residential proxy" },
];

let rng = makeRng("outlaw-2026:noise");
let noiseTick = 0;

export function noiseReset(): void {
  rng = makeRng("outlaw-2026:noise");
  noiseTick = 0;
}

/** Called every tick — emits a handful of signals per sim-minute. */
export function tickNoise(): void {
  noiseTick++;
  // ~2 signals/min at 1× → ~3.3% chance per tick
  if (!rng.chance(0.033)) return;
  const servers = store.s.servers.filter((s) => s.status === "healthy" || s.status === "degraded");
  if (!servers.length) return;
  const origin = rng.pick(ORIGINS);
  const edge = servers.filter((s) => ["bastion", "vpn", "web", "api"].includes(s.role));
  const srv = rng.pick(edge.length ? edge : servers);
  const base = { ip: origin.ip, lat: origin.lat, lng: origin.lng, city: origin.city, country: origin.country, actor: origin.actor };
  const kind = rng.next();
  let sig: TelemetrySignal["signal"];
  let sev: TelemetrySignal["severity"] = "low";
  let attrs: Record<string, string | number | boolean> = { ...base };
  if (kind < 0.3) {
    sig = "auth.geo-anomaly";
    attrs = { ...base, account: `acct-${rng.pick(["ava", "ben", "cora", "dev", "eli"])}` };
  } else if (kind < 0.55) {
    sig = "api.enumeration-burst";
  } else if (kind < 0.7) {
    sig = "conformance.drift";
    attrs = { check: "egress-policy" };
  } else if (kind < 0.85) {
    sig = "auth.anomaly";
    sev = "medium";
    attrs = { ...base, asn: `AS${rng.int(10000, 99999)}` };
  } else {
    sig = "net.beacon-periodic";
    sev = "medium";
    attrs = { ...base, domain: `${rng.hex(8)}.example` };
  }
  emitSignal(sig, { serverId: srv.id, severity: sev, attributes: attrs });
}
