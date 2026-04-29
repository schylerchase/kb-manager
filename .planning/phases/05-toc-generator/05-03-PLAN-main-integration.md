---
phase: 05-toc-generator
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/main.ts
autonomous: true
requirements:
  - TOC-02
must_haves:
  truths:
    - "src/main.ts imports TocGenerator from './TocGenerator'"
    - "src/main.ts declares tocGenerator!: TocGenerator on KBManagerPlugin"
    - "src/main.ts instantiates this.tocGenerator = new TocGenerator(this.app, this.index, this.settings) inside onload AFTER mocGenerator instantiation"
    - "onLayoutReady's onRebuildComplete handler calls a runGenerators helper that awaits mocGenerator.run() then tocGenerator.run() serially"
    - "src/main.ts addCommand registers id 'kb-manager-insert-toc' with editorCallback that inserts toc delimiters at cursor"
    - "Insert TOC editorCallback shows Notice 'KB Manager: TOC delimiters already present' when isWriteSafe returns true"
    - "insertSectionAtCursor or equivalent helper deduplicates the insert logic between MOC and TOC commands"
  artifacts:
    - path: "src/main.ts"
      provides: "Plugin wires TocGenerator on rebuild and registers Insert TOC command"
      exports: ["default KBManagerPlugin"]
  key_links:
    - from: "src/main.ts"
      to: "src/TocGenerator.ts"
      via: "this.tocGenerator = new TocGenerator(...) and runGenerators awaits this.tocGenerator.run()"
      pattern: "tocGenerator"
---

<objective>
Wire TocGenerator into the plugin lifecycle alongside MocGenerator, and register the
"Insert TOC here" editor command (TOC-02). After this plan, every VaultIndex rebuild
triggers MocGenerator.run() followed by TocGenerator.run() serially. The Insert TOC command
mirrors the Insert MOC command from Phase 4 Plan 04-03.

Purpose: Closes the lifecycle loop for Phase 5. Refactors the rebuild-complete handler from
a single-generator hook (Phase 4) into a generic runGenerators helper that awaits both
generators in order — leaves room for future generators (Phase 6 TagManager won't write,
but Phase 7 sidebar might subscribe similarly).

Output: src/main.ts with TocGenerator instantiation, extended onRebuildComplete, and the
kb-manager-insert-toc command.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-03-PLAN-main-integration.md

<!-- main.ts state at end of Phase 4 Plan 04-03:
     - mocGenerator instantiated, onRebuildComplete = () => mocGenerator.run().catch(...)
     - kb-manager-insert-moc registered, insertMocAtCursor helper exists
     - Editor + MarkdownView already imported from 'obsidian'
     - buildDelimiter + isWriteSafe imported from './lib/delimiter' -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add TocGenerator instance and refactor onRebuildComplete to runGenerators</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (current state — output of Phase 4 Plan 04-03)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/TocGenerator.ts (Plan 05-02 — public run() signature)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-CONTEXT.md (D-18..D-20 — order, serial)
  </read_first>
  <action>
Edit `src/main.ts`:

1. Add import after the existing MocGenerator import:
```typescript
import TocGenerator from './TocGenerator';
```

2. Add field declaration to KBManagerPlugin (after `mocGenerator!: MocGenerator;`):
```typescript
tocGenerator!: TocGenerator;
```

3. Inside `onload()`, AFTER `this.mocGenerator = new MocGenerator(...)` and BEFORE `this.addSettingTab(...)`:
```typescript
this.tocGenerator = new TocGenerator(this.app, this.index, this.settings);
```

4. Inside the `onLayoutReady` callback, REPLACE the existing `this.index.onRebuildComplete = () => { ... }` block with a call to a new helper:

```typescript
this.index.onRebuildComplete = () => {
  this.runGenerators().catch(err =>
    console.error('KB Manager: generators failed', err)
  );
};
```

5. Add a new private method `runGenerators` near `triggerManualRebuild`:

