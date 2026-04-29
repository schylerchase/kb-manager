---
phase: 02-vaultindex-core-data-layer
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/vault-index-types.ts
  - src/lib/tag-utils.ts
autonomous: true
requirements:
  - INDX-01
  - INDX-02
  - INDX-03
must_haves:
  truths:
    - "src/lib/vault-index-types.ts exports HeadingRecord, FileRecord, FolderRecord, TagNode with no Obsidian imports"
    - "normalizeTag('#Parent/Child') returns 'parent/child'"
    - "normalizeTags(['#A', '#a', '#b']) returns ['a', 'b'] (deduplication applied)"
    - "buildTagTree with a #parent/child tag produces a root 'parent' node with a 'child' entry in its children map"
    - "buildFlatTagMap with two files sharing tag 'api' maps 'api' to an array containing both file paths"
    - "indexFolders(['notes/foo.md', 'notes/bar.md']) returns a FolderRecord at key 'notes' with files containing both paths"
    - "indexFolders([]) returns an empty Map"
  artifacts:
    - path: "src/lib/vault-index-types.ts"
      provides: "TypeScript interfaces: HeadingRecord, FileRecord, FolderRecord, TagNode"
      exports: ["HeadingRecord", "FileRecord", "FolderRecord", "TagNode"]
    - path: "src/lib/tag-utils.ts"
      provides: "Pure functions for tag normalization, tree building, flat map building, and folder indexing"
      exports: ["normalizeTag", "normalizeTags", "buildTagTree", "buildFlatTagMap", "indexFolders"]
  key_links:
    - from: "src/VaultIndex.ts"
      to: "src/lib/vault-index-types.ts"
      via: "import { FileRecord, FolderRecord, TagNode, HeadingRecord } from './lib/vault-index-types'"
      pattern: "from.*vault-index-types"
    - from: "src/VaultIndex.ts"
      to: "src/lib/tag-utils.ts"
      via: "import { normalizeTag, normalizeTags, buildTagTree, buildFlatTagMap, indexFolders } from './lib/tag-utils'"
      pattern: "from.*tag-utils"
---

<objective>
Create the pure-logic foundation for VaultIndex: type definitions and utility functions with zero Obsidian
imports. These are the testable building blocks that the Obsidian-coupled VaultIndex class (Plan 02-02)
imports and orchestrates.

Purpose: Separating pure logic from Obsidian API calls keeps business logic unit-testable via Vitest
without mocking. Pattern established in Phase 1 (exclusions.ts, delimiter.ts, settings-parser.ts).

Output: src/lib/vault-index-types.ts (interfaces), src/lib/tag-utils.ts (pure functions)
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
<!-- These are the contracts being established in this plan. -->
<!-- VaultIndex (Plan 02-02) imports all of these — establish exact names now. -->

// src/lib/vault-index-types.ts — to be created (no imports)
export interface HeadingRecord {
  text: string;
  level: number; // 1–6 (h1=1 ... h6=6)
}

export interface FileRecord {
  path: string;           // vault-relative path (normalized)
  tags: string[];         // normalized: no '#', lowercased, deduplicated per file
  headings: HeadingRecord[];
  folderPath: string;     // parent folder path (e.g. 'notes' for 'notes/foo.md', '' for root)
}

export interface FolderRecord {
  path: string;           // vault-relative folder path ('' for root)
  name: string;           // last segment of path (e.g. 'notes'), '' for root
  files: string[];        // file paths (vault-relative) directly in this folder
}

export interface TagNode {
  files: string[];                    // file paths that carry this exact tag segment
  children: Map<string, TagNode>;     // sub-tags (e.g. 'child' under 'parent' for #parent/child)
}

// src/lib/tag-utils.ts — to be created (no imports)
export function normalizeTag(rawTag: string): string
// Strip leading '#', lowercase the result. '#Parent/Child' → 'parent/child'

export function normalizeTags(rawTags: string[]): string[]
// Normalize each tag then deduplicate. ['#A', '#a', '#b'] → ['a', 'b']

export function buildTagTree(
  fileTagPairs: Array<{ filePath: string; tags: string[] }>
): Map<string, TagNode>
// Build nested TagNode tree. tags must already be normalized (no '#', lowercase).
// '#parent/child' segments split on '/': root key 'parent', child key 'child'.
// Each node accumulates all filePaths that carry that exact segment path.

export function buildFlatTagMap(
  fileTagPairs: Array<{ filePath: string; tags: string[] }>
): Map<string, string[]>
// Build flat tag→files map. tags must already be normalized.
// 'api' → ['notes/a.md', 'notes/b.md'] for O(1) exact-tag lookups.

export function indexFolders(filePaths: string[]): Map<string, FolderRecord>
// Build folder map from file paths. Each file contributes to its parent folder.
// 'notes/foo.md' → FolderRecord at key 'notes' with path='notes', name='notes', files=[...]
// Root files ('foo.md') → FolderRecord at key '' with path='', name='', files=[...]
</interfaces>

