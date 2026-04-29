# Phase 2 Discussion Log

**Date:** 2026-04-29
**Phase:** VaultIndex — Core Data Layer
**Areas covered:** FileRecord shape, Dirty-file tracking mechanics, VaultIndex API surface, Tag hierarchy structure

---

## Area: FileRecord Shape

| Question | Options Presented | Selected |
|----------|-------------------|----------|
| What should FileRecord carry for headings? | Flat array of {text, level} / Nested tree by heading level / You decide | Flat array of {text, level} |
| What should FileRecord carry for tags? | Normalized flat array (no # prefix, lowercase) / Raw strings as MetadataCache returns / You decide | Normalized flat array |
| How should folders be represented? | Separate FolderRecord map alongside FileRecord map / Derive folders dynamically from file paths / You decide | Separate FolderRecord map |

**Notes:** All recommended options chosen. Shape closely mirrors MetadataCache output with normalization on insert.

---

## Area: Dirty-file Tracking Mechanics

| Question | Options Presented | Selected |
|----------|-------------------|----------|
| Ephemeral or persisted across restarts? | Ephemeral — full rebuild on startup / Persisted / You decide | Ephemeral |
| Which vault events mark a file dirty? | modify + create + rename / modify only / You decide | modify + create + rename |
| 'Rebuild from dirty files only' meaning? | Re-index only dirty files, keep clean entries / Full rebuild every time / You decide | Re-index only dirty files |

**Notes:** Delete is a special case — removes file from index immediately, not mark-dirty. Ephemeral dirty set resolves STATUS.md open question about offline changes gap.

---

## Area: VaultIndex API Surface

| Question | Options Presented | Selected |
|----------|-------------------|----------|
| How should downstream generators access data? | Typed query methods on VaultIndex class / Public map properties — direct access / You decide | Typed query methods |
| Should VaultIndex emit event when rebuild completes? | Yes — onRebuildComplete callback / No — Phase 7 registers own vault events / You decide | Yes — onRebuildComplete callback |
| Where should VaultIndex live? | Plugin instance (this.index) / Module-level singleton / You decide | Plugin instance (this.index) |

**Notes:** Private maps + typed API = freedom to change internals without breaking 5 downstream phases.

---

## Area: Tag Hierarchy Structure

| Question | Options Presented | Selected |
|----------|-------------------|----------|
| Internal tag hierarchy structure? | TagNode tree: Map<string, TagNode> / Flat map from full tag path to files / You decide | TagNode tree |
| Carry flat tag→files map alongside tree? | Yes — both tree and flat map / No — tree only | Yes — both |
| Tag query responsibility split? | VaultIndex exposes raw data; Phase 6 TagManager adds query logic / VaultIndex exposes full tag API | VaultIndex exposes raw data; Phase 6 wraps |

**Notes:** Dual structure (tree + flat map) gives O(1) lookups for both traversal and exact-tag queries. Phase 6 TagManager builds cross-reference logic on top of this foundation without Phase 2 needing to know about it.

---

## Claude's Discretion Items

- Exact `FolderRecord` fields beyond minimum `{ path, name, files }`
- Whether `onRebuildComplete` is a single callback or Set of listeners
- Internal method naming conventions (`_indexFile` vs `indexFile`)

## Deferred Ideas

None.
