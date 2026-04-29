---
phase: 02-vaultindex-core-data-layer
plan: 03
type: execute
wave: 3
depends_on:
  - 02-02
files_modified:
  - src/main.ts
autonomous: true
requirements:
  - INDX-01
  - INDX-04
must_haves:
  truths:
    - "KBManagerPlugin has a property 'index' typed as VaultIndex (not optional — initialized in onload)"
    - "this.index is created in onload() before onLayoutReady fires, passing this.app and this.settings.excludedPaths"
    - "this.index.rebuild() is awaited inside the onLayoutReady callback"
    - "registerVaultEvents() calls vault.on('modify'), vault.on('create'), vault.on('rename'), vault.on('delete')"
    - "modify and create events call this.index.markDirty(file.path)"
    - "rename event calls this.index.remove(oldPath) then this.index.markDirty(newPath)"
    - "delete event calls this.index.remove(file.path)"
    - "All vault.on() calls are inside registerVaultEvents() which is called from onLayoutReady (per D-08 and CLAUDE.md)"
  artifacts:
    - path: "src/main.ts"
      provides: "Plugin entry point with VaultIndex wired into lifecycle and vault events"
      exports: ["KBManagerPlugin (default)"]
  key_links:
    - from: "src/main.ts onload()"
      to: "src/VaultIndex.ts constructor"
      via: "this.index = new VaultIndex(this.app, this.settings.excludedPaths)"
      pattern: "new VaultIndex"
    - from: "src/main.ts onLayoutReady callback"
      to: "src/VaultIndex.ts rebuild()"
      via: "await this.index.rebuild()"
      pattern: "this\\.index\\.rebuild"
    - from: "src/main.ts registerVaultEvents()"
      to: "src/VaultIndex.ts markDirty()/remove()"
      via: "this.registerEvent(this.app.vault.on('modify', ...))"
      pattern: "this\\.index\\.markDirty|this\\.index\\.remove"
---

<objective>
Wire VaultIndex into the plugin lifecycle: create the index in onload(), trigger the initial full
rebuild in onLayoutReady(), and register vault event listeners (modify/create/rename/delete) that
keep the dirty set current between scheduled rebuilds.

Purpose: Connects the data layer (Plans 02-01, 02-02) to the running plugin. After this plan,
the index is live from vault open and tracks changes in real time.

Output: src/main.ts modified (not replaced — preserve existing settings and tab registration)
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/ROADMAP.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md

<interfaces>
<!-- Contracts from Plan 02-02 that this plan wires against: -->

// src/VaultIndex.ts (default export):
export default class VaultIndex {
  onRebuildComplete: (() => void) | null;
  constructor(app: App, excludedPaths: string[])
  markDirty(filePath: string): void
  remove(filePath: string): void
  async rebuild(): Promise<void>
  async rebuildDirty(): Promise<void>
  getFilesInFolder(folderPath: string): FileRecord[]
  getFilesWithTag(tag: string): string[]
  getHeadings(filePath: string): HeadingRecord[]
  getAllFolders(): string[]
  getTagTree(): Map<string, TagNode>
  isDirty(filePath: string): boolean
}

// Obsidian vault event API (used in registerVaultEvents):
// this.registerEvent(this.app.vault.on('modify', (file: TAbstractFile) => ...))
// this.registerEvent(this.app.vault.on('create', (file: TAbstractFile) => ...))
// this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => ...))
// this.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => ...))
// TFile (extends TAbstractFile) has .path: string
// Use 'instanceof TFile' guard before accessing .path to skip folder events

<!-- Current src/main.ts structure (Phase 1): -->
// - onload(): loads settings, adds settings tab, calls onLayoutReady with registerVaultEvents placeholder
// - registerVaultEvents(): empty placeholder — Phase 2 fills this
// - loadSettings(), saveSettings() — leave untouched
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire VaultIndex into main.ts lifecycle and vault events</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (MUST read current file — modify, do not replace)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts (exact constructor signature and method names to call)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md (D-08: which events mark dirty vs remove; D-12: VaultIndex lives on this.index)
    - /Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md (Critical rules: onLayoutReady, no console.log)
  </read_first>
  <action>
Modify `src/main.ts`. Read the file first (current content is ~40 lines from Phase 1). Make the
following targeted changes — preserve all existing code (loadSettings, saveSettings, settings tab
registration, onLayoutReady call structure).

**Change 1: Add import at top (after existing obsidian import):**
```typescript
import VaultIndex from './VaultIndex';
```
Also add `TFile` to the obsidian import if not already present:
```typescript
import { Plugin, TFile } from 'obsidian';
```

**Change 2: Add index property declaration on the class (after `settings!`):**
```typescript
index!: VaultIndex;
```

**Change 3: In onload(), after loadSettings() and before addSettingTab, initialize the index:**
```typescript
this.index = new VaultIndex(this.app, this.settings.excludedPaths);
```

