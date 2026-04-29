---
phase: 05-toc-generator
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/TocGenerator.ts
autonomous: true
requirements:
  - TOC-01
  - TOC-04
  - TOC-05
must_haves:
  truths:
    - "src/TocGenerator.ts exports default TocGenerator class"
    - "TocGenerator constructor takes (app: App, index: VaultIndex, settings: KBManagerSettings)"
    - "TocGenerator.run() awaits this.runPerNoteToc() then this.runSectionIndex()"
    - "runPerNoteToc iterates all .md files in the vault and only writes to files where isWriteSafe(content, 'toc') is true"
    - "runPerNoteToc skips files that have kb-managed: true frontmatter"
    - "runPerNoteToc skips files matching isExcluded against settings.excludedPaths"
    - "runSectionIndex iterates all non-excluded folders and writes INDEX.md only when at least one note in the folder has at least one heading"
    - "INDEX.md overwrite gated by frontmatter kb-managed: true (mirrors Phase 4 D-10)"
    - "All file writes use this.app.vault.process or this.app.vault.create"
  artifacts:
    - path: "src/TocGenerator.ts"
      provides: "Obsidian-coupled TOC generator with per-note TOC injection and section INDEX.md writes"
      exports: ["default TocGenerator"]
  key_links:
    - from: "src/main.ts"
      to: "src/TocGenerator.ts"
      via: "import TocGenerator from './TocGenerator'"
      pattern: "from.*TocGenerator"
    - from: "src/TocGenerator.ts"
      to: "src/lib/toc-builder.ts"
      via: "import { buildPerNoteTocBody, buildIndexFile } from './lib/toc-builder'"
      pattern: "from.*toc-builder"
    - from: "src/TocGenerator.ts"
      to: "src/lib/delimiter.ts"
      via: "import { isWriteSafe, replaceDelimitedSection } from './lib/delimiter'"
      pattern: "from.*delimiter"
---

<objective>
Build the Obsidian-coupled `TocGenerator` class. Two methods: `runPerNoteToc()` injects/refreshes
the inline TOC section in any user note that has the matched delimiter pair; `runSectionIndex()`
writes one `INDEX.md` per non-excluded folder containing notes-with-headings. Together these
satisfy TOC-01, TOC-04, TOC-05.

Purpose: Mirrors `MocGenerator` structure (Phase 4 Plan 04-02). Same constructor injection,
same vault.process write pattern, same kb-managed filter. The split into two public methods
makes the lifecycle hook explicit (per-note runs before section index — order matters only
for vault.process serialization, not correctness).

Output: src/TocGenerator.ts.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-02-PLAN-moc-generator-class.md

<interfaces>
// src/TocGenerator.ts — to be created (Obsidian-coupled)

import { App, TFile, normalizePath } from 'obsidian';
import VaultIndex from './VaultIndex';
import { KBManagerSettings } from './settings';
import { buildPerNoteTocBody, buildIndexFile, IndexBuildInput } from './lib/toc-builder';
import { isWriteSafe, replaceDelimitedSection } from './lib/delimiter';
import { isExcluded } from './lib/exclusions';

const INDEX_BASENAME = 'INDEX.md';

export default class TocGenerator {
  constructor(
    private app: App,
    private index: VaultIndex,
    private settings: KBManagerSettings,
  ) {}

  async run(): Promise<void>;            // calls runPerNoteToc then runSectionIndex
  async runPerNoteToc(): Promise<void>;
  async runSectionIndex(): Promise<void>;

  private isKbManaged(file: TFile): boolean;
  private shouldSkipFile(filePath: string): boolean;
}
</interfaces>

<!-- Closest analog: src/MocGenerator.ts (Phase 4 Plan 04-02). Same constructor signature,
     same vault.process pattern, same isKbManaged + isExcluded skip rules. -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create src/TocGenerator.ts</name>
  <files>src/TocGenerator.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/MocGenerator.ts (closest analog — same constructor, same vault.process pattern)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/toc-builder.ts (Plan 05-01 — buildPerNoteTocBody, buildIndexFile signatures)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/delimiter.ts (isWriteSafe, replaceDelimitedSection — already supports 'toc')
    - /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts (getheadings, getFilesInFolder, getAllFolders queries)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-CONTEXT.md (D-07..D-21 — write rules, skip rules, lifecycle)
  </read_first>
  <action>
Create `src/TocGenerator.ts`. Follow the structure below verbatim — minor naming changes
allowed only per CONTEXT Claude's Discretion.

