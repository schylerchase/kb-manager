---
phase: 03-background-update-scheduler
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main.ts
autonomous: true
requirements:
  - SCHED-01
  - SCHED-02
  - SCHED-03
must_haves:
  truths:
    - "src/main.ts declares private schedulerHandle: number | null and private rebuildLock: Promise<void> | null on KBManagerPlugin"
    - "src/main.ts adds startScheduler(), stopScheduler(), restartScheduler(), runScheduledTick() methods on KBManagerPlugin"
    - "runScheduledTick() returns immediately when this.rebuildLock is non-null (drop semantics for D-03 reverse case)"
    - "runScheduledTick() calls this.index.rebuildDirty() through the shared rebuildLock pattern"
    - "startScheduler() uses window.setInterval (not bare setInterval) and registers via this.registerInterval()"
    - "onLayoutReady callback awaits the initial rebuild before calling startScheduler() (D-11 ordering)"
    - "registerVaultEvents() is still called inside the onLayoutReady callback (SCHED-03 verification)"
    - "addStatusBarItem() is called once during onLayoutReady and the returned element shows 'KB: idle' initially"
    - "Status bar text becomes 'KB: rebuilding…' before each rebuild and 'KB: idle' after each rebuild (success or failure)"
    - "onunload() calls clearInterval(this.schedulerHandle) when the handle is non-null"
    - "No bare setInterval call exists in src/main.ts (window.setInterval only)"
    - "No console.log call exists in src/main.ts (console.error allowed for failures)"
  artifacts:
    - path: "src/main.ts"
      provides: "Plugin class with periodic scheduler, rebuild mutex, and status bar item"
      exports: ["default KBManagerPlugin"]
  key_links:
    - from: "src/main.ts"
      to: "src/VaultIndex.ts"
      via: "this.index.rebuildDirty() (scheduled tick) and this.index.rebuild() (initial)"
      pattern: "this\\.index\\.rebuild(Dirty)?\\(\\)"
    - from: "src/main.ts"
      to: "src/settings.ts"
      via: "this.settings.updateIntervalMinutes consumed by startScheduler()"
      pattern: "updateIntervalMinutes"
---

<objective>
Add the periodic background scheduler and rebuild mutex to KBManagerPlugin. The tick calls
VaultIndex.rebuildDirty() at the user-configured interval (default 5 min). A single
Promise-based mutex prevents concurrent rebuilds. A status bar item exposes idle/rebuilding
state. Vault events stay registered inside onLayoutReady (SCHED-03 already-correct verification).

Purpose: Background updates keep MOC/TOC/tag generators current without user intervention.
The mutex (D-04) ensures the manual ribbon command (Plan 03-02) can queue safely behind a
running tick. The status bar (D-05) is the single visible signal of background activity.

Output: src/main.ts with scheduler, mutex, and status bar wired through onLayoutReady.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/ROADMAP.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/03-background-update-scheduler/03-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md

<interfaces>
<!-- Methods/fields added to KBManagerPlugin in this plan. Plan 03-02 calls these. -->

class KBManagerPlugin extends Plugin {
  // Existing (Phase 1+2):
  settings!: KBManagerSettings;
  index!: VaultIndex;

  // New in Plan 03-01:
  private schedulerHandle: number | null = null;
  private rebuildLock: Promise<void> | null = null;
  private statusBarItem: HTMLElement | null = null;

  // New methods:
  private startScheduler(): void;
  private stopScheduler(): void;
  restartScheduler(): void;            // public — settings.ts onChange calls this
  private runScheduledTick(): Promise<void>;
  runManualRebuild(): Promise<void>;   // public — Plan 03-02 ribbon/command call this
}
</interfaces>

<!-- Existing patterns to follow: -->
<!-- Phase 1 main.ts already wires onLayoutReady → registerVaultEvents() + initial rebuild() -->
<!-- Plan 03-01 inserts startScheduler() AFTER initial rebuild settles -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add scheduler + mutex state fields and methods to KBManagerPlugin</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (current Phase 1+2 implementation — 65 lines)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts (rebuild() and rebuildDirty() signatures consumed by scheduler)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/03-background-update-scheduler/03-CONTEXT.md (D-01..D-12, especially D-04 mutex pattern, D-05 status bar text, D-11 ordering)
    - /Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md (window.setInterval rule, no console.log rule)
  </read_first>
  <action>
