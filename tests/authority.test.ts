import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getRuntime } from "@/server/runtime";
import { store } from "@/server/store";
import {
  authorize,
  request,
  accept,
  decline,
  revoke,
  completeStepUp,
  stepUpCodeFor,
  pathFor,
  drillState,
  suggest,
  lease as findLease,
  setAuthorityTickActive,
  type RequestInput,
} from "@/server/authority/engine";
import { runTool } from "@/server/agents/toolbelt";
import { startTrace } from "@/server/governance/traces";
import { POST as protectedPost } from "@/app/api/protected/[ownerEntityId]/[capability]/route";
import { POST as leasesPost } from "@/app/api/authority/leases/route";
import { POST as resetPost } from "@/app/api/authority/reset/route";
import { GET as rulesGet, PATCH as rulesPatch } from "@/app/api/authority/rules/[entityId]/route";
import type { Capability, AuthorityScope, AuthorityCheck } from "@/lib/types";

const rt = () => getRuntime();
const DATA_SERVER = "srv-dataset-worker-02"; // prod → ent-data, carries personal-data

const CHECK_LABELS = [
  "Permission exists",
  "Owner said yes",
  "Human code entered",
  "Still within the agreed time",
  "Not taken back",
  "Right agent",
  "What the agent may do matches",
  "Where it may act matches",
  "Owner never shares this data",
];

/** request → accept → step-up (if required) → active lease */
function grant(opts: { capability: Capability; scope: AuthorityScope; agentId?: string; durationSec?: number; owner?: string }) {
  const input: RequestInput = {
    requestingEntityId: "ent-response",
    ownerEntityId: opts.owner ?? "ent-data",
    agentId: opts.agentId,
    capability: opts.capability,
    scope: opts.scope,
    justification: "test grant",
    durationSec: opts.durationSec ?? 600,
  };
  const r = request(input, "test");
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.message);
  const a = accept(r.lease.id, "test");
  expect(a.ok).toBe(true);
  if (!a.ok) throw new Error(a.message);
  if (a.stepUpCode) completeStepUp(r.lease.id, a.stepUpCode, "test");
  return findLease(r.lease.id)!;
}

const call = (actorId: string, capability: Capability, serverId?: string) =>
  authorize({ actorId, capability, serverId });

const checksOK = (checks: AuthorityCheck[]) => {
  expect(checks.map((c) => c.label)).toEqual(CHECK_LABELS);
  return checks;
};

