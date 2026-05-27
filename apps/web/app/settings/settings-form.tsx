"use client";

import { useCallback, useEffect, useState } from "react";
import { redirect } from "next/navigation";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
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

import {
  fetchFreeChatModels,
  fetchFreeVisionModels,
  validateKey,
  type OpenRouterModel,
} from "@/lib/openrouter";
import {
  DEFAULT_SETTINGS,
  clearOpenRouterKey,
  getOpenRouterKey,
  setOpenRouterKey,
  type ServerSettings,
} from "@/lib/settings-store";
import { ghAuthStatus, isAutostartEnabled, setAutostart } from "@/lib/tauri-bridge";

type KeyStatus = "unknown" | "checking" | "valid" | "invalid";

export default function SettingsForm() {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("unknown");
  const [visionModels, setVisionModels] = useState<OpenRouterModel[]>([]);
  const [chatModels, setChatModels] = useState<OpenRouterModel[]>([]);
  const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tauri, setTauri] = useState(false);
  const [autostartOn, setAutostartOn] = useState(false);
  const [ghStatus, setGhStatus] = useState<string>("");
  const [ghChecking, setGhChecking] = useState(false);

  useEffect(() => {
    const k = getOpenRouterKey() ?? "";
    setKey(k);
    const inTauri = isTauri();
    setTauri(inTauri);
    if (inTauri) void isAutostartEnabled().then(setAutostartOn);
    fetch("/api/settings")
      .then(async (r) => {
        if (r.status === 401) {
          redirect("/sign-in");
          return;
        }
        if (!r.ok) throw new Error(`settings: ${r.status}`);
        const s = (await r.json()) as ServerSettings;
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

  const validate = useCallback(async () => {
    if (!key.trim()) {
      setKeyStatus("invalid");
      setVisionModels([]);
      setChatModels([]);
      return;
    }
    setKeyStatus("checking");
    try {
      const ok = await validateKey(key.trim());
      if (!ok) {
        setKeyStatus("invalid");
        toast.error("Invalid OpenRouter key.");
        return;
      }
      setKeyStatus("valid");
      const [vision, chat] = await Promise.all([
        fetchFreeVisionModels(key.trim()),
        fetchFreeChatModels(key.trim()),
      ]);
      setVisionModels(vision);
      setChatModels(chat);
    } catch (e) {
      setKeyStatus("invalid");
      toast.error(String(e));
    }
  }, [key]);

  useEffect(() => {
    if (key && keyStatus === "unknown") void validate();
  }, [key, keyStatus, validate]);

  async function save() {
    setSaving(true);
    try {
      if (key.trim()) setOpenRouterKey(key.trim());
      else clearOpenRouterKey();
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`save: ${res.status}`);
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
          <CardTitle className="flex items-center justify-between">
            OpenRouter API key
            <KeyBadge status={keyStatus} count={visionModels.length} />
          </CardTitle>
          <CardDescription>
            Stored in your browser only. Never sent to our server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
            <Button onClick={validate} disabled={keyStatus === "checking" || !key.trim()} variant="secondary">
              {keyStatus === "checking" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {keyStatus === "checking" ? "Checking" : "Validate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
          <CardDescription>Free OpenRouter models. Vision for tracking; any free model for the chat agent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModelPicker
            label="Vision model (tracking)"
            value={settings.vlmModel}
            options={visionModels}
            disabled={loading || keyStatus !== "valid"}
            onChange={(v) => setSettings({ ...settings, vlmModel: v })}
            empty="Validate your key to load free vision models."
          />
          <ModelPicker
            label="Chat model (Ask)"
            value={settings.chatModel}
            options={chatModels}
            disabled={loading || keyStatus !== "valid"}
            onChange={(v) => setSettings({ ...settings, chatModel: v })}
            empty="Validate your key to load free chat models."
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
  options: OpenRouterModel[];
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
