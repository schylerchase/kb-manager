---
phase: 02-vaultindex-core-data-layer
plan: 02
type: execute
wave: 2
depends_on:
  - 02-01
files_modified:
  - src/VaultIndex.ts
autonomous: true
requirements:
  - INDX-01
  - INDX-02
  - INDX-03
  - INDX-04
must_haves:
  truths:
    - "VaultIndex class has private maps: files (Map<string, FileRecord>), folders (Map<string, FolderRecord>), tagTree (Map<string, TagNode>), flatTagMap (Map<string, string[]>), dirty (Set<string>)"
    - "rebuild() calls app.vault.getMarkdownFiles(), filters via isExcluded, and builds all four maps via tag-utils functions"
    - "rebuildDirty() re-indexes only dirty files, keeps clean FileRecords in place, then clears the dirty set"
    - "markDirty(path) adds path to the dirty set; remove(path) deletes from the files map and clears it from dirty"
    - "getFilesInFolder(folderPath) returns FileRecord[] for all files in that folder in O(1)"
    - "getFilesWithTag(tag) returns string[] file paths for exact tag match in O(1)"
    - "getHeadings(filePath) returns HeadingRecord[] from the files map"
    - "getAllFolders() returns string[] of all folder paths"
    - "getTagTree() returns the internal tagTree Map"
    - "isDirty(filePath) returns boolean from the dirty Set"
    - "onRebuildComplete callback fires after rebuild() and rebuildDirty() complete"
    - "VaultIndex constructor accepts (app: App, excludedPaths: string[]) per D-12"
  artifacts:
    - path: "src/VaultIndex.ts"
      provides: "VaultIndex class with typed query methods, rebuild/rebuildDirty, markDirty/remove, onRebuildComplete"
      exports: ["VaultIndex"]
  key_links:
    - from: "src/main.ts"
      to: "src/VaultIndex.ts"
      via: "import VaultIndex from './VaultIndex'"
      pattern: "from.*VaultIndex"
    - from: "src/VaultIndex.ts"
      to: "src/lib/vault-index-types.ts"
      via: "import { FileRecord, FolderRecord, TagNode, HeadingRecord } from './lib/vault-index-types'"
      pattern: "from.*vault-index-types"
    - from: "src/VaultIndex.ts"
      to: "src/lib/tag-utils.ts"
      via: "import { normalizeTags, buildTagTree, buildFlatTagMap, indexFolders } from './lib/tag-utils'"
      pattern: "from.*tag-utils"
    - from: "src/VaultIndex.ts"
      to: "src/lib/exclusions.ts"
      via: "import { isExcluded } from './lib/exclusions'"
      pattern: "from.*exclusions"
---

<objective>
Create the VaultIndex class — the Obsidian-coupled shell that orchestrates the pure-logic utilities
from Plan 02-01. This is the single source of truth all downstream generators (MOC, TOC, TagManager,
Sidebar) consume.

Purpose: Encapsulate Obsidian API calls (MetadataCache, vault.getMarkdownFiles) behind a typed query
interface with private maps. Downstream code never touches MetadataCache directly — it queries VaultIndex.

Output: src/VaultIndex.ts (default export class VaultIndex)
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
<!-- Contracts established in Plan 02-01 that this plan imports: -->

// From src/lib/vault-index-types.ts:
export interface HeadingRecord { text: string; level: number; }
export interface FileRecord { path: string; tags: string[]; headings: HeadingRecord[]; folderPath: string; }
export interface FolderRecord { path: string; name: string; files: string[]; }
export interface TagNode { files: string[]; children: Map<string, TagNode>; }

// From src/lib/tag-utils.ts:
export function normalizeTags(rawTags: string[]): string[]
export function buildTagTree(fileTagPairs: Array<{ filePath: string; tags: string[] }>): Map<string, TagNode>
export function buildFlatTagMap(fileTagPairs: Array<{ filePath: string; tags: string[] }>): Map<string, string[]>
export function indexFolders(filePaths: string[]): Map<string, FolderRecord>

// From src/lib/exclusions.ts:
export function isExcluded(filePath: string, patterns: string[]): boolean

// Obsidian API surface needed:
// import { App, TFile, getAllTags, CachedMetadata } from 'obsidian'
// app.vault.getMarkdownFiles(): TFile[]
// app.metadataCache.getFileCache(file: TFile): CachedMetadata | null
// CachedMetadata.headings?: { heading: string; level: number }[]
// getAllTags(cache: CachedMetadata): string[] | null  — returns tags with '#' prefix
</interfaces>