```typescript
private async runGenerators(): Promise<void> {
  await this.mocGenerator.run();
  await this.tocGenerator.run();
}
```

The complete updated `onLayoutReady` callback (showing the relevant section):

```typescript
this.app.workspace.onLayoutReady(() => {
  this.statusBarItem = this.addStatusBarItem();
  this.statusBarItem.setText(STATUS_IDLE);

  this.registerVaultEvents();

  this.index.onRebuildComplete = () => {
    this.runGenerators().catch(err =>
      console.error('KB Manager: generators failed', err)
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
      this.addCommand({
        id: 'kb-manager-insert-moc',
        name: 'KB Manager: Insert MOC here',
        editorCallback: (editor: Editor, view: MarkdownView) => {
          this.insertMocAtCursor(editor, view);
        },
      });
      // Insert TOC command added in Task 2 below.
    });
});
```

Build:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "TocGenerator" src/main.ts && grep -c "runGenerators" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "import TocGenerator from './TocGenerator'" src/main.ts` outputs 1
    - `grep -c "tocGenerator!: TocGenerator" src/main.ts` outputs 1
    - `grep -c "new TocGenerator(this.app, this.index, this.settings)" src/main.ts` outputs 1
    - `grep -c "private async runGenerators" src/main.ts` outputs 1
    - `grep -A2 "private async runGenerators" src/main.ts | grep -c "this.mocGenerator.run()"` outputs at least 1
    - `grep -A3 "private async runGenerators" src/main.ts | grep -c "this.tocGenerator.run()"` outputs at least 1
    - `grep -c "this.runGenerators()" src/main.ts` outputs at least 1
    - `grep -c "this.mocGenerator.run().catch" src/main.ts` outputs 0 (the old direct hook is gone — replaced by runGenerators)
    - `wc -l src/main.ts` outputs ≤ 275
  </acceptance_criteria>
  <done>TocGenerator instantiated alongside MocGenerator. onRebuildComplete now triggers runGenerators which awaits both serially.</done>
</task>

<task type="auto">
  <name>Task 2: Register kb-manager-insert-toc editor command</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (post-Task-1 state)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-CONTEXT.md (D-08 — Insert TOC behavior; idempotent + Notice on duplicate)
  </read_first>
  <action>
Edit `src/main.ts` to register the Insert TOC command. Mirrors the Insert MOC command from
Phase 4 Plan 04-03 — they share an `insertSectionAtCursor` helper that takes the delimiter
type as a parameter, replacing the per-section helpers.

1. Replace the existing `insertMocAtCursor` method with a more general `insertSectionAtCursor`
   that takes a `DelimiterType` parameter, then update the existing MOC command to call
   `this.insertSectionAtCursor(editor, view, 'moc')`. Add a new TOC command that calls
   `this.insertSectionAtCursor(editor, view, 'toc')`.

   First, update the import line for delimiter to include `DelimiterType`:
   ```typescript
   import { buildDelimiter, isWriteSafe, DelimiterType } from './lib/delimiter';
   ```

2. Replace `insertMocAtCursor` with the generalized helper:

   ```typescript
   private insertSectionAtCursor(editor: Editor, view: MarkdownView, type: DelimiterType): void {
     const file = view.file;
     if (!file) return;
     const content = editor.getValue();
     if (isWriteSafe(content, type)) {
       const label = type.toUpperCase();
       new Notice(`KB Manager: ${label} delimiters already present`);
       return;
     }
     const startDelim = buildDelimiter(type, 'start');
     const endDelim = buildDelimiter(type, 'end');
     const snippet = `${startDelim}\n<!-- pending rebuild -->\n${endDelim}\n`;
     editor.replaceRange(snippet, editor.getCursor());
   }
   ```

3. Update the existing MOC command's editorCallback inside `onLayoutReady` to:
   ```typescript
   editorCallback: (editor: Editor, view: MarkdownView) => {
     this.insertSectionAtCursor(editor, view, 'moc');
   },
   ```

4. After the MOC command, add the TOC command (also inside `onLayoutReady` `.finally`):
   ```typescript
   this.addCommand({
     id: 'kb-manager-insert-toc',
     name: 'KB Manager: Insert TOC here',
     editorCallback: (editor: Editor, view: MarkdownView) => {
       this.insertSectionAtCursor(editor, view, 'toc');
     },
   });
   ```

Build:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "kb-manager-insert-toc" src/main.ts && grep -c "insertSectionAtCursor" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "kb-manager-insert-toc" src/main.ts` outputs 1
    - `grep "KB Manager: Insert TOC here" src/main.ts` matches 1 line
    - `grep -c "insertSectionAtCursor" src/main.ts` outputs at least 3 (declaration + MOC call + TOC call)
    - `grep -c "insertMocAtCursor" src/main.ts` outputs 0 (replaced by the general helper)
    - `grep "import.*DelimiterType.*from './lib/delimiter'" src/main.ts | wc -l` outputs 1
    - `grep "MOC delimiters already present" src/main.ts` matches at least 1 line (still present, generated by the helper at runtime)
    - `grep "TOC delimiters already present" src/main.ts` outputs 0 (the helper builds the message dynamically — `${label}`)
    - `grep "type.toUpperCase()" src/main.ts` matches at least 1 line OR equivalent template logic
    - `grep -c "kb-manager-insert-moc" src/main.ts` outputs 1 (still present, unchanged otherwise)
    - `wc -l src/main.ts` outputs ≤ 290
  </acceptance_criteria>
  <done>Both kb-manager-insert-moc and kb-manager-insert-toc commands are registered and share a single insertSectionAtCursor helper. Idempotency Notice generated dynamically for either type.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build && npm test
