/**
 * Research engine (SPEC §2): lookup/enrichment over the KB; research runs
 * as Doc traces and completes async (research.updated).
 */
import type { IOC, ResearchKind, ResearchQuery, ResearchResult } from "@/lib/types";
import { bus } from "../bus";
import { ids } from "../ids";
import { store } from "../store";
import { searchKB, ACTORS } from "./kb";
import { startTrace, addSpan, endSpan, endTrace } from "../governance/traces";
import { narrate } from "../agents/narrator";

function classify(query: string): ResearchKind {
  if (/CVE-\d{4}-\d+/i.test(query)) return "cve";
  if (/T\d{4}(\.\d+)?/.test(query)) return "technique";
  if (/^\d{1,3}(\.\d{1,3}){3}$|^[\w-]+\.(com|net|io|org|dev)/.test(query.trim())) return "ioc";
  if (ACTORS.some((a) => a.name.toLowerCase().includes(query.toLowerCase()) || a.aliases.some((x) => x.toLowerCase().includes(query.toLowerCase())))) return "actor";
  return "freeform";
}

export async function runResearch(query: string, kind?: ResearchKind): Promise<ResearchQuery> {
  const doc = store.agent("agt-doc")!;
  const rq: ResearchQuery = {
    id: ids.research(),
    query,
    kind: kind ?? classify(query),
    agentId: doc.id,
    status: "running",
    askedAt: store.now(),
  };
  store.s.research.push(rq);
  store.markDirty();
  bus.emit("research.updated", { query: rq }, { agentId: doc.id, summary: `Doc researching "${query}"`, href: "/research" });

  const trace = startTrace(doc, `research: ${query}`, {});
  rq.traceId = trace.id;
  const s1 = addSpan(trace, "observe", "parse query", { input: { query, kind: rq.kind } });
  endSpan(s1);

  // async completion — resolve next tick(s)
  void (async () => {
    const rs = addSpan(trace, "reason", "consulting knowledge base");
    const found = searchKB(query, undefined);
    const iocs: IOC[] = [];
    if (/\d{1,3}(\.\d{1,3}){3}/.test(query)) {
      iocs.push({ type: "ip", value: query.match(/\d{1,3}(\.\d{1,3}){3}/)![0], confidence: 0.8, firstSeen: store.now(), tags: ["operator-asked"] });
    }
    const relatedThreatIds = store.s.threats
      .filter((t) => t.iocs.some((i) => query.includes(i.value)) || t.title.toLowerCase().includes(query.toLowerCase()))
      .map((t) => t.id)
      .slice(0, 5);
    const { text: summary, llm } = await narrate(doc,
      () => researchSummary(query, found.cves.length, found.techniques.length, relatedThreatIds.length),
      { user: `Doc's 2-sentence research summary for "${query}". Found ${found.cves.length} CVEs, ${found.techniques.length} techniques, ${relatedThreatIds.length} related threats.` }
    );
    if (llm) rs.llm = llm;
    endSpan(rs, "ok", { hits: found.cves.length + found.techniques.length + found.actors.length });

    const result: ResearchResult = {
      summary,
      findings: [
        ...(found.cves.slice(0, 4).map((c) => ({ label: c.id, detail: `${c.title} (CVSS ${c.cvss})`, severity: c.severity }))),
        ...(relatedThreatIds.length ? [{ label: "Related threats", detail: relatedThreatIds.join(", "), severity: "medium" as const }] : []),
        ...(found.actors.slice(0, 2).map((a) => ({ label: a.name, detail: a.description, severity: "high" as const }))),
      ],
      relatedThreatIds,
      iocs,
      cves: found.cves.slice(0, 6),
      techniques: found.techniques.slice(0, 6),
      actors: found.actors.slice(0, 3),
    };
    const out = addSpan(trace, "outcome", "research complete", { output: { cves: result.cves.length, techniques: result.techniques.length } });
    endSpan(out);
    endTrace(trace, "completed");

    rq.status = "completed";
    rq.completedAt = store.now();
    rq.result = result;
    store.markDirty();
    bus.emit("research.updated", { query: rq }, { agentId: doc.id, summary: `research ${rq.id} done — ${result.cves.length} CVEs`, href: "/research" });
  })();

  return rq;
}

function researchSummary(q: string, cves: number, techniques: number, related: number): string {
  const bits: string[] = [];
  if (cves) bits.push(`${cves} CVE${cves === 1 ? "" : "s"} in the KB match`);
  if (techniques) bits.push(`${techniques} ATT&CK technique${techniques === 1 ? "" : "s"}`);
  if (related) bits.push(`${related} related threat${related === 1 ? "" : "s"} on record`);
  return bits.length
    ? `Looked up "${q}" — ${bits.join(", ")}. Full findings on the right.`
    : `Nothing in the KB matches "${q}" cleanly — broadened the search; closest entries are attached.`;
}
