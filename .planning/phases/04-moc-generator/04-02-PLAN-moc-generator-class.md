---
phase: 04-moc-generator
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/MocGenerator.ts
autonomous: true
requirements:
  - MOC-01
  - MOC-02
  - MOC-03
  - MOC-04
  - MOC-06
  - MOC-07
must_haves:
  truths:
    - "src/MocGenerator.ts exports default MocGenerator class"
    - "MocGenerator constructor takes (app: App, index: VaultIndex, settings: KBManagerSettings)"
    - "MocGenerator.run() iterates folders from this.index.getAllFolders() and processes each serially"
    - "For each folder, MocGenerator resolves format via settings.folderRules[folder] ?? settings.defaultMocFormat"
    - "When format is 'dedicated' and folder is not excluded, MocGenerator writes/overwrites {folder}/MOC.md only when frontmatter has kb-managed: true OR file does not exist"
    - "When format is 'inline', MocGenerator does NOT generate MOC.md for that folder"
    - "When format is 'inline' AND settings.autoInject is true, MocGenerator appends delimiters to non-excluded .md files in folder that lack delimiters"
    - "When format is 'inline' AND settings.autoInject is false, MocGenerator only injects into files already containing both delimiters"
    - "All file writes go through this.app.vault.process() — no adapter.write, no separate read+modify"
    - "MOC.md files (any file with kb-managed: true frontmatter) are excluded from listings inside other MOC files"
    - "Excluded paths are never touched and never listed (uses isExcluded from src/lib/exclusions)"
  artifacts:
    - path: "src/MocGenerator.ts"
      provides: "Obsidian-coupled MOC generator that orchestrates VaultIndex queries and vault.process writes"
      exports: ["default MocGenerator"]
  key_links:
    - from: "src/main.ts"
      to: "src/MocGenerator.ts"
      via: "import MocGenerator from './MocGenerator'"
      pattern: "from.*MocGenerator"
    - from: "src/MocGenerator.ts"
      to: "src/lib/moc-builder.ts"
      via: "import { buildMocBody, buildDedicatedMocFile } from './lib/moc-builder'"
      pattern: "from.*moc-builder"
    - from: "src/MocGenerator.ts"
      to: "src/lib/delimiter.ts"
      via: "import { isWriteSafe, replaceDelimitedSection, buildDelimiter } from './lib/delimiter'"
      pattern: "from.*delimiter"
    - from: "src/MocGenerator.ts"
      to: "src/lib/exclusions.ts"
      via: "import { isExcluded } from './lib/exclusions'"
      pattern: "from.*exclusions"
---

<objective>
Build the Obsidian-coupled `MocGenerator` class that consumes VaultIndex query data,
resolves per-folder format from settings, and writes MOC content via `vault.process()`.
Implements MOC-01, MOC-02, MOC-03 (dedicated MOC.md), MOC-04 (inline injection),
MOC-06 (auto-inject), MOC-07 (per-folder format). MOC-05 (Insert MOC here command)
is wired in Plan 04-03; MOC-08 (wikilink format) is satisfied by Plan 04-01's
`buildMocBody` output.

Purpose: Single class orchestrates the per-folder generation loop. Pure-logic
markdown comes from `moc-builder.ts` (Plan 04-01); delimiter safety from `delimiter.ts`
(Phase 1). MocGenerator is the Obsidian seam — everything that touches `app.vault`
or `app.metadataCache` lives here.

Output: src/MocGenerator.ts.
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
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-01-PLAN-pure-logic-moc-builder.md

<interfaces>
// src/MocGenerator.ts — to be created (Obsidian-coupled)

import { App, TFile, normalizePath } from 'obsidian';
import VaultIndex from './VaultIndex';
import { KBManagerSettings } from './settings';
import { buildMocBody, buildDedicatedMocFile, MocBuildInput } from './lib/moc-builder';
import { isWriteSafe, replaceDelimitedSection, buildDelimiter } from './lib/delimiter';
import { isExcluded } from './lib/exclusions';
import { TagNode, FileRecord } from './lib/vault-index-types';

export default class MocGenerator {
  constructor(
    private app: App,
    private index: VaultIndex,
    private settings: KBManagerSettings,
  ) {}

  /** Triggered after every VaultIndex rebuild via onRebuildComplete (Phase 2 D-11). */
  async run(): Promise<void>;

  // --- Internal ---

  /** Resolve dedicated|inline for a folder per D-16. */
  private resolveFormat(folderPath: string): 'dedicated' | 'inline';

  /** Build MocBuildInput by filtering kb-managed files and applying scope (folder-only or vault-wide). */
  private buildInputForFolder(folderPath: string): MocBuildInput;

  /** Write or overwrite {folder}/MOC.md per D-07..D-10. */
  private writeDedicated(folderPath: string, body: string): Promise<void>;

