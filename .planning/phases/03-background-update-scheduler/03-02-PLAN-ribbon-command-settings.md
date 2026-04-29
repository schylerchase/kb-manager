---
phase: 03-background-update-scheduler
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/main.ts
  - src/settings.ts
autonomous: true
requirements:
  - SCHED-04
must_haves:
  truths:
    - "src/main.ts calls this.addRibbonIcon('rotate-cw', 'KB Manager: Rebuild now', ...) inside onLayoutReady"
    - "src/main.ts calls this.addCommand({id: 'kb-manager-rebuild', name: 'KB Manager: Rebuild now', callback: ...}) inside onLayoutReady"
    - "Both ribbon and command callbacks invoke this.runManualRebuild() (the mutex-wrapped full rebuild from Plan 03-01)"
    - "Manual rebuild fires new Notice('KB Manager: rebuild complete') on success"
    - "Manual rebuild fires new Notice('KB Manager: rebuild failed — see console') on error"
    - "src/settings.ts SettingsHost type includes restartScheduler(): void"
    - "src/settings.ts updateIntervalMinutes slider onChange calls plugin.restartScheduler() AFTER plugin.saveSettings()"
    - "Notice import added to src/main.ts ('obsidian' module)"
  artifacts:
    - path: "src/main.ts"
      provides: "Ribbon icon and palette command for manual rebuild"
      exports: ["default KBManagerPlugin"]
    - path: "src/settings.ts"
      provides: "Settings tab interval slider that restarts the scheduler immediately on change"
      exports: ["KBManagerSettings", "DEFAULT_SETTINGS", "KBSettingsTab"]
  key_links:
    - from: "src/main.ts"
      to: "src/main.ts"
      via: "ribbon callback and command callback both call this.runManualRebuild() (added in Plan 03-01)"
      pattern: "runManualRebuild\\(\\)"
    - from: "src/settings.ts"
      to: "src/main.ts"
      via: "plugin.restartScheduler() invoked from updateIntervalMinutes onChange handler"
      pattern: "restartScheduler\\(\\)"
---

<objective>
Add the user-facing manual rebuild surface (SCHED-04) and wire the settings interval slider
to restart the scheduler immediately. The ribbon icon and command palette entry both call
the same plugin.runManualRebuild() method built in Plan 03-01, so they share the mutex
and the queue-after-tick semantics (D-03). Settings change → timer restart is the D-09
immediate-restart behavior; new tick fires AFTER the new interval.

Purpose: SCHED-04 requires a user-triggered full rebuild. The mutex from Plan 03-01 makes
this safe to call at any time. Settings restart wiring closes the loop so user changes
to interval take effect without an Obsidian reload.

Output: src/main.ts (ribbon + command), src/settings.ts (onChange invokes restartScheduler).
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
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/03-background-update-scheduler/03-01-PLAN-scheduler-mutex.md

<!-- Plan 03-01 must be complete before this plan runs (depends_on: [01]). -->
<!-- runManualRebuild() and restartScheduler() are public methods established in 03-01. -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add ribbon icon and command palette entry for manual rebuild</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (current state after Plan 03-01 — must contain runManualRebuild method)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/03-background-update-scheduler/03-CONTEXT.md (D-06 Notice text, D-07 ribbon icon, D-08 command id)
  </read_first>
  <action>
Modify `src/main.ts` to add the ribbon icon and command. Both register inside the existing
`onLayoutReady` callback, after `startScheduler()` setup. Both share a single handler that
calls `runManualRebuild()` and shows a Notice on completion.

Specific edits:

1. Update the obsidian import to include `Notice`:
```typescript
import { Plugin, TFile, Notice } from 'obsidian';
```

2. Add a private method `triggerManualRebuild()` to KBManagerPlugin (above `registerVaultEvents`):
```typescript
private async triggerManualRebuild(): Promise<void> {
  try {
    await this.runManualRebuild();
    new Notice('KB Manager: rebuild complete');
  } catch (err) {
    console.error('KB Manager: manual rebuild failed', err);
    new Notice('KB Manager: rebuild failed — see console');
  }
}
```

