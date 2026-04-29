---
phase: 07-sidebar-view
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/main.ts
autonomous: true
requirements:
  - SIDE-01
  - SIDE-03
  - SIDE-04
must_haves:
  truths:
    - "src/main.ts imports KBSidebarView and KB_SIDEBAR_VIEW_TYPE from './KBSidebarView'"
    - "src/main.ts declares sidebarRefreshCallbacks: Set<() => void> = new Set() field on KBManagerPlugin"
    - "src/main.ts calls this.registerView(KB_SIDEBAR_VIEW_TYPE, leaf => new KBSidebarView(leaf, this)) inside onload (NOT inside onLayoutReady)"
    - "src/main.ts onLayoutReady opens the sidebar leaf only when getLeavesOfType(KB_SIDEBAR_VIEW_TYPE).length === 0"
    - "src/main.ts adds ribbon icon 'network' with tooltip 'KB Manager: Open sidebar' that activates the sidebar"
    - "src/main.ts adds command id 'kb-manager-open-sidebar' name 'KB Manager: Open sidebar'"
    - "src/main.ts runGenerators calls this.notifySidebarRefresh() AFTER both mocGenerator.run and tocGenerator.run complete"
    - "src/main.ts notifySidebarRefresh iterates this.sidebarRefreshCallbacks and invokes each"
    - "src/main.ts activateSidebar reveals existing leaf when present; otherwise creates a new right leaf with the sidebar view"
  artifacts:
    - path: "src/main.ts"
      provides: "Plugin registers KBSidebarView, opens it on first load, refreshes after rebuilds"
      exports: ["default KBManagerPlugin"]
  key_links:
    - from: "src/main.ts"
      to: "src/KBSidebarView.ts"
      via: "this.registerView(KB_SIDEBAR_VIEW_TYPE, leaf => new KBSidebarView(leaf, this))"
      pattern: "registerView\\(KB_SIDEBAR_VIEW_TYPE"
---

<objective>
Wire KBSidebarView into the plugin lifecycle: register the view type for SIDE-04 restart
persistence, open it on first install via `onLayoutReady`, register a ribbon icon and a
command for re-opening, and extend `runGenerators` to fire `notifySidebarRefresh` after
both generators complete (SIDE-03).

Output: src/main.ts with the sidebar wiring complete.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-03-PLAN-main-integration.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/06-tagmanager-tag-hierarchy/06-01-PLAN-tag-cluster-and-manager.md

<!-- main.ts state at start of this plan: phases 1-6 complete. Plugin has settings, VaultIndex,
     mocGenerator, tocGenerator, tagManager, mutex, scheduler, status bar, ribbon for rebuild,
     commands for rebuild/insert-moc/insert-toc, runGenerators awaiting moc + toc. -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add sidebar view registration, refresh callbacks, ribbon, command, and runGenerators extension</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (current state — output of Phase 6 Plan 06-01 Task 3)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/KBSidebarView.ts (Plan 07-02 — KBSidebarView, KB_SIDEBAR_VIEW_TYPE)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-CONTEXT.md (D-01..D-04, D-21..D-22)
  </read_first>
  <action>
Edit `src/main.ts`:

1. Add import after the existing TagManager import:
```typescript
import KBSidebarView, { KB_SIDEBAR_VIEW_TYPE } from './KBSidebarView';
```

2. Add field on KBManagerPlugin (after `tagManager!: TagManager;`):
```typescript
sidebarRefreshCallbacks: Set<() => void> = new Set();
```

3. Inside `onload()` (NOT inside onLayoutReady — view type must be registered synchronously
   so Obsidian can re-create the view from saved layout on restart per SIDE-04). Add this
   AFTER `this.tagManager = new TagManager(this.index)`:
```typescript
this.registerView(KB_SIDEBAR_VIEW_TYPE, (leaf) => new KBSidebarView(leaf, this));
```

4. Inside the `onLayoutReady` callback's `.finally(() => { ... })` block (where ribbon and
   commands are registered), append the sidebar ribbon, command, and the conditional
   first-open. Place at the end of `.finally`:
```typescript
this.addRibbonIcon('network', 'KB Manager: Open sidebar', () => {
  this.activateSidebar().catch(err => console.error('KB Manager: activateSidebar failed', err));
});
this.addCommand({
  id: 'kb-manager-open-sidebar',
  name: 'KB Manager: Open sidebar',
  callback: () => {
    this.activateSidebar().catch(err => console.error('KB Manager: activateSidebar failed', err));
  },
});
if (this.app.workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE).length === 0) {
  this.activateSidebar().catch(err => console.error('KB Manager: initial sidebar open failed', err));
}
```

5. Add private methods `activateSidebar` and `notifySidebarRefresh` near `runGenerators`:
```typescript
private async activateSidebar(): Promise<void> {
  const existing = this.app.workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE);
  if (existing.length > 0) {
    this.app.workspace.revealLeaf(existing[0]);
    return;
  }
  const right = this.app.workspace.getRightLeaf(false);
  if (!right) return;
  await right.setViewState({ type: KB_SIDEBAR_VIEW_TYPE, active: true });
}

private notifySidebarRefresh(): void {
  for (const cb of this.sidebarRefreshCallbacks) {
    try { cb(); } catch (err) { console.error('KB Manager: sidebar refresh callback failed', err); }
  }
}
```

