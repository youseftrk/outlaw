/**
 * Ambient noise (SPEC §2/§9): continuous background telemetry so the
 * dashboard is alive — brute force on the edge, credential stuffing on the
 * public web/api, prompt-injection against inference, config drift, recon —
 * from varied geos. ~2–4 threats/min, mostly low/medium, a high every few
 * minutes. Brain correlates these into routine threats.
 */
import type { ServerRole, Severity, TelemetrySignal } from "@/lib/types";
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
  { ip: "45.148.10.88", lat: 59.33, lng: 18.06, city: "Stockholm", country: "SE", actor: "VPS" },
  { ip: "196.251.72.11", lat: 9.03, lng: 38.74, city: "Addis Ababa", country: "ET", actor: "bulletproof host" },
];

interface NoiseKind {
  cls: string; // attackClass attribute → threat category
  roles: ServerRole[];
  signal: TelemetrySignal["signal"];
  sev: Severity;
  weight: number;
}

const KINDS: NoiseKind[] = [
  { cls: "brute-force", roles: ["bastion", "vpn"], signal: "auth.anomaly", sev: "low", weight: 0.24 },
  { cls: "credential-stuffing", roles: ["web", "api"], signal: "auth.anomaly", sev: "low", weight: 0.22 },
  { cls: "prompt-injection", roles: ["inference"], signal: "inference.prompt-injection", sev: "medium", weight: 0.14 },
  { cls: "misconfiguration", roles: [], signal: "conformance.drift", sev: "low", weight: 0.14 },
  { cls: "recon", roles: ["api", "web", "bastion"], signal: "api.enumeration-burst", sev: "low", weight: 0.16 },
  // rare, high
  { cls: "c2-beacon", roles: [], signal: "net.beacon-periodic", sev: "high", weight: 0.05 },
  { cls: "anomalous-egress", roles: [], signal: "net.egress-restricted-subnet", sev: "high", weight: 0.05 },
];

let rng = makeRng("outlaw-2026:noise");
let noiseTick = 0;

export function noiseReset(): void {
  rng = makeRng("outlaw-2026:noise");
  noiseTick = 0;
}

function pickKind(): NoiseKind {
  let r = rng.next();
  for (const k of KINDS) {
    if ((r -= k.weight) <= 0) return k;
  }
  return KINDS[0];
}

/** Called every tick — emits ~2–4 signals/min at 1× (≈4% chance per tick). */
export function tickNoise(): void {
  noiseTick++;
  // halve noise while a range run is active so the replay stands out
  if (!rng.chance(store.s.activeRunId ? 0.02 : 0.04)) return;
  const servers = store.s.servers.filter((s) => s.status === "healthy" || s.status === "degraded");
  if (!servers.length) return;
  const origin = rng.pick(ORIGINS);
  const kind = pickKind();
  const pool = kind.roles.length ? servers.filter((s) => kind.roles.includes(s.role)) : servers;
  const srv = pool.length ? rng.pick(pool) : rng.pick(servers);
  const base = { ip: origin.ip, lat: origin.lat, lng: origin.lng, city: origin.city, country: origin.country, actor: origin.actor, attackClass: kind.cls };
  let attrs: Record<string, string | number | boolean> = { ...base };
  if (kind.cls === "brute-force") {
    attrs = { ...base, account: `acct-${rng.pick(["ava", "ben", "cora", "dev", "eli"])}`, attempts: rng.int(20, 400) };
  } else if (kind.cls === "credential-stuffing") {
    attrs = { ...base, account: `acct-${rng.pick(["fay", "gus", "hana", "ivan", "joss"])}`, attempts: rng.int(50, 900) };
  } else if (kind.cls === "prompt-injection") {
    attrs = { ...base, pattern: rng.pick(["ignore previous instructions", "base64 jailbreak", "role-play escape"]) };
  } else if (kind.cls === "misconfiguration") {
    attrs = { check: rng.pick(["egress-policy", "imds-v2", "service-versions"]) };
  } else if (kind.cls === "c2-beacon") {
    attrs = { ...base, domain: `${rng.hex(8)}.example` };
  } else if (kind.cls === "recon") {
    attrs = { ...base, account: `scanner-${rng.int(100, 999)}` };
  }
  emitSignal(kind.signal, { serverId: srv.id, severity: kind.sev, attributes: attrs });
}