```typescript
import { App, TFile, normalizePath } from 'obsidian';
import VaultIndex from './VaultIndex';
import { KBManagerSettings } from './settings';
import { buildPerNoteTocBody, buildIndexFile, IndexBuildInput } from './lib/toc-builder';
import { isWriteSafe, replaceDelimitedSection } from './lib/delimiter';
import { isExcluded } from './lib/exclusions';

const INDEX_BASENAME = 'INDEX.md';

export default class TocGenerator {
  constructor(
    private app: App,
    private index: VaultIndex,
    private settings: KBManagerSettings,
  ) {}

  /** Phase 5 D-18: per-note TOC first, then section index. Serial for vault.process safety. */
  async run(): Promise<void> {
    await this.runPerNoteToc();
    await this.runSectionIndex();
  }

  /** D-07, D-09, D-21. Walk all .md files; inject inline TOC where delimiters present. */
  async runPerNoteToc(): Promise<void> {
    const allFiles = this.app.vault.getMarkdownFiles();
    for (const file of allFiles) {
      if (this.shouldSkipFile(file.path)) continue;
      if (this.isKbManaged(file)) continue;
      const headings = this.index.getheadings(file.path);
      const body = buildPerNoteTocBody(file.path, headings);
      await this.app.vault.process(file, content => {
        if (!isWriteSafe(content, 'toc')) return content; // FOUND-05 silent skip
        return replaceDelimitedSection(content, 'toc', body);
      });
    }
  }

  /** D-10..D-17. Write INDEX.md per non-excluded folder with at least one heading-bearing note. */
  async runSectionIndex(): Promise<void> {
    const folders = this.index.getAllFolders();
    for (const folderPath of folders) {
      if (isExcluded(folderPath, this.settings.excludedPaths)) continue;
      const records = this.index.getFilesInFolder(folderPath);
      const eligibleNotes = records
        .filter(r => !this.shouldSkipFile(r.path))
        .filter(r => {
          const file = this.app.vault.getAbstractFileByPath(r.path);
          return !(file instanceof TFile && this.isKbManaged(file));
        })
        .map(r => ({ filePath: r.path, headings: this.index.getheadings(r.path) }))
        .filter(n => n.headings.length > 0);
      if (eligibleNotes.length === 0) continue; // D-13: skip empty-folder index
      const input: IndexBuildInput = { folderPath, notes: eligibleNotes };
      const content = buildIndexFile(input);
      await this.writeIndex(folderPath, content);
    }
  }

  private async writeIndex(folderPath: string, content: string): Promise<void> {
    const indexPath = normalizePath(folderPath === '' ? INDEX_BASENAME : `${folderPath}/${INDEX_BASENAME}`);
    const existing = this.app.vault.getAbstractFileByPath(indexPath);
    if (existing instanceof TFile) {
      if (!this.isKbManaged(existing)) {
        console.warn(`KB Manager: skipping ${indexPath} — file lacks 'kb-managed: true' frontmatter`);
        return;
      }
      await this.app.vault.process(existing, () => content);
      return;
    }
    await this.app.vault.create(indexPath, content);
  }

  /** D-21 + D-08: skip excluded paths and the MOC.md / INDEX.md files themselves. */
  private shouldSkipFile(filePath: string): boolean {
    if (isExcluded(filePath, this.settings.excludedPaths)) return true;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return true;
    if (file.name === 'MOC.md' || file.name === INDEX_BASENAME) return true;
    return false;
  }

  /** Mirrors MocGenerator.isKbManaged. Reads frontmatter via metadataCache. */
  private isKbManaged(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.['kb-managed'] === true;
  }
}
```

Constraints:
- File ≤ 220 lines (target ~140)
- Functions ≤ 30 lines
- Nesting max 3 levels
- No console.log (one console.warn allowed for D-16 user INDEX skip)
- All vault writes through `vault.process` or `vault.create`
- No bare `setInterval`/`setTimeout`
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "this.app.vault.process" src/TocGenerator.ts && grep -cE "this\\.app\\.vault\\.adapter" src/TocGenerator.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "^export default class TocGenerator" src/TocGenerator.ts` outputs 1
    - `grep -c "this.app.vault.process" src/TocGenerator.ts` outputs at least 2
    - `grep -cE "this\\.app\\.vault\\.adapter\\.write" src/TocGenerator.ts` outputs 0
    - `grep -c "vault.modify" src/TocGenerator.ts` outputs 0
    - `grep -c "console.log" src/TocGenerator.ts` outputs 0
    - `grep -c "console.warn" src/TocGenerator.ts` outputs at most 1
    - `grep -c "isWriteSafe" src/TocGenerator.ts` outputs at least 1
    - `grep -c "replaceDelimitedSection" src/TocGenerator.ts` outputs at least 1
    - `grep -c "buildPerNoteTocBody" src/TocGenerator.ts` outputs at least 1
    - `grep -c "buildIndexFile" src/TocGenerator.ts` outputs at least 1
    - `grep -c "isExcluded" src/TocGenerator.ts` outputs at least 1
    - `grep -c "INDEX.md" src/TocGenerator.ts` outputs at least 1
    - `grep -c "MOC.md" src/TocGenerator.ts` outputs at least 1
    - `grep -c "normalizePath" src/TocGenerator.ts` outputs at least 1
    - `grep -c "kb-managed" src/TocGenerator.ts` outputs at least 1
    - `grep "async runPerNoteToc" src/TocGenerator.ts` matches 1 line
    - `grep "async runSectionIndex" src/TocGenerator.ts` matches 1 line
    - `wc -l src/TocGenerator.ts` outputs ≤ 220
  </acceptance_criteria>
  <done>TocGenerator.run awaits runPerNoteToc then runSectionIndex. Per-note TOC writes only when delimiters present. INDEX.md created or overwritten only when kb-managed flag present (D-16). No writes inside excluded paths.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build
```
Expected: exit 0. Functional verification (writes happen on rebuild, content matches expected,
collisions handled, INDEX.md not created for empty folders) is performed in Plan 05-04
(Vitest tests for toc-builder pure logic) and Phase 5 manual UAT (Plan 05-03 verification).
</verification>