<!-- Existing pure-logic pattern to follow: -->
<!-- src/lib/exclusions.ts — zero imports, named exports only, no console.log -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create vault-index-types.ts — shared TypeScript interfaces</name>
  <files>src/lib/vault-index-types.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/exclusions.ts (zero-import pattern to replicate)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md (D-01, D-02, D-03, D-04, D-05 — exact shape decisions)
  </read_first>
  <action>
Create `src/lib/vault-index-types.ts`. This file has NO imports — pure TypeScript interface
definitions only. All four interfaces must be exported with the exact names below.

```typescript
// src/lib/vault-index-types.ts

/**
 * A single heading extracted from a file's MetadataCache.
 * D-01: flat array per file — no nested tree. level 1=h1 ... 6=h6.
 */
export interface HeadingRecord {
  text: string;
  level: number;
}

/**
 * Indexed representation of a single vault file.
 * D-02: tags are normalized (# stripped, lowercased, deduplicated per file).
 * D-03: folderPath is the parent directory path; '' for root-level files.
 */
export interface FileRecord {
  path: string;
  tags: string[];
  headings: HeadingRecord[];
  folderPath: string;
}

/**
 * Indexed representation of a vault folder.
 * D-03: separate map alongside FileRecord map for O(1) getFilesInFolder().
 * files contains vault-relative paths of files directly in this folder.
 */
export interface FolderRecord {
  path: string;
  name: string;
  files: string[];
}

/**
 * One node in the tag hierarchy tree.
 * D-04: TagNode = { files, children }. Root Map<string, TagNode> holds top-level
 * tag segments; children recurse for #parent/child patterns.
 */
export interface TagNode {
  files: string[];
  children: Map<string, TagNode>;
}
```

