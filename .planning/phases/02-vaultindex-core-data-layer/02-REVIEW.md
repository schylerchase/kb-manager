---
phase: 02-vaultindex-core-data-layer
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/VaultIndex.ts
  - src/lib/tag-utils.test.ts
  - src/lib/tag-utils.ts
  - src/lib/vault-index-types.ts
  - src/main.ts
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-29
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Five files reviewed covering the VaultIndex core data layer: the index class, tag utilities and their tests, the type definitions, and the main plugin entry point. The type definitions and tag-utils implementations are clean and well-structured. The critical issue is a race condition in `rebuildDirty()` that silently discards dirty-marks received during async processing. Four warnings cover a stale `excludedPaths` reference that persists through settings changes, an undocumented "direct children only" contract on `getFilesInFolder` that will produce silent empty MOCs, a missing `.md` extension guard on `getMarkdownFiles()`, and an uncovered edge case in `buildTagTree`. All project rules (onLayoutReady, normalizePath, no console.log, vault event wiring) are correctly followed in the reviewed files.

---

## Critical Issues

### CR-01: Race condition in `rebuildDirty()` — dirty-marks received during the loop are silently lost

**File:** `src/VaultIndex.ts:66-67`

`rebuildDirty()` snapshots `this.dirty` into `dirtyPaths` and immediately clears `this.dirty` (line 67) before any async work begins. `_indexFile` calls `this.app.metadataCache.getFileCache(file)` synchronously, but the method is `async` and the scheduler that calls it may interleave with vault events. More concretely: if a vault `modify` event fires after line 67's `clear()` and calls `markDirty()`, that new path lands in `this.dirty`; but `this.dirty` was already cleared, so when the loop finishes there is nothing left to process. The file is silently dropped from the dirty set and will not be re-indexed until the next full `rebuild()`.

```typescript
// Current — problematic
const dirtyPaths = new Set(this.dirty);
this.dirty.clear();              // ← new markDirty() calls after this line are erased
for (const filePath of dirtyPaths) { ... }
```

Fix: remove the upfront `clear()` and delete only the paths that were actually processed:

```typescript
async rebuildDirty(): Promise<void> {
  if (this.dirty.size === 0) return;
  const dirtyPaths = new Set(this.dirty);
  // Do NOT clear this.dirty here; new events arriving during the loop must survive.

  for (const filePath of dirtyPaths) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      this._indexFile(file);
    } else {
      this.files.delete(filePath);
    }
    this.dirty.delete(filePath); // Remove only what was processed
  }
  this._rebuildDerivedMaps();
  this.onRebuildComplete?.();
}
```

---

## Warnings

### WR-01: Stale `excludedPaths` — index ignores exclusion changes until plugin reload

**File:** `src/VaultIndex.ts:24` and `src/main.ts:12`

`VaultIndex` captures `excludedPaths` as a constructor parameter stored in `this.excludedPaths`. `main.ts` passes `this.settings.excludedPaths` at construction time (line 12). If the user later modifies exclusion patterns in the settings tab, `this.settings.excludedPaths` is updated and persisted, but `VaultIndex.excludedPaths` still holds the original array. All subsequent `rebuild()` and `rebuildDirty()` calls (and the `isExcluded` check on line 53) use the stale value. Newly excluded folders continue to be indexed; previously excluded folders that were un-excluded remain excluded.

Fix: expose a method to update the reference and call it from any settings change that touches `excludedPaths`:

```typescript
// VaultIndex.ts — add public method
updateExcludedPaths(paths: string[]): void {
  this.excludedPaths = paths;
}
```

Then in the settings `onChange` for exclusion patterns:
```typescript
this.plugin.settings.excludedPaths = parseExclusionPatterns(v);
this.plugin.index.updateExcludedPaths(this.plugin.settings.excludedPaths);
await this.plugin.saveSettings();
```

---

### WR-02: `getFilesInFolder` silently returns `[]` for any folder that contains only subfolders

**File:** `src/lib/tag-utils.ts:57-69` and `src/VaultIndex.ts:85-91`

`indexFolders` creates a `FolderRecord` only for the *immediate parent directory* of each file path. A folder like `notes/` that contains only subdirectories (`notes/projects/foo.md`, `notes/archive/bar.md`) receives no entry in the map at all. `getFilesInFolder('notes')` returns `[]`.