<!-- Key project rules: -->
<!-- CLAUDE.md: no console.log, vault.process() for writes (N/A here — VaultIndex is read-only) -->
<!-- CLAUDE.md: normalizePath() for user-defined paths (excludedPaths come from settings, already normalized by Phase 1) -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create VaultIndex.ts — class with private maps and typed query API</name>
  <files>src/VaultIndex.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts (exact interface shapes: FileRecord, FolderRecord, TagNode, HeadingRecord)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.ts (exact function signatures: normalizeTags, buildTagTree, buildFlatTagMap, indexFolders)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/exclusions.ts (isExcluded signature)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md (D-07 thru D-12 — full API surface and lifecycle decisions)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (see existing onload/onLayoutReady structure to understand wiring target)
  </read_first>
  <action>
Create `src/VaultIndex.ts`. This is the Obsidian-coupled class. It imports from Obsidian and from
the pure-logic modules created in Plan 02-01.

**Import block (exact):**
```typescript
import { App, TFile, getAllTags } from 'obsidian';
import { FileRecord, FolderRecord, TagNode, HeadingRecord } from './lib/vault-index-types';
import { normalizeTags, buildTagTree, buildFlatTagMap, indexFolders } from './lib/tag-utils';
import { isExcluded } from './lib/exclusions';
```

**Class structure:**

```typescript
export default class VaultIndex {
  private files = new Map<string, FileRecord>();
  private folders = new Map<string, FolderRecord>();
  private tagTree = new Map<string, TagNode>();
  private flatTagMap = new Map<string, string[]>();
  private dirty = new Set<string>();

  onRebuildComplete: (() => void) | null = null;

  constructor(private app: App, private excludedPaths: string[]) {}

  // --- Mutation (called from main.ts vault events) ---

  markDirty(filePath: string): void {
    this.dirty.add(filePath);
  }

  remove(filePath: string): void {
    this.files.delete(filePath);
    this.dirty.delete(filePath);
    // Rebuild folder/tag structures to remove stale entries
    this._rebuildDerivedMaps();
  }

  // --- Rebuild ---

  async rebuild(): Promise<void> {
    this.files.clear();
    this.folders.clear();
    this.tagTree.clear();
    this.flatTagMap.clear();
    this.dirty.clear();

    const allFiles = this.app.vault.getMarkdownFiles();
    for (const file of allFiles) {
      if (isExcluded(file.path, this.excludedPaths)) continue;
      this._indexFile(file);
    }
    this._rebuildDerivedMaps();
    this.onRebuildComplete?.();
  }

  async rebuildDirty(): Promise<void> {
    if (this.dirty.size === 0) return;
    const dirtyPaths = new Set(this.dirty);
    this.dirty.clear();

    for (const filePath of dirtyPaths) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        this._indexFile(file);
      } else {
        this.files.delete(filePath);
      }
    }
    this._rebuildDerivedMaps();
    this.onRebuildComplete?.();
  }

  // --- Query API (D-10) ---

  getFilesInFolder(folderPath: string): FileRecord[] {
    const folder = this.folders.get(folderPath);
    if (!folder) return [];
    return folder.files
      .map(p => this.files.get(p))
      .filter((r): r is FileRecord => r !== undefined);
  }

  getFilesWithTag(tag: string): string[] {
    return this.flatTagMap.get(tag) ?? [];
  }

  getHeadings(filePath: string): HeadingRecord[] {
    return this.files.get(filePath)?.headings ?? [];
  }

  getAllFolders(): string[] {
    return Array.from(this.folders.keys());
  }

  getTagTree(): Map<string, TagNode> {
    return this.tagTree;
  }

  isDirty(filePath: string): boolean {
    return this.dirty.has(filePath);
  }

  // --- Private helpers ---

  private _indexFile(file: TFile): void {
    const cache = this.app.metadataCache.getFileCache(file);
    const rawTags = cache ? (getAllTags(cache) ?? []) : [];
    const tags = normalizeTags(rawTags);
    const headings: HeadingRecord[] = (cache?.headings ?? []).map(h => ({
      text: h.heading,
      level: h.level,
    }));
    const lastSlash = file.path.lastIndexOf('/');
    const folderPath = lastSlash === -1 ? '' : file.path.slice(0, lastSlash);
    this.files.set(file.path, { path: file.path, tags, headings, folderPath });
  }

  private _rebuildDerivedMaps(): void {
    const pairs = Array.from(this.files.values()).map(r => ({
      filePath: r.path,
      tags: r.tags,
    }));
    this.tagTree = buildTagTree(pairs);
    this.flatTagMap = buildFlatTagMap(pairs);
    this.folders = indexFolders(Array.from(this.files.keys()));
  }
}
```

