# Phase 3: Background Update Scheduler - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Run `VaultIndex.rebuildDirty()` on a configurable periodic timer, expose a manual full-rebuild ribbon command, and prevent concurrent rebuilds via a mutex. Settings interval changes restart the timer immediately. SCHED-03 (vault events in `onLayoutReady`) is already implemented in `src/main.ts`; this phase adds the scheduler, ribbon command, mutex, and visibility surfaces around what already exists.

Requirements in scope: SCHED-01, SCHED-02, SCHED-03 (verify-only — already wired), SCHED-04

</domain>

<decisions>
## Implementation Decisions

### Tick Scope (SCHED-01)
- **D-01:** Periodic tick calls `VaultIndex.rebuildDirty()` only — never full rebuild. Vault events already mark dirty on modify/create/rename/delete (see `src/main.ts` `registerVaultEvents`). Out-of-band edits (Obsidian Sync, external editors) are picked up by manual rebuild or restart. Rationale: scales to 5000+ note vaults; full rebuild every 5 min wastes CPU. Initial full rebuild on `onLayoutReady` (already wired) covers cold-start drift.

### Mutex Contention (SCHED-02)
- **D-02:** Mutex is a single `Promise<void> | null` lock on the plugin instance. Tick and manual command both check the lock before starting; whoever holds it runs to completion.
- **D-03:** Manual rebuild fires while background tick running → **queued**. Manual command awaits the in-progress tick, then runs full `rebuild()`. Queue depth = 1: duplicate manual clicks during a queued state coalesce (no stacking). Background tick that fires while a manual rebuild is running → **dropped** (manual is full rebuild — running rebuildDirty immediately after is redundant).
- **D-04:** Mutex implementation: store `private rebuildLock: Promise<void> | null = null` on the plugin. Each entry point: `await this.rebuildLock; this.rebuildLock = doRebuild(); await this.rebuildLock; this.rebuildLock = null;`. No external library — plain promise chaining.

### Visibility (Polish)
- **D-05:** Status bar item via `addStatusBarItem()` shows current state: `KB: idle` / `KB: rebuilding…`. Always visible. Updated on rebuild start and rebuild end (success and error). Single short string — no progress percentage.
- **D-06:** Manual rebuild fires `new Notice('KB Manager: rebuild complete')` on success and `new Notice('KB Manager: rebuild failed — see console')` on error. Background ticks NEVER fire Notices (would spam every 5 min). Background errors logged via `console.error` only (CLAUDE.md forbids `console.log` for production, allows `error`/`warn`/`debug`).