This is silent: no error, no log — just an empty result. If MOC generation in a later phase calls `getFilesInFolder` on intermediate folders expecting a recursive listing, every intermediate-level MOC will be generated empty and written to disk, silently erasing legitimate content.

Fix (minimal — document the contract now before downstream consumers are built):

```typescript
// vault-index-types.ts — FolderRecord.files
/**
 * Vault-relative paths of files whose *immediate* parent is this folder.
 * Non-recursive — subdirectory contents are NOT included.
 */
files: string[];
```

```typescript
// VaultIndex.ts — getFilesInFolder JSDoc
/** O(1) lookup of files whose immediate parent is folderPath. Non-recursive. D-03. */
getFilesInFolder(folderPath: string): FileRecord[]
```

If recursive lookup is needed by MOC generation, a separate `getFilesInFolderRecursive` must be added explicitly.

---

### WR-03: `rebuild()` does not guard against non-markdown files

**File:** `src/VaultIndex.ts:51-55`

The call on line 51 (`this.app.vault.getMarkdownFiles()`) should return only `.md` files — that is correct API usage. However `_indexFile` (line 121) constructs `HeadingRecord` and `tags` entirely from `MetadataCache`, which is only populated for markdown files. There is no guard anywhere in the pipeline: if the method name were ever changed to `getAllFiles()` during refactoring, non-markdown files (images, PDFs, attachments) would be silently indexed with empty tags/headings and pollute every `FolderRecord.files` list, which downstream MOC generators iterate.

Fix: add a one-line guard at the top of `_indexFile` to make the invariant explicit and safe against future refactoring:

```typescript
private _indexFile(file: TFile): void {
  if (file.extension !== 'md') return; // Guard: MetadataCache only valid for markdown
  // ...existing code...
}
```

---

### WR-04: `buildTagTree` has no duplicate-filePath guard and the gap is untested

**File:** `src/lib/tag-utils.ts:34-36`

`normalizeTags` deduplicates tags per file, so the `_indexFile` → `buildTagTree` production path is safe. But `buildTagTree` is exported as a public function; its signature places no constraint on the `tags` arrays it receives. A caller passing a tag array with duplicates (e.g., `['api', 'api']`) causes `filePath` to be pushed into `node.files` twice. Downstream consumers iterating `TagNode.files` would process the same file twice per tag occurrence, potentially producing duplicate links in MOC output. The test suite has no case covering this input.

Fix (Option A — document the precondition):
```typescript
/**
 * Builds the tag hierarchy tree.
 * @param fileTagPairs - `tags` arrays MUST be pre-normalized and deduplicated.
 *   Pass through `normalizeTags()` before calling.
 */
export function buildTagTree(...)
```

Fix (Option B — guard defensively inside the function):
```typescript
if (i === segments.length - 1 && !node.files.includes(filePath)) {
  node.files.push(filePath);
}
```

Option A is lower cost; Option B makes the function safe regardless of caller discipline.

---

## Info

### IN-01: `VaultIndex.ts` approaching complexity ceiling — plan extraction before Phase 3

**File:** `src/VaultIndex.ts`

Currently 144 lines, within the 300-line limit. Phase 3 (scheduler wiring) and Phase 4 (MOC/TOC query methods) will add to this file. The two private helpers (`_indexFile`, `_rebuildDerivedMaps`) are good extraction candidates. Extract them to a `vault-index-helpers.ts` before the file exceeds 250 lines to avoid a larger split under time pressure.

---

### IN-02: `FolderRecord.name` is `''` for root-level files — undocumented, callers must handle

**File:** `src/lib/tag-utils.ts:62` and `src/lib/vault-index-types.ts:28`

For files at the vault root, `folderPath` is `''` and `name` is also set to `''` (line 62). This is internally consistent but creates a silent obligation on every consumer to handle the empty-string display case. No test asserts what consumers do with `name === ''`.

Fix: add a JSDoc note to `FolderRecord.name`:
```typescript
/** Last path segment of the folder. Empty string ('') for the vault root. */
name: string;
```

---

_Reviewed: 2026-04-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