6. Extend `runGenerators` to call `notifySidebarRefresh` after both generator runs:
```typescript
private async runGenerators(): Promise<void> {
  await this.mocGenerator.run();
  await this.tocGenerator.run();
  this.notifySidebarRefresh();
}
```

Build:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "registerView" src/main.ts && grep -c "notifySidebarRefresh" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "import KBSidebarView" src/main.ts` outputs 1
    - `grep "KB_SIDEBAR_VIEW_TYPE" src/main.ts | wc -l` outputs at least 4 (import + register + getLeavesOfType + setViewState)
    - `grep -c "sidebarRefreshCallbacks" src/main.ts` outputs at least 2 (declaration + iteration)
    - `grep -c "this.registerView(KB_SIDEBAR_VIEW_TYPE" src/main.ts` outputs 1
    - `grep -B5 "this.registerView(KB_SIDEBAR_VIEW_TYPE" src/main.ts | grep -c "onload"` outputs at least 1 (registerView is in onload, not onLayoutReady — SIDE-04)
    - `grep -B30 "this.registerView(KB_SIDEBAR_VIEW_TYPE" src/main.ts | grep -c "onLayoutReady"` outputs 0 (registerView NOT inside onLayoutReady)
    - `grep -c "kb-manager-open-sidebar" src/main.ts` outputs 1
    - `grep "KB Manager: Open sidebar" src/main.ts | wc -l` outputs at least 2 (ribbon tooltip + command name)
    - `grep -c "private async activateSidebar" src/main.ts` outputs 1
    - `grep -c "private notifySidebarRefresh" src/main.ts` outputs 1
    - `grep -c "this.notifySidebarRefresh()" src/main.ts` outputs at least 1
    - `grep -A4 "private async runGenerators" src/main.ts | grep -c "this.notifySidebarRefresh()"` outputs at least 1 (called inside runGenerators)
    - `grep -A2 "private async runGenerators" src/main.ts | grep -c "this.mocGenerator.run()"` outputs at least 1
    - `grep -A3 "private async runGenerators" src/main.ts | grep -c "this.tocGenerator.run()"` outputs at least 1
    - `grep -c "getLeavesOfType(KB_SIDEBAR_VIEW_TYPE)" src/main.ts` outputs at least 2 (initial check + activateSidebar)
    - `wc -l src/main.ts` outputs ≤ 340
  </acceptance_criteria>
  <done>Sidebar view registered in onload (SIDE-04 persistence). Opens automatically on first install via onLayoutReady. Ribbon + command available for re-open. runGenerators fires sidebarRefresh after both generators complete (SIDE-03).</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build && npm test
```
Expected: build exits 0, tests pass.

Manual UAT (full Phase 7 verification):

1. **First install / SIDE-01.** Reload plugin. Sidebar opens automatically in the right pane.
   Both 'MOC Tree' and 'Tags' headers visible. After initial rebuild settles, MOC Tree
   shows folders + files; Tags shows the hierarchy with `(N)` count badges.

2. **SIDE-02.** Verify both sections visible at the same time without switching tabs.
   Vertical resize divider between them works.

3. **SIDE-03 — auto-refresh.** With sidebar open, modify a note (add a new heading,
   change tags). Wait for the 5-min scheduler tick OR click the rebuild ribbon. Confirm
   the sidebar updates: new file appears, tag count changes, etc.

4. **SIDE-04 — restart persistence.** Close and reopen Obsidian. Sidebar should reappear
   in the same pane location without manual intervention. Refresh hook should still work
   (modify a note, rebuild, sidebar updates).

5. **Click behaviors.**
   - Click a folder name → opens that folder's `MOC.md` (or no-op + console.warn if folder
     is in `inline` mode and has no MOC.md).
   - Click the twirl arrow next to a folder → toggles expand without opening anything.
   - Click a file basename → opens that file in the active pane.
   - Click a tag name → opens Obsidian's global search with `tag:#<full-path>`.
   - Click the twirl arrow on a nested-tag node → toggles expand.

6. **Empty states.** Disable index temporarily (e.g., add `excludedPaths: ['*']` style block —
   or test on an empty vault). Sidebar shows 'No folders to index' / 'No tags found'.

7. **Re-open via ribbon / command.** Close the sidebar. Click the network ribbon icon —
   sidebar re-opens. Run command `KB Manager: Open sidebar` from the palette — same.

8. **Multiple opens.** Click the ribbon icon again while sidebar is open. The existing
   leaf reveals (no duplicate created).

Phase 7 success criteria from ROADMAP.md (4 must be TRUE):
1. ✅ user can open sidebar via ribbon/command and see MOC tree — verified by step 7 + step 1
2. ✅ Sidebar shows tag hierarchy alongside MOC tree — verified by step 2
3. ✅ Auto-refresh after rebuild — verified by step 3
4. ✅ Reappears after Obsidian restart — verified by step 4
</verification>