  /** Inject inline MOC into all eligible files in folder per D-11..D-15. */
  private injectInline(folderPath: string, body: string): Promise<void>;

  /** D-10 safety check: kb-managed flag in frontmatter. */
  private isKbManaged(file: TFile): boolean;
}
</interfaces>

<!-- Pattern reference: src/VaultIndex.ts is the closest existing analog — Obsidian-coupled class
     that consumes pure-logic helpers from src/lib/. Same constructor injection, same
     class-with-methods structure. -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create src/MocGenerator.ts with run() and per-folder logic</name>
  <files>src/MocGenerator.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts (closest analog — Obsidian-coupled class importing from lib/)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/moc-builder.ts (Plan 04-01 — buildMocBody, buildDedicatedMocFile signatures)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/delimiter.ts (isWriteSafe, replaceDelimitedSection, buildDelimiter — already supports 'moc')
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/exclusions.ts (isExcluded)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/settings.ts (KBManagerSettings shape, especially folderRules, defaultMocFormat, autoInject, excludedPaths)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-CONTEXT.md (D-10 overwrite policy, D-14..D-15 auto-inject, D-16..D-18 per-folder resolution, D-19..D-22 lifecycle and skip rules)
  </read_first>
  <action>
Create `src/MocGenerator.ts`. Follow the structure below verbatim — minor naming changes
allowed only if listed under Claude's Discretion in CONTEXT.

```typescript
import { App, TFile, normalizePath } from 'obsidian';
import VaultIndex from './VaultIndex';
import { KBManagerSettings } from './settings';
import { buildMocBody, buildDedicatedMocFile, MocBuildInput } from './lib/moc-builder';
import { isWriteSafe, replaceDelimitedSection, buildDelimiter } from './lib/delimiter';
import { isExcluded } from './lib/exclusions';
import { TagNode } from './lib/vault-index-types';

const MOC_BASENAME = 'MOC.md';

export default class MocGenerator {
  constructor(
    private app: App,
    private index: VaultIndex,
    private settings: KBManagerSettings,
  ) {}

  /** Run after every VaultIndex rebuild (Phase 2 D-11 onRebuildComplete). D-19..D-21. */
  async run(): Promise<void> {
    const folders = this.index.getAllFolders();
    for (const folderPath of folders) {
      if (isExcluded(folderPath, this.settings.excludedPaths)) continue;
      const format = this.resolveFormat(folderPath);
      const input = this.buildInputForFolder(folderPath);
      const body = buildMocBody(input);
      if (format === 'dedicated') {
        await this.writeDedicated(folderPath, body);
      } else {
        await this.injectInline(folderPath, body);
      }
    }
  }

  /** D-16: folderRules override; default fallback. */
  private resolveFormat(folderPath: string): 'dedicated' | 'inline' {
    return this.settings.folderRules[folderPath] ?? this.settings.defaultMocFormat;
  }

  /**
   * Build the MocBuildInput for a folder. Files inside the folder (including descendants
   * of nested subfolders are NOT pulled in — each folder's MOC indexes only its direct
   * .md children). Excluded files filtered out, kb-managed files (D-22) filtered out.
   */
  private buildInputForFolder(folderPath: string): MocBuildInput {
    const records = this.index.getFilesInFolder(folderPath);
    const filtered = records.filter(r => !this.shouldSkipForListing(r.path));
    const tagTree = this.buildTagTreeFromRecords(filtered);
    const untaggedFiles = filtered.filter(r => r.tags.length === 0).map(r => r.path);
    return { tagTree, untaggedFiles };
  }

  /** Build a TagNode tree from a subset of FileRecords (folder-scoped). */
  private buildTagTreeFromRecords(records: { path: string; tags: string[] }[]): Map<string, TagNode> {
    const root = new Map<string, TagNode>();
    for (const { path, tags } of records) {
      for (const tag of tags) {
        const segments = tag.split('/');
        let current = root;
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (!current.has(seg)) current.set(seg, { files: [], children: new Map() });
          const node = current.get(seg)!;
          if (i === segments.length - 1) node.files.push(path);
          current = node.children;
        }
      }
    }
    return root;
  }

  /** D-22: skip MOC.md files, kb-managed files, and excluded files from listings. */
  private shouldSkipForListing(filePath: string): boolean {
    if (isExcluded(filePath, this.settings.excludedPaths)) return true;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return true;
    if (file.name === MOC_BASENAME) return true;
    return this.isKbManaged(file);
  }

  /** D-08, D-10: read frontmatter via MetadataCache; never raw-parse YAML. */
  private isKbManaged(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.['kb-managed'] === true;
  }

  /** D-07..D-10. Write or overwrite {folder}/MOC.md when safe. */
  private async writeDedicated(folderPath: string, body: string): Promise<void> {
    const mocPath = normalizePath(folderPath === '' ? MOC_BASENAME : `${folderPath}/${MOC_BASENAME}`);
    const fullContent = buildDedicatedMocFile(folderPath, body);
    const existing = this.app.vault.getAbstractFileByPath(mocPath);
    if (existing instanceof TFile) {
      if (!this.isKbManaged(existing)) {
        // D-10: refuse to overwrite a user MOC.md that lacks kb-managed flag.
        console.warn(`KB Manager: skipping ${mocPath} — file lacks 'kb-managed: true' frontmatter`);
        return;
      }
      await this.app.vault.process(existing, () => fullContent);
      return;
    }
    // No existing file — create.
    await this.app.vault.create(mocPath, fullContent);
  }

  /** D-11..D-15. Inject inline MOC into eligible files in folder. */
  private async injectInline(folderPath: string, body: string): Promise<void> {
    const records = this.index.getFilesInFolder(folderPath);
    for (const record of records) {
      if (isExcluded(record.path, this.settings.excludedPaths)) continue;
      const file = this.app.vault.getAbstractFileByPath(record.path);
      if (!(file instanceof TFile)) continue;
      if (file.name === MOC_BASENAME) continue;
      if (this.isKbManaged(file)) continue;
      await this.processInlineFile(file, body);
    }
  }

  /** Per-file inline processing — append delimiters if needed (D-14..D-15), then replace section. */
  private async processInlineFile(file: TFile, body: string): Promise<void> {
    const startDelim = buildDelimiter('moc', 'start');
    const endDelim = buildDelimiter('moc', 'end');
    await this.app.vault.process(file, content => {
      const hasDelimiters = isWriteSafe(content, 'moc');
      if (!hasDelimiters) {
        if (!this.settings.autoInject) return content; // FOUND-05 silent skip
        // D-14, D-15: append fresh delimiters then populate.
        const appended = content + `\n\n${startDelim}\n${endDelim}\n`;
        return replaceDelimitedSection(appended, 'moc', body.trimEnd());
      }
      return replaceDelimitedSection(content, 'moc', body.trimEnd());
    });
  }
}
```