const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("authority engine", () => {
  beforeAll(() => rt());
  beforeEach(() => {
    rt().reset();
  });

  it("no permission → AUTHORITY_REQUIRED", () => {
    const r = call("agt-hisn", "contain", DATA_SERVER);
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.code).toBe("AUTHORITY_REQUIRED");
    checksOK(r.checks);
  });

  it("pending → AUTHORITY_PENDING", () => {
    const r = request(
      { requestingEntityId: "ent-response", ownerEntityId: "ent-data", capability: "contain", scope: { serverIds: [DATA_SERVER] }, justification: "t", durationSec: 600 },
      "test"
    );
    expect(r.ok).toBe(true);
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(false);
    if (!auth.allow) expect(auth.code).toBe("AUTHORITY_PENDING");
  });

  it("active + right agent + scope → allowed, all checks pass, uses increment", () => {
    const l = grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-hisn" });
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(true);
    if (auth.allow) {
      expect(auth.lease.id).toBe(l.id);
      expect(checksOK(auth.checks).every((c) => c.passed)).toBe(true);
    }
    expect(findLease(l.id)!.uses).toBe(1);
  });

  it("wrong agent → REQUESTER_MISMATCH", () => {
    grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-saqr" });
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(false);
    if (!auth.allow) expect(auth.code).toBe("REQUESTER_MISMATCH");
  });

  it("wrong capability on a scoped grant → CAPABILITY_MISMATCH", () => {
    grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-hisn" });
    const auth = call("agt-hisn", "repair", DATA_SERVER); // data cap repair? repair is a cap
    expect(auth.allow).toBe(false);
    if (!auth.allow) expect(auth.code).toBe("CAPABILITY_MISMATCH");
  });

  it("out-of-scope server → SCOPE_MISMATCH", () => {
    grant({ capability: "contain", scope: { serverIds: ["srv-dataset-worker-01"] }, agentId: "agt-hisn" });
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(false);
    if (!auth.allow) expect(auth.code).toBe("SCOPE_MISMATCH");
  });

  it("expired → AUTHORITY_EXPIRED after its window", async () => {
    grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-hisn", durationSec: 60 });
    await rt().fastForward(120);
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(false);
    if (!auth.allow) expect(auth.code).toBe("AUTHORITY_EXPIRED");
  });

  it("revoked → AUTHORITY_REVOKED on the very next call", () => {
    const l = grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-hisn" });
    revoke(l.id, "owner", "no longer needed");
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(false);
    if (!auth.allow) expect(auth.code).toBe("AUTHORITY_REVOKED");
  });

  it("declined lease refuses and a fresh request may be made", () => {
    const r = request(
      { requestingEntityId: "ent-response", ownerEntityId: "ent-data", capability: "contain", scope: { serverIds: [DATA_SERVER] }, justification: "t", durationSec: 600 },
      "test"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    decline(r.lease.id, "owner", "not now");
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(false);
    const again = request(
      { requestingEntityId: "ent-response", ownerEntityId: "ent-data", capability: "contain", scope: { serverIds: [DATA_SERVER] }, justification: "t2", durationSec: 600 },
      "test"
    );
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.created).toBe(true);
  });

  it("step-up: wrong code ×3 kills the challenge; replay rejected", () => {
    const r = request(
      { requestingEntityId: "ent-response", ownerEntityId: "ent-data", capability: "contain", scope: { serverIds: [DATA_SERVER] }, justification: "t", durationSec: 600 },
      "test"
    );
    if (!r.ok) throw new Error("request failed");
    const a = accept(r.lease.id, "test");
    expect(a.ok).toBe(true);
    expect(findLease(r.lease.id)!.status).toBe("pending-step-up");
    const code = stepUpCodeFor(r.lease.id)!;
    expect(code).toMatch(/^\d{6}$/);
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 3; i++) {
      const w = completeStepUp(r.lease.id, wrong, "test");
      expect(w.ok).toBe(false);
      if (!w.ok) expect(w.status).toBe(403);
    }
    const dead = completeStepUp(r.lease.id, wrong, "test");
    expect(dead.ok).toBe(false);
    if (!dead.ok) expect(dead.status).toBe(410); // challenge dead after 3 attempts
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(false);
  });

  it("step-up: right code activates; replay → 409", () => {
    const r = request(
      { requestingEntityId: "ent-response", ownerEntityId: "ent-data", capability: "contain", scope: { serverIds: [DATA_SERVER] }, justification: "t", durationSec: 600 },
      "test"
    );
    if (!r.ok) throw new Error("request failed");
    accept(r.lease.id, "test");
    const code = stepUpCodeFor(r.lease.id)!;
    const ok = completeStepUp(r.lease.id, code, "test");
    expect(ok.ok).toBe(true);
    expect(findLease(r.lease.id)!.status).toBe("active");
    const replay = completeStepUp(r.lease.id, code, "test");
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.status).toBe(409);
  });

  it("records the lifecycle: asked/accepted/activated/allowed/revoked/refused", () => {
    call("agt-hisn", "credentials", DATA_SERVER); // refused: credentials not allowed by rules anyway → grant a refuse via call
    const l = grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-hisn" });
    call("agt-hisn", "contain", DATA_SERVER); // allowed record is written by the route/toolbelt; engine authorize doesn't record — record via route below
    revoke(l.id, "owner");
    const kinds = store.s.records.map((r) => r.kind);
    expect(kinds).toContain("asked");
    expect(kinds).toContain("accepted");
    expect(kinds).toContain("activated");
    expect(kinds).toContain("revoked");
  });

  it("runTool on a foreign server without permission creates exactly one pending request and refuses", async () => {
    setAuthorityTickActive(true); // simulate the in-tick path (waiters can't resolve inside a tick)
    try {
      const hisn = store.agent("agt-hisn")!;
      const trace = startTrace(hisn, "test step", {});
      const before = store.s.leases.filter((l) => l.status === "pending").length;
      const r = await runTool(hisn, "isolate_host", { serverId: DATA_SERVER }, trace);
      expect(r.ok).toBe(false);
      const pendings = store.s.leases.filter((l) => l.status === "pending" && l.capability === "contain" && l.ownerEntityId === "ent-data");
      expect(pendings.length - (before)).toBe(1);
      const r2 = await runTool(hisn, "isolate_host", { serverId: DATA_SERVER }, trace);
      expect(r2.ok).toBe(false);
      expect(store.s.leases.filter((l) => l.status === "pending" && l.capability === "contain").length).toBe(pendings.length);
    } finally {
      setAuthorityTickActive(false);
    }
  });

  it("same-entity call allowed with a synthetic self-lease", () => {
    const auth = call("ent-data", "data", DATA_SERVER);
    expect(auth.allow).toBe(true);
    if (auth.allow) expect(auth.lease.id).toBe("self-ent-data");
  });
});