Modify `src/main.ts` to add scheduler, mutex, and status bar to `KBManagerPlugin`. The full
target file is below — replace the existing contents entirely. Key changes from current
implementation:

1. Add three private fields: `schedulerHandle`, `rebuildLock`, `statusBarItem`.
2. Add `addStatusBarItem()` call inside `onLayoutReady` (after settings load, before any rebuild).
3. After `addSettingTab()` in `onload()` — no change.
4. Inside `onLayoutReady`: existing `registerVaultEvents()` call stays; existing `this.index.rebuild()` is wrapped via `runWithLock()` and AWAITED (D-11) before `startScheduler()` runs.
5. Add `startScheduler`, `stopScheduler`, `restartScheduler`, `runScheduledTick`, `runManualRebuild`, and `runWithLock` helper methods.
6. `onunload()` calls `clearInterval(this.schedulerHandle)` when non-null.

Replace the entire file with this exact content:

```typescript
import { Plugin, TFile } from 'obsidian';
import { KBManagerSettings, DEFAULT_SETTINGS, KBSettingsTab } from 'settings';
import VaultIndex from './VaultIndex';

const STATUS_IDLE = 'KB: idle';
const STATUS_REBUILDING = 'KB: rebuilding…';

export default class KBManagerPlugin extends Plugin {
  settings!: KBManagerSettings;
  index!: VaultIndex;

  private schedulerHandle: number | null = null;
  private rebuildLock: Promise<void> | null = null;
  private statusBarItem: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.index = new VaultIndex(this.app, this.settings.excludedPaths);

    // Register settings tab immediately — safe to do in onload.
    this.addSettingTab(new KBSettingsTab(this.app, this));

    // Defer ALL vault work, event registration, and scheduler start.
    // D-11: initial full rebuild awaited before scheduler ticks start.
    this.app.workspace.onLayoutReady(() => {
      this.statusBarItem = this.addStatusBarItem();
      this.statusBarItem.setText(STATUS_IDLE);

      this.registerVaultEvents();

      // Initial full rebuild via the same lock the scheduler uses,
      // so a tick that fires during init waits its turn (defensive).
      this.runWithLock(() => this.index.rebuild())
        .catch(err => console.error('KB Manager: initial rebuild failed', err))
        .finally(() => this.startScheduler());
    });
  }

  onunload(): void {
    if (this.schedulerHandle !== null) {
      clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
    // registerEvent() and registerInterval() also auto-clean.
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // --- Scheduler ---

  private startScheduler(): void {
    const intervalMs = this.settings.updateIntervalMinutes * 60_000;
    this.schedulerHandle = window.setInterval(() => {
      this.runScheduledTick().catch(err =>
        console.error('KB Manager: scheduled tick failed', err)
      );
    }, intervalMs);
    this.registerInterval(this.schedulerHandle);
  }

  private stopScheduler(): void {
    if (this.schedulerHandle !== null) {
      clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
  }

  /** Public: settings.ts onChange handler calls this when the user changes the interval. */
  restartScheduler(): void {
    this.stopScheduler();
    this.startScheduler();
  }

  /** D-01 + D-03: dirty-only on tick, dropped if a rebuild is already in flight. */
  private async runScheduledTick(): Promise<void> {
    if (this.rebuildLock) return; // drop — manual or earlier tick still running
    await this.runWithLock(() => this.index.rebuildDirty());
  }

  // --- Mutex ---

  /**
   * D-04: single-promise lock. Each entry point awaits the existing lock,
   * then sets a new lock for its own work, then clears.
   */
  private async runWithLock(work: () => Promise<void>): Promise<void> {
    const previous = this.rebuildLock;
    if (previous) await previous;

    this.statusBarItem?.setText(STATUS_REBUILDING);
    const current = (async () => {
      try {
        await work();
      } finally {
        this.statusBarItem?.setText(STATUS_IDLE);
      }
    })();
    this.rebuildLock = current;

    try {
      await current;
    } finally {
      // Only clear if this call still owns the lock (a later call may have replaced it).
      if (this.rebuildLock === current) this.rebuildLock = null;
    }
  }

  /** Public: ribbon and palette command (Plan 03-02) call this. Full rebuild via the lock. */
  async runManualRebuild(): Promise<void> {
    await this.runWithLock(() => this.index.rebuild());
  }

  // --- Vault events (Phase 2 — unchanged) ---

  private registerVaultEvents(): void {
    this.registerEvent(
      this.app.vault.on('modify', file => {
        if (file instanceof TFile) this.index.markDirty(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on('create', file => {
        if (file instanceof TFile) this.index.markDirty(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.index.remove(oldPath);
        if (file instanceof TFile) this.index.markDirty(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', file => {
        if (file instanceof TFile) this.index.remove(file.path);
      })
    );
  }
}
```