No default export. Named exports only. Zero imports. Zero console.log. File must stay under 50 lines.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "^export interface" src/lib/vault-index-types.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^export interface" src/lib/vault-index-types.ts` outputs `4`
    - `grep -c "^import" src/lib/vault-index-types.ts` outputs `0`
    - `grep -c "console" src/lib/vault-index-types.ts` outputs `0`
    - `grep "HeadingRecord" src/lib/vault-index-types.ts` matches a line with `export interface HeadingRecord`
    - `grep "FileRecord" src/lib/vault-index-types.ts` matches a line with `export interface FileRecord`
    - `grep "FolderRecord" src/lib/vault-index-types.ts` matches a line with `export interface FolderRecord`
    - `grep "TagNode" src/lib/vault-index-types.ts` matches a line with `export interface TagNode`
    - `grep "children: Map" src/lib/vault-index-types.ts` outputs at least 1 match (TagNode.children is a Map)
  </acceptance_criteria>
  <done>src/lib/vault-index-types.ts exists with 4 exported interfaces (HeadingRecord, FileRecord, FolderRecord, TagNode), zero imports, zero console calls</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create tag-utils.ts — pure tag and folder logic</name>
  <files>src/lib/tag-utils.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts (FolderRecord, TagNode — just created above; read to confirm exact interface shapes)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md (D-02: tag normalization; D-04: TagNode tree; D-05: flat tag map; D-03: folder indexing)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/exclusions.ts (zero-import pattern)
  </read_first>
  <behavior>
    - normalizeTag('#Parent/Child') → 'parent/child'
    - normalizeTag('already') → 'already' (no # to strip)
    - normalizeTag('#UPPER') → 'upper'
    - normalizeTags(['#A', '#a', '#b']) → ['a', 'b'] (deduplicated, order of first occurrence preserved)
    - normalizeTags([]) → []
    - buildTagTree([{ filePath: 'a.md', tags: ['parent/child'] }]) → Map with key 'parent' whose node has children Map with key 'child'; child node's files includes 'a.md'
    - buildTagTree([{ filePath: 'a.md', tags: ['api'] }, { filePath: 'b.md', tags: ['api'] }]) → root Map key 'api' with files ['a.md', 'b.md']
    - buildFlatTagMap([{ filePath: 'a.md', tags: ['api'] }, { filePath: 'b.md', tags: ['api'] }]) → Map key 'api' → ['a.md', 'b.md']
    - buildFlatTagMap([]) → empty Map
    - indexFolders(['notes/foo.md', 'notes/bar.md']) → Map key 'notes' with FolderRecord { path: 'notes', name: 'notes', files: ['notes/foo.md', 'notes/bar.md'] }
    - indexFolders(['foo.md']) → Map key '' with FolderRecord { path: '', name: '', files: ['foo.md'] }
    - indexFolders([]) → empty Map
  </behavior>
  <action>
Create `src/lib/tag-utils.ts`. Import only from `'./vault-index-types'` (no Obsidian imports).

Implementation rules:
- All functions are pure (no side effects, no mutation of inputs)
- Each function under 30 lines; file under 150 lines; nesting max 3 levels
- No console.log, no console.warn — pure utility module
- normalizeTag: strip leading '#' with `rawTag.replace(/^#/, '')`, then `.toLowerCase()`
- normalizeTags: map normalizeTag over array, then deduplicate using Set (preserve first-occurrence order)
- buildTagTree: for each {filePath, tags} pair, split each tag on '/' to get segments; walk/create
  the tree segment by segment; push filePath into the node's files at each terminal node (the last segment);
  intermediate nodes receive filePath only at their own level when the tag path terminates there
  — meaning filePath goes into the node for the LAST segment only, not every ancestor node
- buildFlatTagMap: for each {filePath, tags} pair, for each tag look up or create the array in the map,
  then push filePath
- indexFolders: for each filePath, derive folderPath by taking everything before the last '/'
  (or '' if no '/' present); look up or create FolderRecord with path=folderPath, name=last segment
  of folderPath (or '' for root), files=[]; push filePath into files

```typescript
import { FolderRecord, TagNode } from './vault-index-types';

export function normalizeTag(rawTag: string): string {
  return rawTag.replace(/^#/, '').toLowerCase();
}

export function normalizeTags(rawTags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of rawTags) {
    const normalized = normalizeTag(raw);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

export function buildTagTree(
  fileTagPairs: Array<{ filePath: string; tags: string[] }>
): Map<string, TagNode> {
  const root = new Map<string, TagNode>();
  for (const { filePath, tags } of fileTagPairs) {
    for (const tag of tags) {
      const segments = tag.split('/');
      let current = root;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!current.has(seg)) {
          current.set(seg, { files: [], children: new Map() });
        }
        const node = current.get(seg)!;
        if (i === segments.length - 1) {
          node.files.push(filePath);
        }
        current = node.children;
      }
    }
  }
  return root;
}

export function buildFlatTagMap(
  fileTagPairs: Array<{ filePath: string; tags: string[] }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { filePath, tags } of fileTagPairs) {
    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)!.push(filePath);
    }
  }
  return map;
}

export function indexFolders(filePaths: string[]): Map<string, FolderRecord> {
  const map = new Map<string, FolderRecord>();
  for (const filePath of filePaths) {
    const lastSlash = filePath.lastIndexOf('/');
    const folderPath = lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
    const name = folderPath === '' ? '' : folderPath.split('/').pop() ?? '';
    if (!map.has(folderPath)) {
      map.set(folderPath, { path: folderPath, name, files: [] });
    }
    map.get(folderPath)!.files.push(filePath);
  }
  return map;
}
```

No default export. Named exports only. Only import is from `'./vault-index-types'`.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "^export function" src/lib/tag-utils.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^export function" src/lib/tag-utils.ts` outputs `5`
    - `grep "^import" src/lib/tag-utils.ts` matches only lines importing from `'./vault-index-types'` (no obsidian import)
    - `grep -c "console" src/lib/tag-utils.ts` outputs `0`
    - `grep "export function normalizeTag" src/lib/tag-utils.ts` matches exactly 1 line
    - `grep "export function normalizeTags" src/lib/tag-utils.ts` matches exactly 1 line
    - `grep "export function buildTagTree" src/lib/tag-utils.ts` matches exactly 1 line
    - `grep "export function buildFlatTagMap" src/lib/tag-utils.ts` matches exactly 1 line
    - `grep "export function indexFolders" src/lib/tag-utils.ts` matches exactly 1 line
    - File is under 150 lines
  </acceptance_criteria>
  <done>src/lib/tag-utils.ts exists with 5 exported pure functions; only imports from vault-index-types; zero console calls; all behaviors confirmed by test run in Plan 02-04</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| MetadataCache → tag-utils functions | Raw tag strings from Obsidian's MetadataCache enter normalizeTag/normalizeTags |
| vault file paths → indexFolders | TFile.path values from Obsidian vault enter indexFolders |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | normalizeTag | accept | Input is tag text from user's own vault; worst case is a tag that normalizes unexpectedly; no external data enters here |
| T-02-02 | Denial of Service | buildTagTree | accept | Tag count and depth are bounded by vault content; deeply nested #a/b/c/.../z tags would require deliberate abuse of one's own vault; no unbounded external input |
| T-02-03 | Information Disclosure | tag-utils (general) | accept | Pure functions with no I/O; no secrets or PII processed; tag and path data stays in-memory within the plugin process |
</threat_model>

<verification>
After both tasks complete:

```bash
grep -r "from 'obsidian'" /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.ts
```
Must return zero results — both files are Obsidian-import-free.

```bash
grep -r "console\.log" /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.ts
```
Must return zero results.

```bash
grep -c "^export" /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts
```
Must output `4` (four exported interfaces).

```bash
grep -c "^export" /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.ts
```
Must output `5` (five exported functions).
</verification>

<success_criteria>
- src/lib/vault-index-types.ts: 4 exported interfaces (HeadingRecord, FileRecord, FolderRecord, TagNode); zero imports; zero console calls
- src/lib/tag-utils.ts: 5 exported pure functions; imports only from './vault-index-types'; zero console calls
- Both files have zero Obsidian imports — fully Vitest-testable without mocking
- TagNode.children is typed as Map<string, TagNode> (recursive type — confirmed by grep)
</success_criteria>

<output>
After completion, create `.planning/phases/02-vaultindex-core-data-layer/02-01-SUMMARY.md`
using the summary template.
</output>