**Change 4: In the onLayoutReady callback, call rebuild after registerVaultEvents:**
```typescript
this.app.workspace.onLayoutReady(() => {
  this.registerVaultEvents();
  this.index.rebuild().catch(err => {
    console.error('KB Manager: initial rebuild failed', err);
  });
});
```
Note: rebuild() returns a Promise. Use `.catch()` to surface errors without blocking layout.
Do NOT use `await` at the top level of onLayoutReady since it is a sync callback.

**Change 5: Replace the empty registerVaultEvents() body with vault event registrations:**
```typescript
private registerVaultEvents(): void {
  this.registerEvent(
    this.app.vault.on('modify', (file) => {
      if (file instanceof TFile) this.index.markDirty(file.path);
    })
  );
  this.registerEvent(
    this.app.vault.on('create', (file) => {
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
    this.app.vault.on('delete', (file) => {
      if (file instanceof TFile) this.index.remove(file.path);
    })
  );
}
```

**Rules:**
- Use `this.registerEvent()` (Plugin API method) — NOT bare `this.app.vault.on()` — so Obsidian
  auto-cleans event listeners on plugin unload
- `instanceof TFile` guard on every handler to skip TFolder events (vaults fire folder events too)
- No console.log — only console.error for the rebuild().catch() error surface
- Do NOT change onunload() — it remains empty (registerEvent auto-cleans)
- Do NOT change loadSettings() or saveSettings()
- File must stay under 300 lines after changes (current ~40 lines + ~40 new lines = ~80 total)
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "this.index.rebuild" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "this.index.rebuild" src/main.ts` outputs `1`
    - `grep "index!: VaultIndex" src/main.ts` matches exactly 1 line
    - `grep "new VaultIndex" src/main.ts` matches exactly 1 line containing `this.settings.excludedPaths`
    - `grep "import VaultIndex from" src/main.ts` matches exactly 1 line pointing to `'./VaultIndex'`
    - `grep "vault.on('modify'" src/main.ts` matches exactly 1 line inside registerVaultEvents
    - `grep "vault.on('create'" src/main.ts` matches exactly 1 line inside registerVaultEvents
    - `grep "vault.on('rename'" src/main.ts` matches exactly 1 line inside registerVaultEvents
    - `grep "vault.on('delete'" src/main.ts` matches exactly 1 line inside registerVaultEvents
    - `grep "markDirty" src/main.ts` matches at least 2 lines (modify + create handlers)
    - `grep "this.index.remove" src/main.ts` matches at least 2 lines (rename old path + delete handler)
    - `grep "instanceof TFile" src/main.ts` matches at least 3 lines (one per event handler)
    - `grep -v "^[[:space:]]*//" src/main.ts | grep -c "console\.log"` outputs `0`
    - `grep "this.registerEvent" src/main.ts` matches exactly 4 lines (one per vault event)
    - `grep "onLayoutReady" src/main.ts` matches exactly 1 line (structure preserved from Phase 1)
  </acceptance_criteria>
  <done>src/main.ts wires VaultIndex into onload (creation), onLayoutReady (initial rebuild), and registerVaultEvents (4 vault event handlers); all events use this.registerEvent for auto-cleanup</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Obsidian vault events → registerVaultEvents handlers | File create/modify/rename/delete events from Obsidian's vault fire with TAbstractFile arguments |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-08 | Denial of Service | registerVaultEvents (event burst) | mitigate | Events registered inside onLayoutReady per CLAUDE.md rule — Obsidian's MetadataCache is fully built before any vault event fires; eliminates startup burst that would mark every file dirty on load |
| T-02-09 | Tampering | rename handler | accept | oldPath and file.path are both provided by Obsidian's vault API; no user-supplied string enters this path; worst-case is a stale path key in the index map (harmless — lookup returns undefined) |
| T-02-10 | Denial of Service | rebuild().catch() in onLayoutReady | accept | Error is logged via console.error; plugin remains functional with empty index; next scheduled rebuild (Phase 3) will retry |
</threat_model>

<verification>
After task completes, verify the full integration chain:

```bash
grep -n "onLayoutReady\|registerVaultEvents\|this.index" /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts
```
Must show: onLayoutReady calls registerVaultEvents then index.rebuild(); index property; new VaultIndex in onload.

```bash
grep -v "^[[:space:]]*//" /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts | grep "console\.log"
```
Must return zero results.

```bash
wc -l /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts
```
Must be under 120 lines (was ~40 lines; grows by ~60-70 lines with event wiring).
</verification>

<success_criteria>
- src/main.ts imports VaultIndex and TFile
- this.index: VaultIndex declared and created in onload() with this.settings.excludedPaths
- Initial rebuild called in onLayoutReady (after registerVaultEvents)
- registerVaultEvents registers 4 vault events via this.registerEvent (auto-cleanup on unload)
- modify + create → markDirty; rename → remove(old) + markDirty(new); delete → remove
- Every handler guards with instanceof TFile to skip folder events
- Zero console.log in non-comment lines
</success_criteria>

<output>
After completion, create `.planning/phases/02-vaultindex-core-data-layer/02-03-SUMMARY.md`
using the summary template.
</output>
