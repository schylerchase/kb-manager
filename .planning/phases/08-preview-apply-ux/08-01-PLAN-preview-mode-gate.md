---
phase: 08-preview-apply-ux
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/settings.ts
  - src/main.ts
  - README.md
  - installers/README.md
autonomous: true
requirements:
  - PREV-01
  - PREV-02
  - PREV-03
must_haves:
  truths:
    - "src/settings.ts KBManagerSettings interface declares generatedWritesEnabled: boolean"
    - "src/settings.ts DEFAULT_SETTINGS sets generatedWritesEnabled: false"
    - "src/settings.ts SettingsHost type declares runManualRebuild(): Promise<void>"
    - "src/settings.ts display() renders a 'Generated content writes' toggle that calls plugin.runManualRebuild() when flipped on"
    - "src/main.ts defines STATUS_PREVIEW = 'KB: preview'"
    - "src/main.ts runGenerators returns after notifySidebarRefresh when settings.generatedWritesEnabled is false"
    - "src/main.ts statusText() returns STATUS_IDLE when writes enabled, STATUS_PREVIEW when disabled"
    - "src/main.ts runManualRebuild Notice text branches on settings.generatedWritesEnabled"
    - "README.md and installers/README.md document preview-mode default"
  artifacts:
    - path: "src/settings.ts"
      provides: "Master gate setting + toggle UI that triggers immediate apply when enabled"
      exports: ["KBManagerSettings", "DEFAULT_SETTINGS", "KBSettingsTab"]
    - path: "src/main.ts"
      provides: "runGenerators short-circuits writes in preview mode; status bar + Notice surface mode to user"
      exports: ["default KBManagerPlugin"]
  key_links:
    - from: "src/settings.ts"
      to: "src/main.ts"
      via: "SettingsHost.runManualRebuild() called from toggle handler; plugin.settings.generatedWritesEnabled read by runGenerators/statusText/runManualRebuild"
      pattern: "generatedWritesEnabled"
---

<objective>
Add a default-off `generatedWritesEnabled` master gate so first-run users see the
indexed structure in the sidebar before any `MOC.md`, `INDEX.md`, or managed-section
write happens. Surface the mode in the status bar and the manual-rebuild Notice;
document the default in the README and installer README.

Output: src/settings.ts + src/main.ts updated; README + installer docs note preview
mode; build clean; existing tests pass.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/08-preview-apply-ux/08-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-03-PLAN-main-integration.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-03-PLAN-main-integration.md

<!-- src state at start of this plan: phases 1-7 complete. main.ts has settings,
     VaultIndex, mocGenerator, tocGenerator, tagManager, scheduler, status bar
     (STATUS_IDLE / STATUS_REBUILDING), ribbon for rebuild, ribbon + command for
     sidebar, runGenerators awaits moc + toc then notifies sidebar.
     settings.ts has KBManagerSettings, DEFAULT_SETTINGS, KBSettingsTab with
     interval slider, autoInject toggle, excludedPaths text area, defaultMocFormat
     dropdown, per-folder rules table. -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add generatedWritesEnabled field, default, and toggle UI in settings.ts</name>
  <files>src/settings.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/settings.ts (current state — output of phases 1-7)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/08-preview-apply-ux/08-CONTEXT.md (D-01..D-03)
  </read_first>
  <action>
Edit `src/settings.ts`:

1. Extend `KBManagerSettings` interface — add field at the top of the interface body:
```typescript
generatedWritesEnabled: boolean;
```

2. Extend `DEFAULT_SETTINGS` — add as the first key:
```typescript
generatedWritesEnabled: false,
```

3. Extend the `SettingsHost` type used by the settings tab:
```typescript
type SettingsHost = {
  // ...existing members
  runManualRebuild(): Promise<void>;
};
```

4. In `KBSettingsTab.display()`, render the toggle as the FIRST setting block (before
   the interval slider):
```typescript
new Setting(containerEl)
  .setName('Generated content writes')
  .setDesc(
    'Off by default. Preview the MOC tree and tags without creating MOC.md, INDEX.md, or updating managed sections.'
  )
  .addToggle(t =>
    t
      .setValue(this.plugin.settings.generatedWritesEnabled)
      .onChange(async v => {
        this.plugin.settings.generatedWritesEnabled = v;
        try {
          await this.plugin.saveSettings();
          if (v) await this.plugin.runManualRebuild();
        } catch (err) {
          console.error('KB Manager: failed to save settings', err);
        }
      })
  );
```

