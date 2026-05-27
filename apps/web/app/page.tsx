"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isTauri, capabilitiesFor } from "@work-tracker/shared";

export default function Home() {
  const [runtime, setRuntime] = useState<"loading" | "tauri" | "browser">(
    "loading",
  );

  useEffect(() => {
    setRuntime(isTauri() ? "tauri" : "browser");
  }, []);

  const caps = capabilitiesFor(runtime === "tauri");

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 32,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 32, letterSpacing: -0.5 }}>
        work-tracker
      </h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>
        Phase 2 — auth + schema.
      </p>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          minWidth: 320,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--muted)" }}>Runtime</span>
          <strong>{runtime}</strong>
        </div>
        <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
          Capabilities
        </div>
        <ul style={{ marginTop: 4, paddingLeft: 18 }}>
          {caps.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/sign-in">Sign in</Link>
        <Link href="/dashboard">Dashboard</Link>
      </div>
    </main>
  );
}
