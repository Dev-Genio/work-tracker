# work-tracker

Screen-capture + git + process-aware work logger. Single Next.js codebase, deployed on Vercel and wrapped by Tauri for native capabilities (gh CLI, process list, system stats).

## Layout

```
apps/
  web/        Next.js 15 app (Vercel)
  desktop/    Tauri 2 shell loading the same UI
packages/
  shared/     Types + cross-runtime helpers (isTauri, capability flags)
```

## Dev

```sh
npm install
npm run dev            # web at http://localhost:3000
npm run tauri:dev      # desktop window pointed at the web dev server
```

## Phases

- [x] **Phase 1** — Foundations: monorepo, Next.js, Tauri shell, shared package
- [ ] Phase 2 — Neon Auth (Google) + Neon Postgres schema
- [ ] Phase 3 — Settings UI + OpenRouter model picker (key in localStorage)
- [ ] Phase 4 — Capture loop (browser path) + VLM ingest
- [ ] Phase 5 — Tauri enrichments (gh, processes, sysinfo)
- [ ] Phase 6 — Dashboard + timesheet exports
- [ ] Phase 7 — Agentic RAG chat
- [ ] Phase 8 — Polish (tray, autostart, pause/resume)