5. Reword the existing `Update interval` and `Auto-inject MOC sections` descriptions
   so they refer to "when writes are enabled" — makes the master gate dependency
   explicit. Also reword `Default MOC format` to use "planned" instead of "delivered"
   so the description holds when writes are off.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "generatedWritesEnabled" src/settings.ts && grep -c "Generated content writes" src/settings.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "generatedWritesEnabled: boolean" src/settings.ts` outputs 1
    - `grep -c "generatedWritesEnabled: false" src/settings.ts` outputs 1
    - `grep -c "runManualRebuild(): Promise<void>" src/settings.ts` outputs 1
    - `grep -c "Generated content writes" src/settings.ts` outputs 1
    - `grep -c "this.plugin.runManualRebuild()" src/settings.ts` outputs 1
    - `wc -l src/settings.ts` outputs ≤ 300
  </acceptance_criteria>
  <done>Setting interface, default, and toggle UI in place. Toggle handler triggers immediate apply when enabled. SettingsHost type exposes runManualRebuild for type-safe call.</done>
</task>

<task type="auto">
  <name>Task 2: Gate runGenerators, add STATUS_PREVIEW, branch Notice text in main.ts</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (current state — output of phase 7)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/08-preview-apply-ux/08-CONTEXT.md (D-04..D-08)
  </read_first>
  <action>
Edit `src/main.ts`:

1. Add status constant alongside existing `STATUS_IDLE` / `STATUS_REBUILDING`:
```typescript
const STATUS_PREVIEW = 'KB: preview';
```

2. Add `private statusText()` helper near `runGenerators`:
```typescript
private statusText(): string {
  return this.settings.generatedWritesEnabled ? STATUS_IDLE : STATUS_PREVIEW;
}
```

3. Replace every `setText(STATUS_IDLE)` call site that runs OUTSIDE an in-flight
   rebuild (initial set in `onLayoutReady`, finally branch in `runManualRebuild`)
   with `setText(this.statusText())`. The mid-rebuild `STATUS_REBUILDING` text and
   the in-flight setter stay as-is.

4. In `runGenerators`, short-circuit when writes are disabled:
```typescript
private async runGenerators(): Promise<void> {
  if (!this.settings.generatedWritesEnabled) {
    this.notifySidebarRefresh();
    return;
  }
  await this.mocGenerator.run();
  await this.tocGenerator.run();
  this.notifySidebarRefresh();
}
```

5. In `runManualRebuild`, branch the success Notice on the setting:
```typescript
const message = this.settings.generatedWritesEnabled
  ? 'KB Manager: rebuild complete'
  : 'KB Manager: preview refreshed - generated writes are off';
new Notice(message);
```

Build:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "STATUS_PREVIEW" src/main.ts && grep -c "generatedWritesEnabled" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "STATUS_PREVIEW = 'KB: preview'" src/main.ts` outputs 1
    - `grep -c "private statusText()" src/main.ts` outputs 1
    - `grep -A4 "private async runGenerators" src/main.ts | grep -c "generatedWritesEnabled"` outputs at least 1
    - `grep -c "preview refreshed - generated writes are off" src/main.ts` outputs 1
    - `grep -c "this.statusText()" src/main.ts` outputs at least 2 (one per setText call site that swapped from STATUS_IDLE)
    - `wc -l src/main.ts` outputs ≤ 340
  </acceptance_criteria>
  <done>Write gate in place at runGenerators. Status bar reflects mode via statusText() helper. Manual-rebuild Notice text branches on the setting.</done>
</task>

<task type="auto">
  <name>Task 3: Document preview-mode default in README and installer README</name>
  <files>README.md, installers/README.md</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/README.md
    - /Users/schylerryan/Desktop/Github/kb-manager/installers/README.md
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/08-preview-apply-ux/08-CONTEXT.md (D-09)
  </read_first>
  <action>
Edit `README.md` — append after the "After installing, reload Obsidian and enable..."
paragraph and before the `## Manual Install` heading:

```
On first enable, KB Manager starts in preview mode. It indexes the vault and opens the sidebar, but it does not create `MOC.md`, create `INDEX.md`, or update managed sections until `Generated content writes` is enabled in the plugin settings.
```

Edit `installers/README.md` — append at the end of the file:

```
KB Manager starts in preview mode. It indexes the vault and shows the sidebar without writing generated files or managed sections until `Generated content writes` is enabled in the plugin settings.
```
  </action>
  <verify>
    <automated>grep -c "preview mode" README.md && grep -c "preview mode" installers/README.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "preview mode" README.md` outputs 1
    - `grep -c "preview mode" installers/README.md` outputs 1
    - `grep -c "Generated content writes" README.md` outputs 1
    - `grep -c "Generated content writes" installers/README.md` outputs 1
  </acceptance_criteria>
  <done>Both README files mention preview-mode default and how to opt in.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build && npm test
```
Expected: build exits 0, tests pass.

Manual UAT (full Phase 8 verification):

1. **PREV-01 — fresh install default.** Disable + re-enable plugin (or install on a
   vault that has never run KB Manager). Status bar reads `KB: preview`. No
   `MOC.md` or `INDEX.md` files appear. No managed sections in user notes update.

2. **PREV-02 — manual rebuild in preview.** Click rebuild ribbon. Notice reads
   `KB Manager: preview refreshed - generated writes are off`. `git status` on
   the vault shows no plugin-authored writes.

3. **PREV-02 — scheduled rebuild in preview.** Wait for the scheduler tick (or
   set `updateIntervalMinutes` to 1 to speed up). Sidebar refreshes. No writes.

4. **Toggle ON applies immediately.** Open Settings → KB Manager. Flip
   `Generated content writes` ON. Notice reads `KB Manager: rebuild complete`.
   `MOC.md` files appear in non-excluded folders. Managed inline sections update
   where delimiters exist.

5. **Status bar reflects mode.** With writes ON and idle, status bar reads
   `KB: idle`. Flip OFF — bar returns to `KB: preview`.

6. **Toggle OFF leaves disk untouched.** With writes OFF after a prior apply,
   `MOC.md` files stay on disk. Run rebuild — files are NOT modified.

7. **Persistence.** Restart Obsidian. Setting persists. Mode (whichever was last
   chosen) carries over.

8. **Existing settings still work.** With writes ON, the existing interval slider,
   exclusion paths, autoInject toggle, default MOC format, and per-folder rules
   all behave the same as before this phase.

Phase 8 success criteria from ROADMAP.md (3 must be TRUE):
1. ✅ First-run users see indexed structure in sidebar with no vault writes —
   verified by step 1 + step 2
2. ✅ Toggle in settings opts in to writes and triggers immediate apply —
   verified by step 4
3. ✅ Status bar and rebuild Notice surface preview mode clearly —
   verified by steps 1, 2, 4, 5
</verification>