Constraints:
- File ≤ 250 lines (target ~180)
- Functions ≤ 30 lines each
- Nesting max 3 levels (the inner buildTagTreeFromRecords is the deepest at 3)
- No console.log (one console.warn for D-10 user-MOC skip is the only console call)
- All vault writes through `this.app.vault.process()` or `this.app.vault.create()` (the latter only for non-existing MOC.md)

After writing, build:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "this.app.vault.process" src/MocGenerator.ts && grep -cE "this\\.app\\.vault\\.adapter" src/MocGenerator.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "^export default class MocGenerator" src/MocGenerator.ts` outputs 1
    - `grep -c "this.app.vault.process" src/MocGenerator.ts` outputs at least 2 (writeDedicated + processInlineFile)
    - `grep -cE "this\\.app\\.vault\\.adapter\\.write" src/MocGenerator.ts` outputs 0 (no adapter.write — vault.process only)
    - `grep -c "vault.modify" src/MocGenerator.ts` outputs 0 (no separate read+modify)
    - `grep -c "console.log" src/MocGenerator.ts` outputs 0
    - `grep -c "console.warn" src/MocGenerator.ts` outputs at most 1 (the D-10 user MOC skip warning)
    - `grep -c "isWriteSafe" src/MocGenerator.ts` outputs at least 1
    - `grep -c "replaceDelimitedSection" src/MocGenerator.ts` outputs at least 1
    - `grep -c "isExcluded" src/MocGenerator.ts` outputs at least 2 (run() filter + injectInline filter, plus shouldSkipForListing)
    - `grep -c "buildMocBody" src/MocGenerator.ts` outputs at least 1
    - `grep -c "buildDedicatedMocFile" src/MocGenerator.ts` outputs at least 1
    - `grep -c "normalizePath" src/MocGenerator.ts` outputs at least 1 (MOC.md path is built from user-influenced folder paths)
    - `grep -c "kb-managed" src/MocGenerator.ts` outputs at least 1 (frontmatter check in isKbManaged)
    - `grep -c "autoInject" src/MocGenerator.ts` outputs at least 1
    - `grep "folderRules" src/MocGenerator.ts` matches at least 1 line
    - `wc -l src/MocGenerator.ts` outputs ≤ 250
  </acceptance_criteria>
  <done>MocGenerator.run() iterates folders, resolves per-folder format, writes dedicated MOC.md or injects inline. All writes through vault.process or vault.create. user MOC.md without kb-managed flag is skipped. autoInject gates auto-delimiter append.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build
```
Expected: exit 0. Functional verification (writes happen, content matches expected) is performed
in Plan 04-04 (Vitest tests for moc-builder pure logic) and Phase 4 manual UAT (loading plugin
in dev vault).
</verification>
