/**
 * Seeded fleet — Frontier Hub (SPEC §0). 33 servers enumerated in the spec
 * (SPEC headline says 28; the itemized list enumerates 33 — list wins).
 */
import type { Provider, Region, Server, ServerRole, Environment, GeoPoint } from "@/lib/types";
import { makeRng } from "../rng";
import { evaluateChecks, conformanceScore } from "../fleet/conformance";
import { projectWorld } from "../world/world";
import type { World } from "../world/world";
import { iso } from "../time";

const GEO: Record<string, GeoPoint> = {
  ashburn: { lat: 39.0438, lng: -77.4874, city: "Ashburn", country: "US" },
  hillsboro: { lat: 45.5229, lng: -122.9898, city: "Hillsboro", country: "US" },
  dublin: { lat: 53.3498, lng: -6.2603, city: "Dublin", country: "IE" },
  frankfurt: { lat: 50.1109, lng: 8.6821, city: "Frankfurt", country: "DE" },
  mumbai: { lat: 19.076, lng: 72.8777, city: "Mumbai", country: "IN" },
};

interface Spec {
  host: string;
  role: ServerRole;
  env: Environment;
  geo: keyof typeof GEO;
  region: Region;
  provider: Provider;
  cluster?: string;
  workloads?: string[];
  tags?: string[];
}

const SPECS: Spec[] = [
  // prod / us-east (Ashburn)
  { host: "api-01", role: "api", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["hub-api"], tags: ["public"] },
  { host: "api-02", role: "api", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["hub-api"], tags: ["public"] },
  { host: "api-03", role: "api", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["hub-api"], tags: ["public"] },
  { host: "web-01", role: "web", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["web-frontend"], tags: ["public"] },
  { host: "hub-db-01", role: "database", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["postgres", "redis"], tags: ["data"] },
  { host: "obj-store-01", role: "storage", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["s3-gateway"], tags: ["data"] },
  { host: "dataset-worker-01", role: "worker", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["dataset-ingest", "preview-gen"], tags: ["uploads"] },
  { host: "dataset-worker-02", role: "worker", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["dataset-ingest"], tags: ["uploads"] },
  { host: "dataset-worker-03", role: "worker", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["dataset-ingest", "parquet-convert"], tags: ["uploads"] },
  { host: "prod-node-01", role: "k8s-node", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", cluster: "prod-us", workloads: ["hub-api", "jobs"] },
  { host: "prod-node-02", role: "k8s-node", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", cluster: "prod-us", workloads: ["hub-api"] },
  { host: "prod-node-03", role: "k8s-node", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", cluster: "prod-us", workloads: ["batch"] },
  { host: "prod-node-04", role: "k8s-node", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", cluster: "prod-us", workloads: ["batch"] },
  { host: "bastion-01", role: "bastion", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", tags: ["edge"] },
  { host: "vpn-01", role: "vpn", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", tags: ["edge"] },
  { host: "scm-01", role: "scm", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["git"], tags: ["ci-cd"] },
  { host: "ci-01", role: "ci", env: "prod", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["ci-runners"], tags: ["ci-cd"] },
  // prod / us-west (Hillsboro)
  { host: "web-02", role: "web", env: "prod", geo: "hillsboro", region: "us-west", provider: "aws", workloads: ["web-frontend"], tags: ["public"] },
  { host: "inference-01", role: "inference", env: "prod", geo: "hillsboro", region: "us-west", provider: "aws", workloads: ["text-gen", "embeddings"], tags: ["gpu"] },
  { host: "inference-02", role: "inference", env: "prod", geo: "hillsboro", region: "us-west", provider: "aws", workloads: ["text-gen"], tags: ["gpu"] },
  // prod / eu-west (Dublin)
  { host: "api-04", role: "api", env: "prod", geo: "dublin", region: "eu-west", provider: "aws", workloads: ["hub-api"], tags: ["public"] },
  { host: "dataset-worker-04", role: "worker", env: "prod", geo: "dublin", region: "eu-west", provider: "aws", workloads: ["dataset-ingest"], tags: ["uploads"] },
  { host: "prod-node-05", role: "k8s-node", env: "prod", geo: "dublin", region: "eu-west", provider: "aws", cluster: "prod-eu", workloads: ["hub-api"] },
  { host: "prod-node-06", role: "k8s-node", env: "prod", geo: "dublin", region: "eu-west", provider: "aws", cluster: "prod-eu", workloads: ["batch"] },
  // prod / eu-central (Frankfurt)
  { host: "obj-store-02", role: "storage", env: "prod", geo: "frankfurt", region: "eu-central", provider: "aws", workloads: ["s3-gateway"], tags: ["data"] },
  // prod / ap-south (Mumbai)
  { host: "inference-03", role: "inference", env: "prod", geo: "mumbai", region: "ap-south", provider: "aws", workloads: ["embeddings"], tags: ["gpu"] },
  // research / us-west
  { host: "pkg-cache-01", role: "registry", env: "research", geo: "hillsboro", region: "us-west", provider: "on-prem", workloads: ["pkg-cache", "model-registry"], tags: ["registry"] },
  { host: "eval-node-01", role: "k8s-node", env: "research", geo: "hillsboro", region: "us-west", provider: "on-prem", cluster: "eval-gym", workloads: ["eval-runner"], tags: ["eval"] },
  { host: "eval-node-02", role: "k8s-node", env: "research", geo: "hillsboro", region: "us-west", provider: "on-prem", cluster: "eval-gym", workloads: ["eval-runner"], tags: ["eval"] },
  { host: "eval-node-03", role: "k8s-node", env: "research", geo: "hillsboro", region: "us-west", provider: "on-prem", cluster: "eval-gym", workloads: ["eval-runner"], tags: ["eval"] },
  { host: "control-plane-01", role: "control-plane", env: "research", geo: "hillsboro", region: "us-west", provider: "on-prem", workloads: ["k8s-control"], tags: ["k8s"] },
  // staging / us-east
  { host: "stg-api-01", role: "api", env: "staging", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["hub-api-stg"] },
  { host: "stg-worker-01", role: "worker", env: "staging", geo: "ashburn", region: "us-east", provider: "aws", workloads: ["dataset-ingest-stg"] },
];

export function seedFleet(nowIso: string, world: World): Server[] {
  const rng = makeRng("outlaw-2026:fleet");
  const obs = projectWorld(world);
  return SPECS.map((spec, i) => {
    const createdAt = iso(new Date(nowIso).getTime() - (30 + rng.int(0, 300)) * 86400_000);
    const srv: Server = {
      id: `srv-${spec.host}`,
      hostname: spec.host,
      role: spec.role,
      provider: spec.provider,
      region: spec.region,
      env: spec.env,
      geo: GEO[spec.geo],
      ip: `10.${20 + (i % 6)}.${Math.floor(i / 6)}.${10 + i}`,
      os: "Ubuntu 24.04 LTS",
      kernel: `6.8.${rng.int(0, 12)}-generic`,
      cluster: spec.cluster,
      tags: spec.tags ?? [],
      workloads: spec.workloads ?? [],
      status: "healthy",
      conformanceScore: 100,
      checks: [],
      protectedBy: [],
      lastSeen: nowIso,
      createdAt,
      load: Array.from({ length: 24 }, () => rng.int(8, 62)),
    };
    srv.checks = evaluateChecks(srv, nowIso, obs);
    srv.conformanceScore = conformanceScore(srv.checks);
    return srv;
  });
}