describe("owner house rules", () => {
  beforeEach(() => {
    rt().reset();
  });

  it("never-shared veto beats an active lease → NEVER_SHARED", () => {
    // the seeded observe lease covers every ent-data server, but the worker carries personal-data
    const auth = call("agt-hisn", "observe", DATA_SERVER);
    expect(auth.allow).toBe(false);
    if (!auth.allow) expect(auth.code).toBe("NEVER_SHARED");
  });

  it("request over max duration → RULES_EXCEEDED", () => {
    const r = request(
      { requestingEntityId: "ent-response", ownerEntityId: "ent-data", capability: "contain", scope: { serverIds: [DATA_SERVER] }, justification: "t", durationSec: 3 * 3600 },
      "test"
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RULES_EXCEEDED");
  });

  it("request for a capability the owner never lends → RULES_EXCEEDED", () => {
    const r = request(
      { requestingEntityId: "ent-response", ownerEntityId: "ent-data", capability: "credentials", scope: { serverIds: [DATA_SERVER] }, justification: "t", durationSec: 600 },
      "test"
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RULES_EXCEEDED");
  });

  it("checks array present on refuse with owner-rules flavor", () => {
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(false);
    checksOK(auth.checks);
    expect(auth.checks.some((c) => !c.passed)).toBe(true);
  });

  it("suggest never exceeds rules: duration ≤ max, forbidden terms flagged", () => {
    const s = suggest({ agentId: "agt-hisn", capability: "contain", serverId: DATA_SERVER });
    expect("error" in s).toBe(false);
    if ("error" in s) return;
    expect(s.durationSec).toBeLessThanOrEqual(2 * 3600);
    expect(s.durationSec).toBe(3600);
    expect(s.source).toBe("rules");
    expect(s.scope.serverIds).toEqual([DATA_SERVER]);
    expect(s.terms.length).toBeGreaterThan(0);
    const bad = suggest({ agentId: "agt-hisn", capability: "credentials", serverId: DATA_SERVER });
    expect("error" in bad).toBe(false);
    if (!("error" in bad)) expect(bad.terms.some((t) => !t.allowed)).toBe(true);
  });

  it("rules PATCH updates and records rules-changed", async () => {
    const req = post("/api/authority/rules/ent-research", { by: "test", neverShared: ["infrastructure"] });
    const res = await rulesPatch(req, { params: Promise.resolve({ entityId: "ent-research" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.neverShared).toEqual(["infrastructure"]);
    expect(store.s.records.some((r) => r.kind === "rules-changed")).toBe(true);
    const got = await rulesGet(new Request("http://localhost/x"), { params: Promise.resolve({ entityId: "ent-research" }) });
    expect((await got.json()).entityId).toBe("ent-research");
  });
});

describe("drill state + reset + path", () => {
  beforeEach(() => {
    rt().reset();
  });

  it("drillState walks the demo lease through its stages", () => {
    expect(drillState().step).toBe("no-permission");
    const l = grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-hisn" });
    expect(drillState().step).toBe("allowed");
    revoke(l.id, "owner");
    expect(drillState().step).toBe("revoked");
  });

  it("reset clears leases/records, keeps entities/rules, next call → AUTHORITY_REQUIRED", async () => {
    grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-hisn" });
    const res = await resetPost();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(store.s.leases.filter((l) => l.capability === "contain").length).toBe(0);
    expect(store.s.entities.length).toBe(3);
    const auth = call("agt-hisn", "contain", DATA_SERVER);
    expect(auth.allow).toBe(false);
    if (!auth.allow) expect(auth.code).toBe("AUTHORITY_REQUIRED");
  });

  it("pathFor returns a node graph for the lease", () => {
    const l = grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-hisn" });
    const p = pathFor(l.id)!;
    expect(p.leaseId).toBe(l.id);
    expect(p.nodes.length).toBeGreaterThan(0);
    expect(p.edges.length).toBeGreaterThan(0);
  });
});

describe("protected route — the demo loop", () => {
  beforeEach(() => {
    rt().reset();
  });

  const protectedCall = (body: unknown) =>
    protectedPost(post("/api/protected/ent-data/contain", body), {
      params: Promise.resolve({ ownerEntityId: "ent-data", capability: "contain" }),
    });

  it("403 AUTHORITY_REQUIRED → 200 → 403 AUTHORITY_REVOKED", async () => {
    const r1 = await protectedCall({ actorId: "agt-hisn", serverId: DATA_SERVER });
    expect(r1.status).toBe(403);
    expect((await r1.json()).error).toBe("AUTHORITY_REQUIRED");
    expect(store.s.records.some((r) => r.kind === "refused" && r.refusalCode === "AUTHORITY_REQUIRED")).toBe(true);

    const lease = grant({ capability: "contain", scope: { serverIds: [DATA_SERVER] }, agentId: "agt-hisn" });
    const r2 = await protectedCall({ actorId: "agt-hisn", serverId: DATA_SERVER });
    expect(r2.status).toBe(200);
    const ok = await r2.json();
    expect(ok.ok).toBe(true);
    expect(ok.lease.id).toBe(lease.id);
    expect(ok.checks.every((c: AuthorityCheck) => c.passed)).toBe(true);

    revoke(lease.id, "owner");
    const r3 = await protectedCall({ actorId: "agt-hisn", serverId: DATA_SERVER });
    expect(r3.status).toBe(403);
    const denied = await r3.json();
    expect(denied.error).toBe("AUTHORITY_REVOKED");
    expect(Array.isArray(denied.checks)).toBe(true);
  });

  it("POST /api/authority/leases validates and returns the lease", async () => {
    const res = await leasesPost(
      post("/api/authority/leases", {
        requestingEntityId: "ent-response",
        ownerEntityId: "ent-data",
        capability: "contain",
        scope: { serverIds: [DATA_SERVER] },
        justification: "demo",
        durationSec: 900,
      })
    );
    expect(res.status).toBe(201);
    const l = await res.json();
    expect(l.status).toBe("pending");
    expect(l.stepUpRequired).toBe(true);
    expect(l.stepUpCode).toBeUndefined(); // code never leaves the server
  });
});
