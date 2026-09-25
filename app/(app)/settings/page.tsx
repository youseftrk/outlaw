"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";

import { PageHeader } from "@/components/shell/page-header";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { api, useSettings } from "@/lib/hooks/use-data";
import { useIsDesktop } from "@/lib/desktop";
import type { LLMProvider } from "@/lib/types";

const PRESETS: Record<LLMProvider, { label: string; baseUrl: string; model: string; keys: string }> = {
  none: { label: "Deterministic only", baseUrl: "", model: "", keys: "" },
  groq: { label: "Groq (free, fastest)", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-20b", keys: "console.groq.com/keys" },
  gemini: { label: "Google Gemini (free tier)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", keys: "aistudio.google.com/app/apikey" },
  mistral: { label: "Mistral (free mode)", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", keys: "console.mistral.ai/api-keys" },
  cerebras: { label: "Cerebras (free)", baseUrl: "https://api.cerebras.ai/v1", model: "llama3.1-8b", keys: "cloud.cerebras.ai" },
  openrouter: { label: "OpenRouter (free models)", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free", keys: "openrouter.ai/keys" },
  huggingface: { label: "Hugging Face router", baseUrl: "https://router.huggingface.co/v1", model: "meta-llama/Meta-Llama-3.1-8B-Instruct", keys: "huggingface.co/settings/tokens" },
  custom: { label: "Custom OpenAI-compatible", baseUrl: "", model: "", keys: "" },
};

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="bezel-core gap-0 border-0 p-5">
      <h2 className="font-display text-[22px] leading-none text-text-1">{title}</h2>
      <p className="mt-1.5 text-text-2">{description}</p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </Card>
  );
}

export default function SettingsPage() {
  const { data, mutate } = useSettings();
  const desktop = useIsDesktop();
  const [provider, setProvider] = React.useState<LLMProvider>("none");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [model, setModel] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [enabled, setEnabled] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [org, setOrg] = React.useState("");
  const [speed, setSpeed] = React.useState(1);
  const [quiet, setQuiet] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [savingAuth, setSavingAuth] = React.useState(false);
  const [syncedFrom, setSyncedFrom] = React.useState<typeof data>(undefined);

  // Re-seed the form whenever a fresh settings snapshot arrives.
  if (data && data !== syncedFrom) {
    setSyncedFrom(data);
    setProvider(data.llm.provider);
    setBaseUrl(data.llm.baseUrl);
    setModel(data.llm.model);
    setEnabled(data.llm.enabled);
    setName(data.operator.name);
    setPhone(data.operator.phone);
    setOrg(data.operator.org);
    setSpeed(data.sim.speed);
    setQuiet(data.sim.quietHours);
  }

  const pickProvider = (p: LLMProvider) => {
    setProvider(p);
    if (p !== "custom") {
      setBaseUrl(PRESETS[p].baseUrl);
      setModel(PRESETS[p].model);
    }
  };

  const saveLlm = async () => {
    setSaving(true);
    try {
      await api.settings.update({ llm: { provider, baseUrl, model, enabled, ...(apiKey ? { apiKey } : {}) } });
      setApiKey("");
      toast.success("LLM settings saved");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      // Testing implies you want it on: enable, save, then probe.
      setEnabled(true);
      await api.settings.update({ llm: { provider, baseUrl, model, enabled: true, ...(apiKey ? { apiKey } : {}) } });
      setApiKey("");
      const r = await api.settings.testLlm();
      if (r?.ok) toast.success(`Model answered in ${r.latencyMs} ms: “${r.sample ?? "ready"}”`);
      else toast.error(r?.error ?? "The model didn't answer");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const saveOperator = async () => {
    try {
      await api.settings.update({ operator: { name, phone, org }, sim: { speed, quietHours: quiet } });
      toast.success("Saved");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  const saveAuth = async (next: string | null) => {
    setSavingAuth(true);
    try {
      const r = await api.settings.setPassword(next);
      setPassword("");
      toast.success(r.auth.enabled ? "Password saved — login required from now on" : "Password cleared — login disabled");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSavingAuth(false);
    }
  };

  const auth = data?.auth;
  const authStatus =
    auth?.source === "env"
      ? "Login required · password from QALAA_AUTH_PASSWORD"
      : auth?.source === "settings"
        ? "Login required · password set here"
        : "Open · no password set, anyone who can reach this host has full access";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Operator · brain · simulation" title="Settings" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BlurFade delay={0.05}>
          <Section
            title="Agent brain"
            description="Detection and response are deterministic and always on. An LLM adds narrated reasoning, natural texts, and freeform answers — with automatic fallback so the demo never stalls."
          >
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Provider
              <Select value={provider} onValueChange={(v) => pickProvider((v as LLMProvider) ?? "none")} items={Object.fromEntries((Object.keys(PRESETS) as LLMProvider[]).map((p) => [p, PRESETS[p].label]))}>
                <SelectTrigger className="border-line bg-bg-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-bg-3">
                  {(Object.keys(PRESETS) as LLMProvider[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRESETS[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {PRESETS[provider].keys && <span className="mono-data text-[11px] text-text-3">free key at {PRESETS[provider].keys}</span>}
            </label>
            {provider !== "none" && (
              <>
                <label className="flex flex-col gap-1 text-[12px] text-text-2">
                  Base URL
                  <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="mono-data border-line bg-bg-2" />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-text-2">
                  Model
                  <Input value={model} onChange={(e) => setModel(e.target.value)} className="mono-data border-line bg-bg-2" />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-text-2">
                  API key {data?.llm.apiKeySet && <span className="text-lime">· set</span>}
                  <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={data?.llm.apiKeySet ? "•••••••• (leave blank to keep)" : "paste key"} className="mono-data border-line bg-bg-2" autoComplete="off" />
                  <span className="text-[11px] text-text-3">Stored server-side in .data/secrets.json. Never sent to the browser.</span>
                </label>
                <label className="flex items-center justify-between rounded-[10px] bg-bg-2 px-3 py-2 text-text-1">
                  Use the LLM for reasoning and texts
                  <Switch checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
                </label>
              </>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={saveLlm} disabled={saving}>
                Save
              </Button>
              {provider !== "none" && (
                <Button variant="secondary" onClick={test} disabled={testing}>
                  {testing ? "Testing…" : "Save & test"}
                </Button>
              )}
              {data?.llm.lastTest && (
                <span className={`ml-auto flex items-center gap-1.5 text-[12px] ${data.llm.lastTest.ok ? "text-lime" : "text-sev-high"}`}>
                  {data.llm.lastTest.ok ? <CheckCircle weight="fill" className="size-4" /> : <WarningCircle weight="fill" className="size-4" />}
                  {data.llm.lastTest.ok ? `ok · ${data.llm.lastTest.latencyMs} ms` : data.llm.lastTest.error}
                </span>
              )}
            </div>
          </Section>
        </BlurFade>

        <BlurFade delay={0.1} className="flex flex-col gap-4">
          <Section title="Operator" description="Who the gang texts, and how they address you.">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                Name
                <Input value={name} onChange={(e) => setName(e.target.value)} className="border-line bg-bg-2" />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                Organization
                <Input value={org} onChange={(e) => setOrg(e.target.value)} className="border-line bg-bg-2" />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Phone (shown on the phone UI)
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mono-data border-line bg-bg-2" />
            </label>
          </Section>
          <Section title="Simulation" description="Clock speed for the world and the gang's patrols. Quiet hours batch medium alerts into digests.">
            <div>
              <p className="mb-2 text-[12px] text-text-2">
                Speed · <span className="mono-data text-text-1">{speed}×</span>
              </p>
              <Slider value={[speed]} min={1} max={8} step={1} onValueChange={(v) => setSpeed(Array.isArray(v) ? v[0] : v)} />
            </div>
            <label className="flex items-center justify-between rounded-[10px] bg-bg-2 px-3 py-2 text-text-1">
              Quiet hours
              <Switch checked={quiet} onCheckedChange={(v) => setQuiet(Boolean(v))} />
            </label>
            <Button onClick={saveOperator} className="w-fit">
              Save
            </Button>
          </Section>
          <Section title="Access" description="Optional single password for the whole UI and API. Leave empty to keep the zero-config demo flow.">
            <p className={`mono-data text-[12px] ${auth?.enabled ? "text-lime" : "text-text-3"}`}>{authStatus}</p>
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              {auth?.source === "settings" ? "New password" : "Password"}
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="at least 8 characters"
                className="mono-data border-line bg-bg-2"
                autoComplete="new-password"
              />
              <span className="text-[11px] text-text-3">Stored as a scrypt hash in .data/secrets.json. Delete the auth key there to reset.</span>
            </label>
            <div className="flex items-center gap-2">
              <Button onClick={() => saveAuth(password)} disabled={savingAuth || password.length < 8}>
                Save
              </Button>
              {auth?.source === "settings" && (
                <Button variant="secondary" onClick={() => saveAuth(null)} disabled={savingAuth}>
                  Clear password
                </Button>
              )}
            </div>
          </Section>
          <Section title="Desktop" description={desktop ? "Running inside the Qalaa desktop shell." : "Running in a browser. `npm run desktop` opens the native shell."}>
            <p className="mono-data text-[12px] text-text-3">
              {typeof window !== "undefined" && window.qalaa ? `${window.qalaa.platform} · v${window.qalaa.version ?? "dev"}` : "web"}
            </p>
          </Section>
        </BlurFade>
      </div>
    </div>
  );
}
