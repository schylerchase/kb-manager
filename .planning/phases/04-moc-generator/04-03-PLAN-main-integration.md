---
phase: 04-moc-generator
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/main.ts
autonomous: true
requirements:
  - MOC-05
  - MOC-06
must_haves:
  truths:
    - "src/main.ts imports MocGenerator from './MocGenerator'"
    - "src/main.ts declares mocGenerator!: MocGenerator on KBManagerPlugin"
    - "src/main.ts instantiates this.mocGenerator = new MocGenerator(this.app, this.index, this.settings) inside onload() AFTER VaultIndex creation"
    - "src/main.ts sets this.index.onRebuildComplete = () => { this.mocGenerator.run().catch(...) } inside onLayoutReady BEFORE the initial rebuild fires"
    - "src/main.ts addCommand registers id 'kb-manager-insert-moc' with editorCallback that inserts moc delimiters at cursor"
    - "Insert MOC editorCallback shows Notice 'KB Manager: MOC delimiters already present' when isWriteSafe returns true on the active file's content"
    - "Insert MOC editorCallback inserts both moc start and end delimiters when isWriteSafe returns false"
  artifacts:
    - path: "src/main.ts"
      provides: "Plugin wires MocGenerator on onRebuildComplete and registers Insert MOC command"
      exports: ["default KBManagerPlugin"]
  key_links:
    - from: "src/main.ts"
      to: "src/MocGenerator.ts"
      via: "this.mocGenerator = new MocGenerator(...) and this.index.onRebuildComplete = () => this.mocGenerator.run()"
      pattern: "mocGenerator"
---

<objective>
Wire MocGenerator into the plugin lifecycle and register the "Insert MOC here" editor
command (MOC-05). After this plan, every VaultIndex rebuild — initial, periodic
(Phase 3), or manual (Phase 3 ribbon) — automatically triggers MocGenerator.run().
The new editor command lets users add inline MOC delimiters at cursor in any note.

Purpose: Closes the lifecycle loop — Phase 3 schedules rebuilds, Phase 2 produces the
data, Phase 4 (Plans 04-01, 04-02) generates content, this plan binds them together.

Output: src/main.ts updated with mocGenerator instantiation, onRebuildComplete hook, and
the kb-manager-insert-moc command.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/ROADMAP.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/03-background-update-scheduler/03-02-PLAN-ribbon-command-settings.md

<!-- main.ts is in the state from the end of Plan 03-02:
     - Notice already imported from 'obsidian'
     - mutex, scheduler, ribbon already wired
     - onLayoutReady already runs initial rebuild then starts scheduler -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add MocGenerator instance and onRebuildComplete hook</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (current state — output of Phase 3 Plan 03-02; should already have ribbon, command, mutex)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/MocGenerator.ts (Plan 04-02 — public run() signature)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts (onRebuildComplete callback hook from Phase 2)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-CONTEXT.md (D-19, D-20, D-21 — lifecycle and trigger ordering)
  </read_first>
  <action>
Edit `src/main.ts`:

1. Add import at top (after existing imports):
```typescript
import MocGenerator from './MocGenerator';
```

2. Add field declaration to KBManagerPlugin (after `index!: VaultIndex;`):
```typescript
mocGenerator!: MocGenerator;
```

3. Inside `onload()`, AFTER `this.index = new VaultIndex(...)` and BEFORE `this.addSettingTab(...)`:
```typescript
this.mocGenerator = new MocGenerator(this.app, this.index, this.settings);
```

4. Inside the `onLayoutReady` callback, BEFORE the existing `this.runWithLock(() => this.index.rebuild())` line, register the rebuild-complete hook so it's set up before any rebuild fires:
```typescript
this.index.onRebuildComplete = () => {
  this.mocGenerator.run().catch(err =>
    console.error('KB Manager: MocGenerator.run failed', err)
  );
};
```

The complete updated `onLayoutReady` callback should look like (showing the relevant section — keep all other code unchanged):

```typescript
this.app.workspace.onLayoutReady(() => {
  this.statusBarItem = this.addStatusBarItem();
  this.statusBarItem.setText(STATUS_IDLE);

  this.registerVaultEvents();

  this.index.onRebuildComplete = () => {
    this.mocGenerator.run().catch(err =>
      console.error('KB Manager: MocGenerator.run failed', err)
    );
  };

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
      // Insert MOC command added in Task 2 below.
    });
});
```