```
Expected: build exits 0, tests pass.

Manual UAT (full Phase 5):
1. Reload plugin. After initial rebuild settles, inspect each non-excluded folder —
   each contains an `INDEX.md` with `kb-managed: true`, `kb-type: index`, list of notes
   with their h1 headings. Folders with no heading-bearing notes have NO INDEX.md.
2. Open a user note. Run command "KB Manager: Insert TOC here" from palette.
   Cursor area gets `<!-- kb-manager:toc:start -->\n<!-- pending rebuild -->\n<!-- kb-manager:toc:end -->`.
3. Click ribbon "KB Manager: Rebuild now". Re-open the note — placeholder replaced
   with the actual h1-h3 TOC body.
4. Run "Insert TOC here" again. Notice "KB Manager: TOC delimiters already present"
   appears. Note unchanged.
5. Edit a note: add a new h2. Trigger rebuild. Confirm the TOC inside delimiters
   updates to include the new h2 with 2-space indent.
6. Open a note that has only h4-h6 headings. Add TOC delimiters via command. Trigger
   rebuild. Confirm TOC body is `<!-- no headings -->` (D-05/D-06 placeholder).
7. Open a note in an excluded folder (e.g., `templates/note.md` if `templates` is in
   excludedPaths). Add TOC delimiters by hand. Trigger rebuild. Confirm the TOC is
   NOT regenerated — file in excluded path is silently skipped.
8. Drop a hand-authored `INDEX.md` in some folder WITHOUT `kb-managed: true`. Trigger
   rebuild. Confirm console.warn about skipping. user content untouched.

Phase 5 success criteria from ROADMAP.md (4 must be TRUE):
1. ✅ TOC inside delimiters regenerated on rebuild — verified by Plans 05-01 + 05-02 + step 5 above
2. ✅ Insert TOC here command + immediate populate (after manual rebuild) — verified by step 2-3
3. ✅ TOC links use `[[note#heading]]` — verified by Plan 05-01 must_haves and Vitest in Plan 05-04
4. ✅ Notes with no headings skipped — verified by D-05/D-06 placeholder + step 6
</verification>
