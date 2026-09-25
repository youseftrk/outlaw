/**
 * Seed world state (SPEC §0): 40 accounts (5 weak/no-MFA), 120 tokens
 * (14 write tokens exposed across 6 public datasets), 30 public + 12 private
 * datasets, secrets per kind, 3 clusters, open sandbox egress, vulnerable
 * registry, unpatched workers.
 */
import type { World, WorldAccount, WorldDataset, WorldSecret, WorldToken, WorldWorker } from "../world/world";
import { makeRng } from "../rng";
import { iso } from "../time";

const FIRST = ["ava", "ben", "cora", "dev", "eli", "fay", "gus", "hana", "ivan", "joss", "kim", "leo", "mia", "noor", "omar", "priya", "quin", "ravi", "sana", "tomas", "uma", "vik", "wren", "xan", "yara", "zeb", "alma", "bo", "cy", "dora", "eli2", "fred", "gwen", "hugo", "inez", "jon", "kat", "luis", "mona", "nils"];
const DATASET_NAMES = [
  "openweb-text-10m", "code-instruct-v3", "multilingual-asr-2k", "vision-cityscapes-x", "rlhf-prefs-50k",
  "math-proofs-mini", "legal-briefs-eu", "med-notes-deid", "toxicity-labels-v2", "synth-faces-512",
  "speech-commands-v4", "finance-filings-10k", "recipe-pairs-1m", "code-search-py", "wiki-dump-mini",
  "emb-webcrawl-fr", "product-reviews-2m", "stock-tweets-90d", "genomics-lite", "satellite-naip-tiles",
  "chat-arena-logs", "ocr-receipts-20k", "music-stems-4k", "robot-grasps-v1", "clickstream-sample",
  "ner-biomed-v5", "qa-stackexchange", "pose-estimation-h36m", "speech-tts-libri", "timeseries-ett",
  "internal-eval-suite", "internal-redteam-logs", "prod-feature-store", "model-cards-assets",
  "training-checkpoints-meta", "billing-exports", "audit-archive-2025", "support-tickets-deid",
  "ab-test-results", "deploy-manifests", "oncall-runbooks", "research-grants",
];

export function seedWorld(nowIso: string): World {
  const rng = makeRng("qalaa-2026:world");
  const now = new Date(nowIso).getTime();

  // 40 accounts; first 5 are weak-creds + no MFA
  const accounts: WorldAccount[] = FIRST.map((user, i) => ({
    id: `acct-${user}`,
    user,
    email: `${user}@frontierhub.example`,
    mfa: i >= 5 ? rng.chance(0.92) : false,
    disabled: false,
    compromised: false,
    weakCreds: i < 5 ? true : rng.chance(0.05),
  }));

  // 120 tokens; pick 6 public datasets to hold 14 exposed write tokens
  const tokens: WorldToken[] = [];
  for (let i = 0; i < 120; i++) {
    const acct = accounts[rng.int(0, accounts.length - 1)];
    tokens.push({
      id: `tok-${(1000 + i).toString()}`,
      accountId: acct.id,
      scope: i % 10 === 0 ? "admin" : i % 3 === 0 ? "write" : "read",
      revoked: false,
      attackerHeld: false,
      lastUsedAt: rng.chance(0.8) ? iso(now - rng.int(0, 45) * 86400_000) : undefined,
    });
  }

  const datasets: WorldDataset[] = DATASET_NAMES.map((name, i) => {
    const isPublic = i < 30;
    return {
      id: `ds-${name}`,
      name,
      ownerAccountId: accounts[rng.int(5, accounts.length - 1)].id,
      public: isPublic,
      format: rng.pick(["parquet", "hdf5", "json", "csv"] as const),
      loader: rng.chance(0.3) ? "remote-code" : "static",
      templatedConfig: rng.chance(0.5),
      containsTokenIds: [],
      malicious: false,
      quarantined: false,
      uploadedAt: iso(now - rng.int(1, 200) * 86400_000),
    };
  });

  // 14 write tokens exposed across 6 public datasets (Truffle-style finding)
  const publicDs = datasets.filter((d) => d.public).slice(0, 6);
  const writeTokens = tokens.filter((t) => t.scope === "write").slice(0, 14);
  writeTokens.forEach((t, i) => {
    const ds = publicDs[i % publicDs.length];
    t.exposedInDatasetId = ds.id;
    ds.containsTokenIds.push(t.id);
  });

  const workerIds = [
    "srv-dataset-worker-01", "srv-dataset-worker-02", "srv-dataset-worker-03",
    "srv-dataset-worker-04", "srv-stg-worker-01",
  ];
  const secrets: WorldSecret[] = [];
  const secretKinds = ["cloud", "vpn", "scm", "messaging", "storage", "k8s"] as const;
  // global secrets
  for (const kind of secretKinds) {
    secrets.push({ id: `sec-${kind}-main`, kind, rotatedAt: iso(now - rng.int(10, 90) * 86400_000), attackerHeld: false });
  }
  const workers: WorldWorker[] = workerIds.map((serverId) => {
    const envSecretIds = secretKinds.map((k) => {
      const id = `sec-${k}-${serverId.replace("srv-", "")}`;
      secrets.push({ id, kind: k, rotatedAt: iso(now - rng.int(30, 120) * 86400_000), attackerHeld: false });
      return id;
    });
    return {
      serverId,
      envSecretIds,
      fileDisclosurePatched: false,
      templateInjectionPatched: false,
      compromised: false,
    };
  });

  return {
    accounts,
    tokens,
    datasets,
    registry: {
      serverId: "srv-pkg-cache-01",
      version: "7.49.6",
      tokenRefreshSigBypass: true,
      pluginInstallAllowed: true,
      locked: false,
      patched: false,
      attackerAdminToken: false,
      plugins: ["groovy-console", "artifact-resolver"],
    },
    workers,
    secrets,
    clusters: [
      {
        id: "clu-prod-us", name: "prod-us",
        nodeServerIds: ["srv-prod-node-01", "srv-prod-node-02", "srv-prod-node-03", "srv-prod-node-04"],
        compromisedNodeIds: [], cordoned: false, eastWestOpen: true,
      },
      {
        id: "clu-prod-eu", name: "prod-eu",
        nodeServerIds: ["srv-prod-node-05", "srv-prod-node-06"],
        compromisedNodeIds: [], cordoned: false, eastWestOpen: true,
      },
      {
        id: "clu-eval-gym", name: "eval-gym",
        nodeServerIds: ["srv-eval-node-01", "srv-eval-node-02", "srv-eval-node-03"],
        compromisedNodeIds: [], cordoned: false, eastWestOpen: true,
      },
    ],
    network: {
      egressAllowed: {}, // filled by seed/index for every server id → true
      blockedIps: [],
      blockedSubnets: [],
    },
    sandbox: { hardened: false, egressAllowed: true, ephemeralInstances: 3 },
    attacker: { hasInternet: false, c2Active: false, stagingAccounts: [], datasetsRead: [] },
    closures: {},
    revealed: { maliciousDatasets: [], exposedTokenIds: [], serverFacts: {} },
  };
}