Build to confirm types resolve:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "MocGenerator" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "import MocGenerator from './MocGenerator'" src/main.ts` outputs 1
    - `grep -c "mocGenerator!: MocGenerator" src/main.ts` outputs 1
    - `grep -c "new MocGenerator(this.app, this.index, this.settings)" src/main.ts` outputs 1
    - `grep -c "this.index.onRebuildComplete" src/main.ts` outputs 1
    - `grep -c "this.mocGenerator.run()" src/main.ts` outputs at least 1
    - `grep -B5 "this.index.onRebuildComplete" src/main.ts | grep -c "onLayoutReady"` outputs at least 1 (callback set inside onLayoutReady, not onload)
    - `grep -B20 "this.index.onRebuildComplete" src/main.ts | grep -c "this.runWithLock(() => this.index.rebuild())"` outputs 0 (callback set BEFORE the initial rebuild line, not after)
    - `wc -l src/main.ts` outputs ≤ 235 (was ~220 after Phase 3; this plan adds ~15 lines)
  </acceptance_criteria>
  <done>MocGenerator instantiated in onload, onRebuildComplete hook set inside onLayoutReady before initial rebuild fires. Every rebuild (initial, scheduled tick, manual) triggers MocGenerator.run.</done>
</task>

<task type="auto">
  <name>Task 2: Register kb-manager-insert-moc editor command</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (post Task 1 state)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/delimiter.ts (buildDelimiter, isWriteSafe)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-CONTEXT.md (D-13: Insert MOC command behavior — placeholder content between delimiters; idempotent)
  </read_first>
  <action>
Edit `src/main.ts` to register the Insert MOC editor command. This command needs:

1. Add imports — extend the obsidian and delimiter imports at the top of the file:
```typescript
import { Plugin, TFile, Notice, Editor, MarkdownView } from 'obsidian';
import { buildDelimiter, isWriteSafe } from './lib/delimiter';
```

(If `Editor` and `MarkdownView` are already imported, leave that line alone. Add `buildDelimiter, isWriteSafe` to the delimiter import. If `./lib/delimiter` is not imported yet, add the line.)

2. Inside the `onLayoutReady` callback's `.finally(() => { ... })` block, AFTER the existing
`this.addCommand({ id: 'kb-manager-rebuild', ... })`, add:

```typescript
this.addCommand({
  id: 'kb-manager-insert-moc',
  name: 'KB Manager: Insert MOC here',
  editorCallback: (editor: Editor, view: MarkdownView) => {
    this.insertMocAtCursor(editor, view);
  },
});
```

3. Add the helper method `insertMocAtCursor` to KBManagerPlugin (place near `triggerManualRebuild`):

```typescript
private insertMocAtCursor(editor: Editor, view: MarkdownView): void {
  const file = view.file;
  if (!file) return;
  const content = editor.getValue();
  if (isWriteSafe(content, 'moc')) {
    new Notice('KB Manager: MOC delimiters already present');
    return;
  }
  const startDelim = buildDelimiter('moc', 'start');
  const endDelim = buildDelimiter('moc', 'end');
  const snippet = `${startDelim}\n<!-- pending rebuild -->\n${endDelim}\n`;
  editor.replaceRange(snippet, editor.getCursor());
}
```

Notes:
- `editor.replaceRange(text, cursorPos)` inserts at the cursor (replaceRange with same start/end position = insert).
- `<!-- pending rebuild -->` is the placeholder that the next MocGenerator run will overwrite via `replaceDelimitedSection`.
- D-13 idempotency: if `isWriteSafe` returns true (existing matched delimiters), command shows Notice and does nothing.
- The user typically triggers a manual rebuild after inserting (ribbon click) to populate immediately, but this plan does NOT auto-trigger — keeps the command simple.

Build to confirm:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "kb-manager-insert-moc" src/main.ts && grep -c "insertMocAtCursor" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "kb-manager-insert-moc" src/main.ts` outputs 1
    - `grep "KB Manager: Insert MOC here" src/main.ts` matches 1 line
    - `grep -c "editorCallback" src/main.ts` outputs at least 1
    - `grep -c "insertMocAtCursor" src/main.ts` outputs at least 2 (declaration + command callback invocation)
    - `grep -c "isWriteSafe" src/main.ts` outputs at least 1
    - `grep -c "buildDelimiter" src/main.ts` outputs at least 2 (start delim + end delim)
    - `grep "MOC delimiters already present" src/main.ts` matches 1 line
    - `grep "<!-- pending rebuild -->" src/main.ts` matches 1 line
    - `grep "import.*Editor.*from 'obsidian'" src/main.ts | grep -c "MarkdownView"` outputs 1 (both Editor and MarkdownView in same import line)
    - `grep "import.*MarkdownView.*from 'obsidian'" src/main.ts | grep -c "Editor"` outputs 1
    - `wc -l src/main.ts` outputs ≤ 260
  </acceptance_criteria>
  <done>kb-manager-insert-moc command registered. Inserts both delimiters with placeholder at cursor. Idempotent — Notice shown if delimiters already present in active note.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager
npm run build
```
Expected: exit 0.

Functional UAT in dev vault (full Phase 4 verification):
1. Reload plugin. Status bar shows `KB: rebuilding…` then `KB: idle`. After idle,
   inspect non-excluded folders — each has a `MOC.md` with frontmatter and tag-tree body.
2. Open a user note in a folder NOT set to inline. Run command "KB Manager: Insert MOC here"
   from palette. Cursor area gets `<!-- kb-manager:moc:start -->\n<!-- pending rebuild -->\n<!-- kb-manager:moc:end -->`.
3. Click ribbon "KB Manager: Rebuild now". Status bar cycles. Re-open the note —
   placeholder should be replaced with actual MOC body.
4. Run "Insert MOC here" again on the same note. Notice "KB Manager: MOC delimiters
   already present" appears. Note unchanged. (D-13 idempotency.)
5. In settings, set a folder rule (`notes = inline`) and enable global Auto-injection.
   Trigger rebuild. Confirm:
   - `notes/MOC.md` is NOT created (D-17 inline mode skips MOC.md).
   - Every non-excluded note in `notes/` gains delimiters appended at end + populated body.
6. Set Auto-injection back to off. Manually edit one note — remove its delimiters.
   Trigger rebuild. Confirm note is silently skipped (no delimiters re-appended).
7. Create a `MOC.md` by hand in some folder WITHOUT `kb-managed: true` frontmatter.
   Trigger rebuild. Confirm console.warn about skipping that file. user content untouched.
</verification>
