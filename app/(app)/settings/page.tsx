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
import { Textarea } from "@/components/ui/textarea";
import { api, useServers, useSettings } from "@/lib/hooks/use-data";
import { useIsDesktop } from "@/lib/desktop";
import type { DeliveryChannel, LLMProvider, MessageKind, Severity, SshHostKeyPolicy } from "@/lib/types";

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

const HOST_KEY_POLICIES: Record<SshHostKeyPolicy, string> = {
  "accept-new": "Accept new (pin on first contact)",
  strict: "Strict (only pinned hosts)",
};

const CHANNELS: Record<DeliveryChannel, string> = {
  off: "Off (in-app only)",
  webhook: "Webhook",
  slack: "Slack",
  twilio: "Twilio SMS",
};

const SEVERITIES: Record<Severity, string> = { info: "Info and up (everything)", low: "Low and up", medium: "Medium and up", high: "High and up", critical: "Critical only" };

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
  const { data: servers } = useServers();
  const [sshUser, setSshUser] = React.useState("");
  const [sshPort, setSshPort] = React.useState("22");
  const [sshPolicy, setSshPolicy] = React.useState<SshHostKeyPolicy>("accept-new");
  const [sshSudo, setSshSudo] = React.useState(false);
  const [sshKey, setSshKey] = React.useState("");
  const [bastionHost, setBastionHost] = React.useState("");
  const [bastionPort, setBastionPort] = React.useState("22");
  const [bastionUser, setBastionUser] = React.useState("");
  const [bastionKey, setBastionKey] = React.useState("");
  const [pickedServerId, setPickedServerId] = React.useState("");
  /** operator's unsaved edit of the reachable address; `undefined` → show the saved hostMap entry */
  const [sshTargetEdit, setSshTargetEdit] = React.useState<string | undefined>(undefined);
  const sshServerId = pickedServerId || servers?.[0]?.id || "";
  const sshTarget = sshTargetEdit ?? data?.ssh.hostMap[sshServerId] ?? "";
  const [sshSaving, setSshSaving] = React.useState(false);
  const [sshTesting, setSshTesting] = React.useState(false);
  const [channel, setChannel] = React.useState<DeliveryChannel>("off");
  const [url, setUrl] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [accountSid, setAccountSid] = React.useState("");
  const [authToken, setAuthToken] = React.useState("");
  const [smsFrom, setSmsFrom] = React.useState("");
  const [smsTo, setSmsTo] = React.useState("");
  const [minSeverity, setMinSeverity] = React.useState<Severity>("info");
  const [decisionsOnly, setDecisionsOnly] = React.useState(false);
  const [savingDelivery, setSavingDelivery] = React.useState(false);
  const [testingDelivery, setTestingDelivery] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [savingAuth, setSavingAuth] = React.useState(false);

  // sync the form once per fetched settings snapshot (render-phase adjust, not an effect)
  const [hydratedFrom, setHydratedFrom] = React.useState<typeof data>(undefined);
  if (data && data !== hydratedFrom) {
    setHydratedFrom(data);
    setProvider(data.llm.provider);
    setBaseUrl(data.llm.baseUrl);
    setModel(data.llm.model);
    setEnabled(data.llm.enabled);
    setName(data.operator.name);
    setPhone(data.operator.phone);
    setOrg(data.operator.org);
    setSpeed(data.sim.speed);
    setQuiet(data.sim.quietHours);
    setSshUser(data.ssh.user);
    setSshPort(String(data.ssh.port));
    setSshPolicy(data.ssh.hostKeyPolicy);
    setSshSudo(data.ssh.sudo);
    setBastionHost(data.ssh.bastion?.host ?? "");
    setBastionPort(String(data.ssh.bastion?.port ?? 22));
    setBastionUser(data.ssh.bastion?.user ?? "");
    if (data.delivery) {
      setChannel(data.delivery.channel);
      setUrl(data.delivery.url);
      setAccountSid(data.delivery.twilio.accountSid);
      setSmsFrom(data.delivery.twilio.from);
      setSmsTo(data.delivery.twilio.to);
      setMinSeverity(data.delivery.filter.minSeverity);
      setDecisionsOnly(data.delivery.filter.kinds.length > 0);
    }
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

  const sshPatch = () => ({
    user: sshUser,
    port: Number(sshPort) || 22,
    hostKeyPolicy: sshPolicy,
    sudo: sshSudo,
    ...(sshKey ? { privateKey: sshKey } : {}),
    bastion: bastionHost
      ? { host: bastionHost, port: Number(bastionPort) || 22, user: bastionUser || sshUser, ...(bastionKey ? { privateKey: bastionKey } : {}) }
      : null,
    ...(sshServerId && sshTarget ? { hostMap: { [sshServerId]: sshTarget } } : {}),
  });

  const saveSsh = async () => {
    setSshSaving(true);
    try {
      await api.settings.update({ ssh: sshPatch() });
      setSshKey("");
      setBastionKey("");
      setSshTargetEdit(undefined);
      toast.success("SSH settings saved");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSshSaving(false);
    }
  };

  const testSsh = async () => {
    setSshTesting(true);
    try {
      await api.settings.update({ ssh: sshPatch() });
      setSshKey("");
      setBastionKey("");
      setSshTargetEdit(undefined);
      const r = await api.settings.testSsh(sshServerId);
      toast.success(`Host answered in ${r.latencyMs} ms: “${r.sample ?? "qalaa-ok"}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      void mutate();
      setSshTesting(false);
    }
  };

  const deliveryPatch = () => ({
    channel,
    url,
    twilio: { accountSid, from: smsFrom, to: smsTo },
    filter: { minSeverity, kinds: (decisionsOnly ? ["approval-request", "alert"] : []) as MessageKind[] },
    ...(secret ? { secret } : {}),
    ...(authToken ? { twilioAuthToken: authToken } : {}),
  });

  const saveDelivery = async () => {
    setSavingDelivery(true);
    try {
      await api.settings.update({ delivery: deliveryPatch() });
      setSecret("");
      setAuthToken("");
      toast.success("Delivery settings saved");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSavingDelivery(false);
    }
  };

  const testDelivery = async () => {
    setTestingDelivery(true);
    try {
      await api.settings.update({ delivery: deliveryPatch() });
      setSecret("");
      setAuthToken("");
      const r = await api.settings.testDelivery();
      if (r?.ok) toast.success(`Test message delivered via ${r.channel} in ${r.latencyMs} ms`);
      else toast.error(r?.error ?? "The channel didn't accept the message");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTestingDelivery(false);
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
        <BlurFade delay={0.05} className="flex flex-col gap-4">
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
          <Section
            title="Real hosts (SSH)"
            description="Servers stay simulated until flipped to the ssh adapter. Commands run over ssh2 with the key below; host keys are pinned in .data/secrets.json."
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                User
                <Input value={sshUser} onChange={(e) => setSshUser(e.target.value)} className="mono-data border-line bg-bg-2" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                Port
                <Input inputMode="numeric" value={sshPort} onChange={(e) => setSshPort(e.target.value)} className="mono-data border-line bg-bg-2" />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Host-key policy
              <Select value={sshPolicy} onValueChange={(v) => setSshPolicy((v as SshHostKeyPolicy) ?? "accept-new")} items={HOST_KEY_POLICIES}>
                <SelectTrigger className="border-line bg-bg-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-bg-3">
                  {(Object.keys(HOST_KEY_POLICIES) as SshHostKeyPolicy[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {HOST_KEY_POLICIES[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="mono-data text-[11px] text-text-3">{data?.ssh.knownHostsCount ?? 0} pinned host key(s)</span>
            </label>
            <label className="flex items-center justify-between rounded-[10px] bg-bg-2 px-3 py-2 text-text-1">
              Wrap commands in sudo -n
              <Switch checked={sshSudo} onCheckedChange={(v) => setSshSudo(Boolean(v))} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Private key {data?.ssh.keySet && <span className="text-lime">· key set</span>}
              <Textarea value={sshKey} onChange={(e) => setSshKey(e.target.value)} placeholder={data?.ssh.keySet ? "•••••••• (leave blank to keep)" : "paste an OpenSSH / PEM private key"} className="mono-data max-h-24 border-line bg-bg-2 text-[11px]" autoComplete="off" spellCheck={false} />
              <span className="text-[11px] text-text-3">Stored server-side in .data/secrets.json. Never sent to the browser.</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                Bastion host (optional)
                <Input value={bastionHost} onChange={(e) => setBastionHost(e.target.value)} placeholder="jump.example.net" className="mono-data border-line bg-bg-2" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                Bastion port
                <Input inputMode="numeric" value={bastionPort} onChange={(e) => setBastionPort(e.target.value)} className="mono-data border-line bg-bg-2" />
              </label>
            </div>
            {bastionHost && (
              <>
                <label className="flex flex-col gap-1 text-[12px] text-text-2">
                  Bastion user
                  <Input value={bastionUser} onChange={(e) => setBastionUser(e.target.value)} placeholder={sshUser} className="mono-data border-line bg-bg-2" autoComplete="off" />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-text-2">
                  Bastion private key {data?.ssh.bastion?.keySet && <span className="text-lime">· key set</span>}
                  <Textarea value={bastionKey} onChange={(e) => setBastionKey(e.target.value)} placeholder={data?.ssh.bastion?.keySet ? "•••••••• (leave blank to keep)" : "paste key (blank → same as above)"} className="mono-data max-h-24 border-line bg-bg-2 text-[11px]" autoComplete="off" spellCheck={false} />
                </label>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                Test against
                <Select value={sshServerId} onValueChange={(v) => { setPickedServerId((v as string) ?? ""); setSshTargetEdit(undefined); }} items={Object.fromEntries((servers ?? []).map((s) => [s.id, s.hostname]))}>
                  <SelectTrigger className="border-line bg-bg-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-line bg-bg-3">
                    {(servers ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.hostname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                Reachable address
                <Input value={sshTarget} onChange={(e) => setSshTargetEdit(e.target.value)} placeholder="host[:port]" className="mono-data border-line bg-bg-2" autoComplete="off" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={saveSsh} disabled={sshSaving}>
                Save
              </Button>
              <Button variant="secondary" onClick={testSsh} disabled={sshTesting || !sshServerId}>
                {sshTesting ? "Testing…" : "Test connection"}
              </Button>
              {data?.ssh.lastTest && (
                <span className={`ml-auto flex items-center gap-1.5 text-[12px] ${data.ssh.lastTest.ok ? "text-lime" : "text-sev-high"}`}>
                  {data.ssh.lastTest.ok ? <CheckCircle weight="fill" className="size-4" /> : <WarningCircle weight="fill" className="size-4" />}
                  {data.ssh.lastTest.ok ? `ok · ${data.ssh.lastTest.latencyMs} ms` : data.ssh.lastTest.error}
                </span>
              )}
            </div>
          </Section>
          <Section
            title="Delivery"
            description="Messages always land in-app. Optionally push the garrison's alerts, approval requests, and reports to a webhook, Slack, or your phone — and reply from there."
          >
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Channel
              <Select value={channel} onValueChange={(v) => setChannel((v as DeliveryChannel) ?? "off")} items={CHANNELS}>
                <SelectTrigger className="border-line bg-bg-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-bg-3">
                  {(Object.keys(CHANNELS) as DeliveryChannel[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {(channel === "webhook" || channel === "slack") && (
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                {channel === "slack" ? "Slack incoming webhook URL" : "Webhook URL"}
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={channel === "slack" ? "https://hooks.slack.com/services/…" : "https://example.com/qalaa"} className="mono-data border-line bg-bg-2" />
              </label>
            )}
            {channel === "webhook" && (
              <label className="flex flex-col gap-1 text-[12px] text-text-2">
                Signing secret {data?.delivery?.secretSet && <span className="text-lime">· set</span>}
                <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={data?.delivery?.secretSet ? "•••••••• (leave blank to keep)" : "shared secret"} className="mono-data border-line bg-bg-2" autoComplete="off" />
                <span className="text-[11px] text-text-3">Signs X-Qalaa-Signature and authenticates JSON replies to /api/messages/inbound. Stored in .data/secrets.json.</span>
              </label>
            )}
            {channel === "twilio" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[12px] text-text-2">
                    Account SID
                    <Input value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="AC…" className="mono-data border-line bg-bg-2" />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] text-text-2">
                    Auth token {data?.delivery?.twilioAuthTokenSet && <span className="text-lime">· set</span>}
                    <Input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder={data?.delivery?.twilioAuthTokenSet ? "•••••••• (leave blank to keep)" : "paste token"} className="mono-data border-line bg-bg-2" autoComplete="off" />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] text-text-2">
                    From (Twilio number)
                    <Input value={smsFrom} onChange={(e) => setSmsFrom(e.target.value)} placeholder="+15550001234" className="mono-data border-line bg-bg-2" />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] text-text-2">
                    To (your phone)
                    <Input value={smsTo} onChange={(e) => setSmsTo(e.target.value)} placeholder="+1…" className="mono-data border-line bg-bg-2" />
                  </label>
                </div>
                <span className="text-[11px] text-text-3">Point the number&apos;s messaging webhook at /api/messages/inbound so replies reach the garrison. Token stored in .data/secrets.json.</span>
              </>
            )}
            {channel !== "off" && (
              <>
                <label className="flex flex-col gap-1 text-[12px] text-text-2">
                  Minimum severity
                  <Select value={minSeverity} onValueChange={(v) => setMinSeverity((v as Severity) ?? "info")} items={SEVERITIES}>
                    <SelectTrigger className="border-line bg-bg-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-line bg-bg-3">
                      {(Object.keys(SEVERITIES) as Severity[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {SEVERITIES[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex items-center justify-between rounded-[10px] bg-bg-2 px-3 py-2 text-text-1">
                  Only alerts and approval requests
                  <Switch checked={decisionsOnly} onCheckedChange={(v) => setDecisionsOnly(Boolean(v))} />
                </label>
              </>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={saveDelivery} disabled={savingDelivery}>
                Save
              </Button>
              {channel !== "off" && (
                <Button variant="secondary" onClick={testDelivery} disabled={testingDelivery}>
                  {testingDelivery ? "Sending…" : "Save & send test"}
                </Button>
              )}
              {data?.delivery?.lastTest && (
                <span className={`ml-auto flex items-center gap-1.5 text-[12px] ${data.delivery.lastTest.ok ? "text-lime" : "text-sev-high"}`}>
                  {data.delivery.lastTest.ok ? <CheckCircle weight="fill" className="size-4" /> : <WarningCircle weight="fill" className="size-4" />}
                  {data.delivery.lastTest.ok ? `ok · ${data.delivery.lastTest.channel} · ${data.delivery.lastTest.latencyMs} ms` : data.delivery.lastTest.error}
                </span>
              )}
            </div>
          </Section>
        </BlurFade>

        <BlurFade delay={0.1} className="flex flex-col gap-4">
          <Section title="Operator" description="Who the garrison texts, and how they address you.">
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
          <Section title="Simulation" description="Clock speed for the world and the garrison's patrols. Quiet hours batch medium alerts into digests.">
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