Notes:
- The mutex implementation uses `previous = this.rebuildLock; await previous;` — a manual rebuild that arrives during a tick will queue (D-03 forward case). A tick that fires during a manual rebuild is dropped by `runScheduledTick`'s early-return (D-03 reverse case).
- Status bar text constants `STATUS_IDLE` / `STATUS_REBUILDING` extracted to module scope so D-05 strings live in one place.
- `runWithLock` updates the status bar synchronously around the work — single status item, no race.
- File stays under 200 lines (target: ~140 lines). Functions all under 30 lines. Nesting max 3 levels.

After replacing the file, verify the build still type-checks:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "window.setInterval" src/main.ts && grep -cE "console\\.log\\(" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0 (no TypeScript errors)
    - `grep -c "schedulerHandle" src/main.ts` outputs at least 4 (declaration + start + stop + onunload)
    - `grep -c "rebuildLock" src/main.ts` outputs at least 4
    - `grep -c "window.setInterval" src/main.ts` outputs 1
    - `grep -cE "[^.]setInterval\\(" src/main.ts` outputs 0 (no bare setInterval anywhere)
    - `grep -c "console.log" src/main.ts` outputs 0
    - `grep -c "addStatusBarItem" src/main.ts` outputs 1
    - `grep -c "registerInterval" src/main.ts` outputs 1
    - `grep -c "onLayoutReady" src/main.ts` outputs 1
    - `grep -c "registerVaultEvents" src/main.ts` outputs at least 2 (declaration + call site inside onLayoutReady)
    - `grep -B1 "registerVaultEvents()" src/main.ts | grep -c "onLayoutReady"` outputs at least 1 (SCHED-03: registerVaultEvents called inside onLayoutReady, not onload)
    - `grep "STATUS_IDLE" src/main.ts | head -1` matches `'KB: idle'`
    - `grep "STATUS_REBUILDING" src/main.ts | head -1` matches `'KB: rebuilding…'` (note: with ellipsis character or three dots — check both)
    - `grep -c "async runManualRebuild" src/main.ts` outputs 1
    - `grep -c "restartScheduler" src/main.ts` outputs at least 2 (declaration + JSDoc reference)
    - File line count: `wc -l src/main.ts` ≤ 200
  </acceptance_criteria>
  <done>src/main.ts compiles, contains scheduler with window.setInterval, mutex with single Promise lock, status bar item, and registerVaultEvents stays inside onLayoutReady. SCHED-01 (periodic tick), SCHED-02 (mutex), SCHED-03 (events in onLayoutReady) all satisfied.</done>
</task>

</tasks>

<verification>
After all tasks complete, run:

```bash
cd /Users/schylerryan/Desktop/Github/kb-manager
npm run build
```

Expected: exit 0, no TypeScript errors. Functional verification (load plugin in Obsidian,
watch status bar cycle "KB: idle" → "KB: rebuilding…" → "KB: idle" on initial load and
every 5 minutes) is performed in Plan 03-02 UAT and Phase 3 verification.

The mutex behavior under contention is validated by Plan 03-02 UAT (manual rebuild during
a long initial rebuild on a large vault).
</verification>
