"use client";

import { useCallback, useEffect, useState } from "react";
import { redirect } from "next/navigation";
import { Check, Download, Eye, EyeOff, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { isTauri } from "@work-tracker/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { listModels, type ProviderModel } from "@/lib/llm";
import {
  DEFAULT_SETTINGS,
  DEFAULT_LMSTUDIO_URL,
  clearOpenRouterKey,
  getLmStudioUrl,
  getOpenRouterKey,
  getProvider,
  setLmStudioUrl,
  setOpenRouterKey,
  setProvider,
  type LlmProvider,
  type ServerSettings,
} from "@/lib/settings-store";
import { ghAuthStatus, isAutostartEnabled, setAutostart } from "@/lib/tauri-bridge";
import { dataGetSettings, dataPutSettings } from "@/lib/data-client";
import { getStorageMode, setStorageMode, type StorageMode } from "@/lib/storage-mode";
import {
  localClear,
  localExport,
  localImport,
  localUsage,
} from "@/lib/db-local";

type KeyStatus = "unknown" | "checking" | "valid" | "invalid";

export default function SettingsForm() {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("unknown");
  const [provider, setProviderState] = useState<LlmProvider>("openrouter");
  const [lmUrl, setLmUrl] = useState(DEFAULT_LMSTUDIO_URL);
  const [visionModels, setVisionModels] = useState<ProviderModel[]>([]);
  const [chatModels, setChatModels] = useState<ProviderModel[]>([]);
  const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tauri, setTauri] = useState(false);
  const [autostartOn, setAutostartOn] = useState(false);
  const [ghStatus, setGhStatus] = useState<string>("");
  const [ghChecking, setGhChecking] = useState(false);
  const [mode, setMode] = useState<StorageMode>("cloud");
  const [usage, setUsage] = useState<{ sessions: number; commits: number; estBytes: number } | null>(null);

  useEffect(() => {
    setMode(getStorageMode());
    if (getStorageMode() === "local") void localUsage().then(setUsage);
    setProviderState(getProvider());
    setLmUrl(getLmStudioUrl());
    const k = getOpenRouterKey() ?? "";
    setKey(k);
    const inTauri = isTauri();
    setTauri(inTauri);
    if (inTauri) void isAutostartEnabled().then(setAutostartOn);
    dataGetSettings()
      .then((s) => {
        setSettings({
          vlmModel: s.vlmModel,
          chatModel: s.chatModel,
          captureIntervalSec: s.captureIntervalSec,
          batchIntervalSec: s.batchIntervalSec,
        });
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Loads models for the currently-selected provider. For OpenRouter we
  // persist + use the key and keep only free models (vision-filtered for the
  // VLM picker). For LM Studio we hit its /v1/models on the configured URL.
  const loadModels = useCallback(async () => {
    setKeyStatus("checking");
    try {
      if (provider === "openrouter") {
        if (!key.trim()) {
          setKeyStatus("invalid");
          setVisionModels([]);
          setChatModels([]);
          return;
        }
        setOpenRouterKey(key.trim());
      } else {
        setLmStudioUrl(lmUrl);
      }
      const models = await listModels();
      setKeyStatus("valid");
      const free = provider === "openrouter" ? models.filter((m) => m.free) : models;
      setVisionModels(free.filter((m) => m.vision));
      setChatModels(free);
      if (provider === "lmstudio") toast.success(`Connected — ${models.length} model(s).`);
    } catch (e) {
      setKeyStatus("invalid");
      toast.error(String(e));
    }
  }, [provider, key, lmUrl]);

  // Auto-load once when the relevant config is present.
  useEffect(() => {
    if (keyStatus !== "unknown") return;
    if (provider === "openrouter" && key) void loadModels();
    if (provider === "lmstudio" && lmUrl) void loadModels();
  }, [provider, key, lmUrl, keyStatus, loadModels]);

  function switchProvider(p: LlmProvider) {
    if (p === provider) return;
    setProvider(p);
    setProviderState(p);
    setKeyStatus("unknown");
    setVisionModels([]);
    setChatModels([]);
  }

  function switchMode(next: StorageMode) {
    if (next === mode) return;
    setStorageMode(next);
    setMode(next);
    if (next === "local") void localUsage().then(setUsage);
    else setUsage(null);
    toast.success(next === "local" ? "Switched to local-only mode." : "Switched to cloud account.");
    // Reload so server pages re-evaluate auth/data source.
    setTimeout(() => window.location.reload(), 400);
  }

  async function exportData() {
    try {
      const json = await localExport();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `work-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await localImport(text);
      void localUsage().then(setUsage);
      toast.success(`Imported ${res.sessions} sessions, ${res.commits} commits.`);
    } catch (err) {
      toast.error(`Import failed: ${String(err)}`);
    } finally {
      e.target.value = "";
    }
  }

  async function clearData() {
    if (!confirm("Delete all locally stored tracking data? This cannot be undone.")) return;
    try {
      await localClear();
      void localUsage().then(setUsage);
      toast.success("Local data cleared.");
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (key.trim()) setOpenRouterKey(key.trim());
      else clearOpenRouterKey();
      await dataPutSettings(settings);
      toast.success("Settings saved.");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your OpenRouter key and tracking cadence.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Storage &amp; privacy</CardTitle>
          <CardDescription>
            Choose where your tracked data lives. Switching does not migrate
            existing data between cloud and this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <ModeOption
              active={mode === "cloud"}
              title="Cloud account"
              desc="Synced to your account (Neon). Available across devices."
              onClick={() => switchMode("cloud")}
            />
            <ModeOption
              active={mode === "local"}
              title="This device only"
              desc="Everything stays in this browser/app. Nothing leaves the device."
              onClick={() => switchMode("local")}
            />
          </div>

          {mode === "local" && (
            <div className="rounded-md border bg-muted/20 p-3 space-y-3">
              {usage && (
                <p className="text-xs text-muted-foreground">
                  {usage.sessions} sessions · {usage.commits} commits
                  {usage.estBytes > 0 && ` · ~${(usage.estBytes / 1024 / 1024).toFixed(1)} MB used`}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={exportData}>
                  <Download className="h-3.5 w-3.5" /> Export JSON
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <label className="cursor-pointer">
                    <Upload className="h-3.5 w-3.5" /> Import JSON
                    <input type="file" accept="application/json" className="hidden" onChange={importData} />
                  </label>
                </Button>
                <Button size="sm" variant="destructive" onClick={clearData}>
                  <Trash2 className="h-3.5 w-3.5" /> Clear local data
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            LLM provider
            <KeyBadge status={keyStatus} count={visionModels.length} />
          </CardTitle>
          <CardDescription>
            Use OpenRouter (cloud) or LM Studio (fully on-device). Settings stay
            in your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <ModeOption
              active={provider === "openrouter"}
              title="OpenRouter"
              desc="Hosted models. Needs an API key."
              onClick={() => switchProvider("openrouter")}
            />
            <ModeOption
              active={provider === "lmstudio"}
              title="LM Studio (local)"
              desc="Runs models on this machine. No data leaves the device."
              onClick={() => switchProvider("lmstudio")}
            />
          </div>

          {provider === "openrouter" ? (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-or-..."
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setKeyStatus("unknown");
                  }}
                  className="pr-9 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={loadModels} disabled={keyStatus === "checking" || !key.trim()} variant="secondary">
                {keyStatus === "checking" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {keyStatus === "checking" ? "Checking" : "Validate"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="lmurl">LM Studio server URL</Label>
              <div className="flex gap-2">
                <Input
                  id="lmurl"
                  value={lmUrl}
                  onChange={(e) => {
                    setLmUrl(e.target.value);
                    setKeyStatus("unknown");
                  }}
                  placeholder={DEFAULT_LMSTUDIO_URL}
                  className="flex-1 font-mono text-sm"
                />
                <Button onClick={loadModels} disabled={keyStatus === "checking" || !lmUrl.trim()} variant="secondary">
                  {keyStatus === "checking" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {keyStatus === "checking" ? "Connecting" : "Connect"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Start LM Studio → Developer tab → enable the local server (and CORS).
                Load a vision model for tracking. Default: <code>{DEFAULT_LMSTUDIO_URL}</code>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
          <CardDescription>
            {provider === "openrouter"
              ? "Free OpenRouter models. Vision for tracking; any free model for chat."
              : "Models available in LM Studio. Pick a vision model for tracking."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModelPicker
            label="Vision model (tracking)"
            value={settings.vlmModel}
            options={visionModels}
            disabled={loading || keyStatus !== "valid"}
            onChange={(v) => setSettings({ ...settings, vlmModel: v })}
            empty={provider === "openrouter" ? "Validate your key to load vision models." : "Connect to LM Studio to load models."}
          />
          <ModelPicker
            label="Chat model (Ask)"
            value={settings.chatModel}
            options={chatModels}
            disabled={loading || keyStatus !== "valid"}
            onChange={(v) => setSettings({ ...settings, chatModel: v })}
            empty={provider === "openrouter" ? "Validate your key to load chat models." : "Connect to LM Studio to load models."}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cadence</CardTitle>
          <CardDescription>How often to capture frames and ship batches to the VLM.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Slider
            label="Capture frame"
            value={settings.captureIntervalSec}
            min={5}
            max={120}
            step={1}
            display={`every ${settings.captureIntervalSec}s`}
            onChange={(v) => setSettings({ ...settings, captureIntervalSec: v })}
          />
          <Slider
            label="Send batch"
            value={settings.batchIntervalSec}
            min={60}
            max={1800}
            step={30}
            display={`every ${Math.round(settings.batchIntervalSec / 60)} min`}
            onChange={(v) => setSettings({ ...settings, batchIntervalSec: v })}
          />
        </CardContent>
      </Card>

      {tauri && (
        <Card>
          <CardHeader>
            <CardTitle>GitHub</CardTitle>
            <CardDescription>
              Diagnostics for the local <code>gh</code> CLI. Use this to see
              which orgs are authorized and what scopes your token has.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={ghChecking}
                onClick={async () => {
                  setGhChecking(true);
                  try {
                    setGhStatus(await ghAuthStatus());
                  } catch (e) {
                    setGhStatus(String(e));
                  } finally {
                    setGhChecking(false);
                  }
                }}
              >
                {ghChecking && <Loader2 className="h-4 w-4 animate-spin" />}
                Check gh status
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                Missing private commits? Run <code>gh auth refresh -s read:org,repo</code> in your terminal.
              </p>
            </div>
            {ghStatus && (
              <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/40 border rounded-md p-3 max-h-64 overflow-auto">
                {ghStatus}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      {tauri && (
        <Card>
          <CardHeader>
            <CardTitle>Desktop</CardTitle>
            <CardDescription>Behavior specific to the Tauri desktop app.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="autostart" className="text-sm">Launch on login</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Drops a shortcut in your Windows Startup folder.
                </p>
              </div>
              <Switch
                id="autostart"
                checked={autostartOn}
                onCheckedChange={async (v) => {
                  setAutostartOn(v);
                  try {
                    await setAutostart(v);
                  } catch (e) {
                    setAutostartOn(!v);
                    toast.error(String(e));
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function ModeOption({
  active, title, desc, onClick,
}: { active: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition-colors ${
        active ? "border-primary bg-primary/5" : "hover:bg-accent"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-3.5 w-3.5 rounded-full border-2 ${
            active ? "border-primary bg-primary" : "border-muted-foreground"
          }`}
        />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1 ml-5.5">{desc}</p>
    </button>
  );
}

function KeyBadge({ status, count }: { status: KeyStatus; count: number }) {
  if (status === "valid")
    return <Badge variant="default" className="gap-1"><Check className="h-3 w-3" /> {count} vision models</Badge>;
  if (status === "invalid")
    return <Badge variant="destructive">Invalid</Badge>;
  if (status === "checking")
    return <Badge variant="secondary">Checking…</Badge>;
  return <Badge variant="outline">Not validated</Badge>;
}

function ModelPicker({
  label, value, options, disabled, onChange, empty,
}: {
  label: string;
  value: string;
  options: ProviderModel[];
  disabled: boolean;
  onChange: (v: string) => void;
  empty: string;
}) {
  const hasSaved = !options.find((m) => m.id === value);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {empty} Current: <code className="text-foreground">{value}</code>
        </p>
      ) : (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hasSaved && (
              <SelectItem value={value}>
                {value} <span className="text-muted-foreground">(saved)</span>
              </SelectItem>
            )}
            {options.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
                <span className="text-muted-foreground"> — {m.id}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function Slider({
  label, value, min, max, step, display, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <Label>{label}</Label>
        <span className="text-sm text-muted-foreground tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}