**Implementation rules:**
- Default export (so main.ts imports as `import VaultIndex from './VaultIndex'`)
- All internal maps are private — no public access to raw Map/Set fields
- `onRebuildComplete` is a nullable single callback (D-11 discretion choice: single callback over Set of listeners)
- `getAllTags(cache)` is the Obsidian utility that merges frontmatter + body tags, returns strings with `#` — pass to normalizeTags which strips `#`
- `app.vault.getAbstractFileByPath()` returns TAbstractFile | null; instanceof TFile check required before casting
- No console.log — use console.warn or console.error only if absolutely needed for error states
- Each method under 30 lines; file under 300 lines (target ~180 lines); nesting max 3 levels
- `_indexFile` and `_rebuildDerivedMaps` are private helpers (underscore prefix signals internal-only)
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "^export default class VaultIndex" src/VaultIndex.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^export default class VaultIndex" src/VaultIndex.ts` outputs `1`
    - `grep -v "^[[:space:]]*//" src/VaultIndex.ts | grep -c "console\.log"` outputs `0` (no console.log in non-comment lines)
    - `grep "private files" src/VaultIndex.ts` matches exactly 1 line containing `Map<string, FileRecord>`
    - `grep "private folders" src/VaultIndex.ts` matches exactly 1 line containing `Map<string, FolderRecord>`
    - `grep "private tagTree" src/VaultIndex.ts` matches exactly 1 line containing `Map<string, TagNode>`
    - `grep "private flatTagMap" src/VaultIndex.ts` matches exactly 1 line containing `Map<string, string[]>`
    - `grep "private dirty" src/VaultIndex.ts` matches exactly 1 line containing `Set<string>`
    - `grep "onRebuildComplete" src/VaultIndex.ts` matches at least 2 lines (declaration + invocation in rebuild)
    - `grep "markDirty" src/VaultIndex.ts` matches at least 1 line with method signature
    - `grep "remove(" src/VaultIndex.ts` matches at least 1 line with method signature
    - `grep "rebuildDirty" src/VaultIndex.ts` matches at least 1 line with `async rebuildDirty`
    - `grep "getAllTags" src/VaultIndex.ts` matches at least 1 line (Obsidian utility call in _indexFile)
    - `grep "normalizeTags" src/VaultIndex.ts` matches at least 1 line (called in _indexFile)
    - `grep "isExcluded" src/VaultIndex.ts` matches at least 1 line (called in rebuild)
    - `grep "from 'obsidian'" src/VaultIndex.ts` matches exactly 1 import line
    - `grep "from './lib/vault-index-types'" src/VaultIndex.ts` matches exactly 1 import line
    - `grep "from './lib/tag-utils'" src/VaultIndex.ts` matches exactly 1 import line
    - `grep "from './lib/exclusions'" src/VaultIndex.ts` matches exactly 1 import line
  </acceptance_criteria>
  <done>src/VaultIndex.ts exists as default export class with private maps, full query API (D-10), markDirty/remove, rebuild/rebuildDirty, onRebuildComplete callback, and correct imports from lib/</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| MetadataCache → _indexFile | Raw tag strings and heading text from Obsidian's MetadataCache enter index build |
| vault file paths → rebuild/markDirty/remove | TFile.path values from Obsidian vault events are used as Map keys |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-04 | Information Disclosure | VaultIndex (general) | accept | All data is the user's own vault content; no secrets are indexed; tags and headings are already visible in the vault; in-memory only, not persisted or transmitted |
| T-02-05 | Denial of Service | rebuild() | accept | Bounded by vault size (user's own machine); getMarkdownFiles() is synchronous and fast; MetadataCache reads are synchronous lookups from Obsidian's already-built cache |
| T-02-06 | Tampering | remove() → _rebuildDerivedMaps() | accept | File paths come from Obsidian's TFile API; path values are vault-internal and normalized by Obsidian before reaching this layer |
| T-02-07 | Elevation of Privilege | onRebuildComplete callback | accept | Callback is registered by plugin code in the same process; no external caller can register; no privilege boundary crossed |
</threat_model>

<verification>
After task completes:

```bash
grep -c "^import" /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts
```
Must output `4` (obsidian, vault-index-types, tag-utils, exclusions).

```bash
grep "private " /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts | grep -v "constructor\|_index\|_rebuild"
```
Must show the 5 private field declarations (files, folders, tagTree, flatTagMap, dirty).

```bash
wc -l /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts
```
Must be under 300 lines.
</verification>

<success_criteria>
- src/VaultIndex.ts is a default-export class with 5 private maps/sets
- All 8 query methods from D-10 are present: getFilesInFolder, getFilesWithTag, getHeadings, getAllFolders, getTagTree, isDirty, rebuild, rebuildDirty
- markDirty and remove are present for vault event wiring (Plan 02-03)
- onRebuildComplete nullable callback declared and called after each rebuild
- Zero console.log; imports from obsidian + 3 pure-logic lib modules
</success_criteria>

<output>
After completion, create `.planning/phases/02-vaultindex-core-data-layer/02-02-SUMMARY.md`
using the summary template.
</output>