### Ribbon Command (SCHED-04)
- **D-07:** Ribbon icon `rotate-cw` (Lucide refresh icon, native to Obsidian's icon set). Tooltip: `KB Manager: Rebuild now`. Click triggers full `VaultIndex.rebuild()` via the mutex (queued if background tick in progress).
- **D-08:** Same action also registered as a command palette command (`kb-manager-rebuild` / `KB Manager: Rebuild now`) so user can hotkey it. Ribbon icon and palette command call the same handler.

### Settings → Timer Restart
- **D-09:** Update interval slider in `KBSettingsTab` (settings.ts:48-56) `onChange` handler calls `plugin.restartScheduler()` after `saveSettings()`. `restartScheduler()` clears the existing timer handle and starts a new `window.setInterval` with the fresh interval. New tick fires after the new interval elapses (no immediate tick on restart — avoids accidental rebuild storm during slider drag).
- **D-10:** Plugin holds the timer handle as `private schedulerHandle: number | null`. `registerInterval()` is also called for Obsidian's auto-cleanup on unload (defensive — `clearInterval` on settings change handles the normal path). On `onunload`, explicit `clearInterval(this.schedulerHandle)` for symmetry, even though `registerInterval` would handle it.

### Lifecycle
- **D-11:** Scheduler starts inside `onLayoutReady` callback (not `onload`) — same gate as vault events. Ordering: initial `rebuild()` kicks off → `registerVaultEvents()` → start scheduler. Initial rebuild is awaited before scheduler starts to avoid the first tick racing the initial full rebuild.
- **D-12:** SCHED-03 verification: assert that `registerVaultEvents()` is called inside the `onLayoutReady` callback in `main.ts:19-24` — already correct. No new code needed for SCHED-03; phase plan must include a check task that fails if anything moves these registrations into `onload()`.

### Claude's Discretion
- Method naming: `restartScheduler` / `startScheduler` / `stopScheduler` / `runScheduledTick` etc. — pick clear names following project conventions.
- Status bar update mechanism — direct `setText()` calls vs subscribing to a state event. Direct is fine for two states.
- Whether to expose mutex as a separate `RebuildMutex` class or inline on the plugin — inline is acceptable given small surface (one promise, two entry points).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` §Update Scheduling — SCHED-01..04 full requirement text
- `.planning/ROADMAP.md` §Phase 3 — Success criteria (3 criteria that must be TRUE)
- `.planning/PROJECT.md` — Core constraints, performance + UI responsiveness requirements

### Project Rules (MANDATORY)
- `CLAUDE.md` §Critical Obsidian Plugin Rules — `window.setInterval` (NOT bare `setInterval`), `onLayoutReady` for event/heavy work, no `console.log` in production (use `warn`/`error`/`debug`), `vault.process()` for any future writes
- `CLAUDE.md` §Stack — TypeScript 5.8+, esbuild, Vitest

### Prior Phase Decisions
- `.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md` §Default Settings (D-05) — interval default = 5 min; settings schema already includes `updateIntervalMinutes` (1–60 range)
- `.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md` §VaultIndex API (D-10, D-11) — `rebuild()`, `rebuildDirty()`, `onRebuildComplete` callback contracts that this phase consumes

### Existing Code (consumed and modified by Phase 3)
- `src/main.ts:19-24` — `onLayoutReady` callback; scheduler start, ribbon registration, and command registration go here. Initial `rebuild()` already wired.
- `src/main.ts:42-64` — `registerVaultEvents()` already wires `vault.on('modify'|'create'|'rename'|'delete')` to `index.markDirty`/`remove`. SCHED-03 already satisfied; verify only.
- `src/VaultIndex.ts:44-58` — `rebuild()` (full) — called by manual command and initial startup
- `src/VaultIndex.ts:64-80` — `rebuildDirty()` (incremental) — called by periodic tick
- `src/settings.ts:42-56` — `updateIntervalMinutes` slider in settings tab; `onChange` handler must invoke `plugin.restartScheduler()` after `saveSettings()`

### Obsidian API surfaces used in this phase
- `Plugin.addRibbonIcon(icon, title, callback)` — SCHED-04 ribbon registration
- `Plugin.addCommand({id, name, callback})` — palette command for hotkey support
- `Plugin.addStatusBarItem()` — status bar element for D-05
- `Plugin.registerInterval(window.setInterval(...))` — defensive auto-cleanup
- `new Notice(message)` — manual rebuild feedback (D-06)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VaultIndex.rebuild()` — full rebuild, called by manual ribbon and initial startup
- `VaultIndex.rebuildDirty()` — incremental rebuild, called by periodic tick
- `VaultIndex.onRebuildComplete` — single callback fired after every rebuild; not consumed by this phase but Phase 7 sidebar will hook here
- `KBManagerSettings.updateIntervalMinutes` — already in schema, default 5 (Phase 1 D-05); slider UI already exists in settings.ts

### Established Patterns
- Pure-logic separation: scheduler logic itself is Obsidian-coupled (uses `window.setInterval`, `Plugin` lifecycle), but the mutex helper could be a pure module if extracted. NOT required — inline mutex is acceptable per D-04.
- All heavy work and event registration happens inside `onLayoutReady` (Phase 1 + Phase 2 lock).
- `registerEvent`, `registerInterval` for auto-cleanup on unload — defensive default.

### Integration Points
- `main.ts onload()` → after `loadSettings()` and `new VaultIndex(...)` and `addSettingTab(...)`: nothing changes here.
- `main.ts onLayoutReady callback` → after `registerVaultEvents()` and initial `rebuild().catch(...)`: add `addRibbonIcon`, `addCommand`, `addStatusBarItem`, then `startScheduler()`.
- `main.ts onunload()` → add `clearInterval(this.schedulerHandle)` for explicit symmetry.
- `settings.ts buildGeneralSection()` → update interval slider `onChange` invokes `plugin.restartScheduler()` after `saveSettings()`. Cast `plugin` to expose this method or extend the `SettingsHost` type.

</code_context>

<specifics>
## Specific Details

- Mutex pattern: `await this.rebuildLock; this.rebuildLock = (async () => { ... })(); try { await this.rebuildLock; } finally { this.rebuildLock = null; }`. Tick guard: `if (this.rebuildLock) return;` (drop). Manual: queues by awaiting the existing lock, then runs.
- Ribbon icon: `rotate-cw` (Lucide). Alternatives if `rotate-cw` looks off: `refresh-cw`, `database`. control should pick one and stick.
- Status bar text: exact strings `KB: idle` and `KB: rebuilding…`. Single space, lowercase after colon. Updated synchronously on rebuild entry/exit.
- Notice text: `KB Manager: rebuild complete` / `KB Manager: rebuild failed — see console`. Default Notice timeout (4s).
- Command id: `kb-manager-rebuild`. Command name: `KB Manager: Rebuild now`.
- `restartScheduler()` semantics: `clearInterval(this.schedulerHandle); this.schedulerHandle = window.setInterval(this.tick.bind(this), intervalMs); this.registerInterval(this.schedulerHandle);` — full restart. New tick fires AFTER the new interval, not immediately.
- `intervalMs = this.settings.updateIntervalMinutes * 60_000` — convert minutes (1..60) to ms.
- Vitest coverage: pure mutex helper if extracted (queue + drop semantics under concurrent calls). If mutex stays inline, this phase has no pure-logic to unit-test — verification via integration testing or manual UAT.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Possible future ideas like exponential backoff on rebuild failure, pause-while-typing, or visual rebuild progress bar are out of scope for v1.)

</deferred>

---

*Phase: 3-Background Update Scheduler*
*Context gathered: 2026-04-29*
