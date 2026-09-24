"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { KpiCard } from "@/components/compositions/kpi-card";
import { BlurFade } from "@/components/ui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBootstrap, useThreats } from "@/lib/hooks/use-data";
import { SEVERITY_CLASS, SEVERITY_HEX, THREAT_STATUS_CLASS, THREAT_STATUS_LABEL, ago, humanize } from "@/lib/format";
import { SEVERITY_ORDER, type Severity, type Threat } from "@/lib/types";
import { cn } from "@/lib/utils";

type Bucket = "all" | "open" | "prevented" | "closed";
const OPEN = new Set(["detected", "investigating", "contained", "escalated"]);

function bucketOf(t: Threat): Bucket {
  if (t.status === "prevented") return "prevented";
  if (OPEN.has(t.status)) return "open";
  return "closed";
}

export default function ThreatsPage() {
  const router = useRouter();
  const { data: threats } = useThreats("?limit=400");
  const { data: boot } = useBootstrap();
  const hostname = (id: string) => boot?.servers.find((s) => s.id === id)?.hostname ?? id;
  const [bucket, setBucket] = React.useState<Bucket>("all");
  const [severity, setSeverity] = React.useState<string>("any");
  const [q, setQ] = React.useState("");

  const rows = React.useMemo(() => {
    const list = [...(threats ?? [])].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    return list.filter((t) => {
      if (bucket !== "all" && bucketOf(t) !== bucket) return false;
      if (severity !== "any" && t.severity !== severity) return false;
      if (q) {
        const hay = `${t.id} ${t.title} ${t.category} ${t.summary} ${t.source.ip ?? ""} ${t.source.actorLabel ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [threats, bucket, severity, q]);

  const all = threats ?? [];
  const counts = {
    open: all.filter((t) => bucketOf(t) === "open").length,
    critical: all.filter((t) => t.severity === "critical" && bucketOf(t) === "open").length,
    prevented: all.filter((t) => t.status === "prevented").length,
    neutralized: all.filter((t) => t.status === "neutralized").length,
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Detections · kill chains · response"
        title="Threats"
        description="Everything the gang has seen, what they did about it, and the trace behind each decision."
      />

      <BlurFade delay={0.05} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Open" value={counts.open} tone="warm" hint={`${counts.critical} critical`} />
        <KpiCard label="Prevented" value={counts.prevented} tone="lime" hint="Path closed before use" />
        <KpiCard label="Neutralized" value={counts.neutralized} tone="cerulean" />
        <KpiCard label="Total tracked" value={all.length} tone="neutral" />
      </BlurFade>

      <BlurFade delay={0.1}>
        <Card className="bezel-core gap-0 border-0 p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <ToggleGroup
              value={[bucket]}
              onValueChange={(v) => {
                const next = (v as Bucket[])[0];
                if (next) setBucket(next);
              }}
              className="rounded-[10px] bg-bg-2 p-1"
            >
              {(["all", "open", "prevented", "closed"] as Bucket[]).map((b) => (
                <ToggleGroupItem key={b} value={b} className="h-7 rounded-[8px] px-3 text-[12px] text-text-2 data-[pressed]:bg-bg-3 data-[pressed]:text-lime">
                  {b[0].toUpperCase() + b.slice(1)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Select value={severity} onValueChange={(v) => setSeverity((v as string) ?? "any")} items={{ any: "Any severity", ...Object.fromEntries(SEVERITY_ORDER.map((s) => [s, s])) }}>
              <SelectTrigger className="h-8 w-[150px] border-line bg-bg-2 text-[12px]">
                <SelectValue placeholder="Any severity" />
              </SelectTrigger>
              <SelectContent className="border-line bg-bg-3">
                <SelectItem value="any">Any severity</SelectItem>
                {[...SEVERITY_ORDER].reverse().map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className={SEVERITY_CLASS[s as Severity]}>{s}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search id, host, IP, category…"
              className="ml-auto h-8 w-[260px] border-line bg-bg-2 text-[12px]"
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-line hover:bg-transparent">
                <TableHead className="w-[90px] text-text-3">Severity</TableHead>
                <TableHead className="text-text-3">Threat</TableHead>
                <TableHead className="text-text-3">Category</TableHead>
                <TableHead className="text-text-3">Target</TableHead>
                <TableHead className="text-text-3">Handled by</TableHead>
                <TableHead className="text-text-3">Status</TableHead>
                <TableHead className="text-right text-text-3">Detected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer border-line hover:bg-bg-2"
                  onClick={() => router.push(`/threats/${t.id}`)}
                >
                  <TableCell>
                    <span className={cn("flex items-center gap-2 text-[12px]", SEVERITY_CLASS[t.severity])}>
                      <span className="size-2 rounded-full" style={{ background: SEVERITY_HEX[t.severity] }} />
                      {t.severity}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[420px]">
                    <Link href={`/threats/${t.id}`} className="block truncate font-medium text-text-1 hover:text-lime" onClick={(e) => e.stopPropagation()}>
                      {t.title}
                    </Link>
                    <span className="mono-data text-[11px] text-text-3">
                      {t.id}
                      {t.source.ip && ` · ${t.source.ip}`}
                      {t.source.geo?.country && ` · ${t.source.geo.country}`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-line text-text-2">
                      {humanize(t.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="mono-data text-[12px] text-text-2">
                    {t.targetServerIds.length ? t.targetServerIds.slice(0, 2).map(hostname).join(", ") : "—"}
                    {t.targetServerIds.length > 2 && ` +${t.targetServerIds.length - 2}`}
                  </TableCell>
                  <TableCell>
                    <span className="flex -space-x-1.5">
                      {t.handledBy.map((id) => (
                        <span key={id} className="rounded-full ring-2 ring-bg-1">
                          <AgentAvatar agentId={id} size={20} />
                        </span>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-[12px]", THREAT_STATUS_CLASS[t.status])}>{THREAT_STATUS_LABEL[t.status]}</TableCell>
                  <TableCell className="mono-data text-right text-[11px] text-text-3">{ago(t.detectedAt)}</TableCell>
                </TableRow>
              ))}
              {threats && rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-12 text-center text-text-3">
                    Nothing matches those filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </BlurFade>
    </div>
  );
}