3. Inside the `onLayoutReady` callback, AFTER the `.finally(() => this.startScheduler())` line,
   register the ribbon icon and command. Update the onLayoutReady block to look like this
   (everything before `.catch` stays the same; the `.then(...)` chain extends):

```typescript
this.app.workspace.onLayoutReady(() => {
  this.statusBarItem = this.addStatusBarItem();
  this.statusBarItem.setText(STATUS_IDLE);

  this.registerVaultEvents();

  this.runWithLock(() => this.index.rebuild())
    .catch(err => console.error('KB Manager: initial rebuild failed', err))
    .finally(() => {
      this.startScheduler();
      this.addRibbonIcon('rotate-cw', 'KB Manager: Rebuild now', () => {
        this.triggerManualRebuild();
      });
      this.addCommand({
        id: 'kb-manager-rebuild',
        name: 'KB Manager: Rebuild now',
        callback: () => { this.triggerManualRebuild(); },
      });
    });
});
```

Notes:
- Both ribbon and command callbacks call `triggerManualRebuild()` (fire-and-forget — Obsidian
  doesn't await the callback). The method itself awaits internally and shows the Notice.
- `addRibbonIcon` and `addCommand` are auto-cleaned on plugin unload — no manual deregister needed.
- Ribbon and command register AFTER initial rebuild + scheduler start, so user clicking immediately
  on plugin load is queued safely behind the initial rebuild via the existing mutex.
- File line count target: ≤ 220 lines after this change (was ~140 after Plan 03-01).
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "addRibbonIcon" src/main.ts && grep -c "addCommand" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "Notice" src/main.ts` outputs at least 3 (import + success notice + failure notice)
    - `grep "import.*Notice.*from 'obsidian'" src/main.ts` matches at least 1 line (Notice imported)
    - `grep -c "addRibbonIcon" src/main.ts` outputs 1
    - `grep "rotate-cw" src/main.ts` matches at least 1 line
    - `grep "KB Manager: Rebuild now" src/main.ts` matches at least 2 lines (ribbon tooltip + command name)
    - `grep -c "addCommand" src/main.ts` outputs 1
    - `grep "kb-manager-rebuild" src/main.ts` matches exactly 1 line (command id)
    - `grep -c "triggerManualRebuild" src/main.ts` outputs at least 3 (declaration + ribbon callback + command callback)
    - `grep "rebuild complete" src/main.ts` matches at least 1 line (success Notice)
    - `grep "rebuild failed" src/main.ts` matches at least 1 line (failure Notice)
    - `grep -c "runManualRebuild" src/main.ts` outputs at least 2 (declaration from Plan 03-01 + call from triggerManualRebuild)
    - `wc -l src/main.ts` ≤ 220
  </acceptance_criteria>
  <done>Ribbon icon (rotate-cw) and command palette entry (KB Manager: Rebuild now) both fire triggerManualRebuild, which calls the mutex-wrapped runManualRebuild from Plan 03-01 and shows success/failure Notice. SCHED-04 satisfied.</done>
</task>

<task type="auto">
  <name>Task 2: Wire interval slider onChange to plugin.restartScheduler()</name>
  <files>src/settings.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/settings.ts (current SettingsHost type and slider onChange — lines 20-22, 47-56)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/03-background-update-scheduler/03-CONTEXT.md (D-09: settings change → immediate timer restart; D-10: new tick fires AFTER new interval, not immediately)
  </read_first>
  <action>
Modify `src/settings.ts` to extend the `SettingsHost` type with `restartScheduler()` and call
it from the interval slider's `onChange` handler after `saveSettings()`.

Specific edits:

1. Update the `SettingsHost` type (currently lines 20-23) to add `restartScheduler`:

```typescript
type SettingsHost = {
  settings: KBManagerSettings;
  saveSettings(): Promise<void>;
  restartScheduler(): void;
};
```

2. Update the `Update interval` slider's `onChange` handler in `buildGeneralSection`
   (currently lines 47-56). After the existing `await this.plugin.saveSettings()` call,
   call `this.plugin.restartScheduler()`. The new handler:

```typescript
.addSlider(s =>
  s
    .setLimits(1, 60, 1)
    .setValue(this.plugin.settings.updateIntervalMinutes)
    .setDynamicTooltip()
    .onChange(async v => {
      this.plugin.settings.updateIntervalMinutes = v;
      try {
        await this.plugin.saveSettings();
        this.plugin.restartScheduler();
      } catch (err) {
        console.error('KB Manager: failed to save settings', err);
      }
    })
);
```

Notes:
- `restartScheduler()` is synchronous — no `await`. It calls `clearInterval` then
  `window.setInterval` again. The new tick fires AFTER the freshly-set interval elapses,
  not immediately (D-10 — avoids a rebuild storm during slider drag).
- The auto-injection toggle and per-folder rules onChange handlers DO NOT need to call
  `restartScheduler()` — those settings don't affect the timer.
- The exclusion patterns onChange handler also does not call `restartScheduler()` — exclusions
  affect the next rebuild's contents, not the timer cadence.
- `KBManagerPlugin` from `src/main.ts` already satisfies the extended `SettingsHost` type
  because `restartScheduler` was made public in Plan 03-01.

After editing, run the build:

```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "restartScheduler" src/settings.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "restartScheduler" src/settings.ts` outputs at least 2 (type declaration + call site)
    - `grep "restartScheduler(): void" src/settings.ts` matches exactly 1 line (in SettingsHost type)
    - `grep -A2 "saveSettings()" src/settings.ts | grep -c "restartScheduler()"` outputs at least 1 (called immediately after saveSettings in interval slider handler)
    - `grep -B5 "restartScheduler()" src/settings.ts | grep -c "updateIntervalMinutes"` outputs at least 1 (call is in the interval slider context, not other settings)
    - File line count: `wc -l src/settings.ts` ≤ 145
  </acceptance_criteria>
  <done>SettingsHost type includes restartScheduler. Interval slider onChange calls plugin.restartScheduler() after saveSettings. user changes to interval take effect immediately without plugin reload.</done>
</task>

</tasks>

<verification>
After all tasks complete:

```bash
cd /Users/schylerryan/Desktop/Github/kb-manager
npm run build
npm test
```

Expected: build exits 0, tests pass (no Phase 3 unit tests added — pure-logic absent;
existing Phase 1+2 test suites must still pass).

Manual UAT (in Obsidian dev vault):

1. Reload plugin. Status bar shows `KB: idle` after initial rebuild settles.
2. Click ribbon icon (rotate-cw glyph). Status bar shows `KB: rebuilding…` then back to
   `KB: idle`. Notice toast `KB Manager: rebuild complete` appears for ~4s.
3. Open command palette. Search "KB Manager". `KB Manager: Rebuild now` is listed. Run it.
   Same status bar transition + same Notice.
4. Open settings → KB Manager → drag Update interval slider from 5 → 1. Wait 1 minute.
   Status bar should cycle to `KB: rebuilding…` then back. (Confirm new interval took
   effect — no Obsidian reload required.)
5. Modify a vault note. Trigger ribbon rebuild manually. Confirm the modified note's
   FileRecord is up-to-date in the index (check via developer console or via
   downstream feature in Phase 4).
6. SCHED-02 mutex test: with a large vault (5000+ notes if available — otherwise simulate
   by adding `await new Promise(r => setTimeout(r, 5000))` temporarily inside `rebuild()`),
   click ribbon TWICE rapidly. Confirm only one rebuild runs to completion at a time;
   second click queues. Status bar shows `KB: rebuilding…` continuously through both.
   Remove the temporary delay after testing.

Phase 3 success criteria from ROADMAP.md (all 3 must be TRUE):
1. ✅ Background rebuilds run on configured interval without blocking UI — verified by
   `window.setInterval` non-blocking nature and `rebuildDirty()` async behavior.
2. ✅ Manual rebuild during background does not start a second concurrent rebuild —
   verified by mutex test in step 6 above.
3. ✅ Vault events registered after `onLayoutReady` — verified by Plan 03-01 acceptance
   criterion `grep -B1 "registerVaultEvents()" src/main.ts | grep -c "onLayoutReady"`.
</verification>
