"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchFreeChatModels,
  fetchFreeVisionModels,
  validateKey,
  type OpenRouterModel,
} from "@/lib/openrouter";
import { isAutostartEnabled, setAutostart } from "@/lib/tauri-bridge";
import { isTauri } from "@work-tracker/shared";
import {
  DEFAULT_SETTINGS,
  clearOpenRouterKey,
  getOpenRouterKey,
  setOpenRouterKey,
  type ServerSettings,
} from "@/lib/settings-store";

type KeyStatus = "unknown" | "checking" | "valid" | "invalid";

export default function SettingsPage() {
  const [key, setKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("unknown");
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [chatModels, setChatModels] = useState<OpenRouterModel[]>([]);
  const [autostartOn, setAutostartOn] = useState(false);
  const [tauri, setTauri] = useState(false);
  const [settings, setSettings] = useState<ServerSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Load saved key + server settings on mount.
  useEffect(() => {
    const k = getOpenRouterKey() ?? "";
    setKey(k);
    const inTauri = isTauri();
    setTauri(inTauri);
    if (inTauri) void isAutostartEnabled().then(setAutostartOn);
    fetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error(`settings: ${r.status}`);
        const s = (await r.json()) as ServerSettings;
        setSettings({
          vlmModel: s.vlmModel,
          chatModel: s.chatModel,
          captureIntervalSec: s.captureIntervalSec,
          batchIntervalSec: s.batchIntervalSec,
        });
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const validate = useCallback(async () => {
    if (!key.trim()) {
      setKeyStatus("invalid");
      setModels([]);
      return;
    }
    setKeyStatus("checking");
    setErr(null);
    try {
      const ok = await validateKey(key.trim());
      if (!ok) {
        setKeyStatus("invalid");
        setModels([]);
        return;
      }
      setKeyStatus("valid");
      const [vision, chat] = await Promise.all([
        fetchFreeVisionModels(key.trim()),
        fetchFreeChatModels(key.trim()),
      ]);
      setModels(vision);
      setChatModels(chat);
    } catch (e) {
      setKeyStatus("invalid");
      setErr(String(e));
    }
  }, [key]);

  // Auto-validate if a key was already saved.
  useEffect(() => {
    if (key && keyStatus === "unknown") void validate();
  }, [key, keyStatus, validate]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      if (key.trim()) setOpenRouterKey(key.trim());
      else clearOpenRouterKey();

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`save: ${res.status} ${await res.text()}`);
      setMsg("Saved.");
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Shell>Loading…</Shell>;

  return (
    <Shell>
      <h1 style={{ margin: 0, fontSize: 24 }}>Settings</h1>

      <Card title="OpenRouter API key" hint="Stored in your browser only. Never sent to our server.">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="password"
            placeholder="sk-or-..."
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setKeyStatus("unknown");
            }}
            style={inputStyle}
          />
          <button onClick={validate} style={btnStyle} disabled={keyStatus === "checking"}>
            {keyStatus === "checking" ? "Checking…" : "Validate"}
          </button>
        </div>
        <KeyStatusLine status={keyStatus} count={models.length} />
      </Card>

      <Card title="Vision model" hint="Free, vision-capable models from OpenRouter.">
        {models.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Validate your key to load model choices. Current:{" "}
            <code>{settings.vlmModel}</code>
          </p>
        ) : (
          <select
            value={settings.vlmModel}
            onChange={(e) => setSettings({ ...settings, vlmModel: e.target.value })}
            style={inputStyle}
          >
            {!models.find((m) => m.id === settings.vlmModel) && (
              <option value={settings.vlmModel}>{settings.vlmModel} (saved)</option>
            )}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.id}
              </option>
            ))}
          </select>
        )}
      </Card>

      <Card title="Chat model" hint="Used by the agentic RAG /chat. Any free model.">
        {chatModels.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Validate your key to load choices. Current: <code>{settings.chatModel}</code>
          </p>
        ) : (
          <select
            value={settings.chatModel}
            onChange={(e) => setSettings({ ...settings, chatModel: e.target.value })}
            style={inputStyle}
          >
            {!chatModels.find((m) => m.id === settings.chatModel) && (
              <option value={settings.chatModel}>{settings.chatModel} (saved)</option>
            )}
            {chatModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.id}
              </option>
            ))}
          </select>
        )}
      </Card>

      {tauri && (
        <Card title="Startup" hint="Drops a shortcut in your Windows Startup folder.">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={autostartOn}
              onChange={async (e) => {
                const v = e.target.checked;
                setAutostartOn(v);
                try {
                  await setAutostart(v);
                } catch (err) {
                  setAutostartOn(!v);
                  setErr(String(err));
                }
              }}
            />
            Start work-tracker when I sign in
          </label>
        </Card>
      )}

      <Card title="Cadence">
        <Row label={`Capture every ${settings.captureIntervalSec}s`}>
          <input
            type="range"
            min={5}
            max={120}
            value={settings.captureIntervalSec}
            onChange={(e) =>
              setSettings({ ...settings, captureIntervalSec: Number(e.target.value) })
            }
            style={{ width: "100%" }}
          />
        </Row>
        <Row label={`Send batch every ${Math.round(settings.batchIntervalSec / 60)} min`}>
          <input
            type="range"
            min={60}
            max={1800}
            step={30}
            value={settings.batchIntervalSec}
            onChange={(e) =>
              setSettings({ ...settings, batchIntervalSec: Number(e.target.value) })
            }
            style={{ width: "100%" }}
          />
        </Row>
      </Card>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={save} disabled={saving} style={{ ...btnStyle, background: "var(--accent)" }}>
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span style={{ color: "var(--accent)" }}>{msg}</span>}
        {err && <span style={{ color: "#ff6b6b" }}>{err}</span>}
      </div>
    </Shell>
  );
}

function KeyStatusLine({ status, count }: { status: KeyStatus; count: number }) {
  const map: Record<KeyStatus, { text: string; color: string }> = {
    unknown: { text: "Not validated.", color: "var(--muted)" },
    checking: { text: "Checking…", color: "var(--muted)" },
    valid: { text: `Valid. ${count} free vision model${count === 1 ? "" : "s"} available.`, color: "#7c5cff" },
    invalid: { text: "Invalid key.", color: "#ff6b6b" },
  };
  const s = map[status];
  return <p style={{ margin: "8px 0 0", fontSize: 13, color: s.color }}>{s.text}</p>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
      {children}
    </main>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h2>
      {hint && <p style={{ margin: "4px 0 12px", color: "var(--muted)", fontSize: 13 }}>{hint}</p>}
      {!hint && <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "#0a0a0a",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  width: "100%",
};

const btnStyle: React.CSSProperties = {
  background: "#1a1a1a",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
};
