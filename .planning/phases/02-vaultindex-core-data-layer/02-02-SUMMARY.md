---
phase: 02-vaultindex-core-data-layer
plan: "02"
subsystem: index
tags: [obsidian, vault-index, typescript, metadata-cache]

# Dependency graph
requires:
  - phase: 02-01-types-and-tag-utils
    provides: FileRecord, FolderRecord, TagNode, HeadingRecord types; normalizeTags, buildTagTree, buildFlatTagMap, indexFolders, isExcluded functions
provides:
  - VaultIndex class (default export) with 5 private maps, full query API, rebuild/rebuildDirty, markDirty/remove, onRebuildComplete callback
affects: [02-03-main-integration, 02-04-tests, 03-scheduler, 04-moc-generator, 05-toc-generator, 06-tag-manager, 07-sidebar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VaultIndex as single source of truth — all generators query this class, nothing reads MetadataCache directly"
    - "Private Map/Set fields with typed query methods — no raw map access from outside"
    - "onRebuildComplete single nullable callback — fired after full and dirty rebuilds"

key-files:
  created:
    - src/VaultIndex.ts
  modified: []

key-decisions:
  - "onRebuildComplete is a single nullable callback (not a Set of listeners) — sufficient for Phase 2 needs, Phase 3 scheduler can expand if needed"
  - "remove() calls _rebuildDerivedMaps() inline — keeps folder/tag maps consistent on immediate delete"
  - "rebuildDirty() snapshots dirty set before clearing — avoids re-marking files dirty during rebuild loop"

patterns-established:
  - "Private helpers prefixed with underscore (_indexFile, _rebuildDerivedMaps) — signals internal-only"
  - "getAllTags(cache) ?? [] pattern — handles null CachedMetadata gracefully"
  - "instanceof TFile guard in rebuildDirty — required before casting TAbstractFile"

requirements-completed: [INDX-01, INDX-02, INDX-03, INDX-04]

# Metrics
duration: 10min
completed: 2026-04-29
---

# Phase 2 Plan 02: VaultIndex Class Summary

**Obsidian-coupled VaultIndex class wrapping MetadataCache behind a typed query interface — 5 private maps, rebuild/rebuildDirty, markDirty/remove, onRebuildComplete callback**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-29T00:00:00Z
- **Completed:** 2026-04-29T00:10:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- VaultIndex class with 5 private maps (files, folders, tagTree, flatTagMap, dirty) — no public raw map access
- Full query API: getFilesInFolder, getFilesWithTag, getHeadings, getAllFolders, getTagTree, isDirty, rebuild, rebuildDirty
- markDirty/remove mutation methods for vault event wiring (Plan 02-03)
- onRebuildComplete nullable callback fired after every rebuild and rebuildDirty
- Zero console.log; 144 lines (under 300 limit); all methods under 30 lines

## Task Commits

1. **Task 1: Create VaultIndex.ts** - `26b20e2` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `src/VaultIndex.ts` - Default-export VaultIndex class with private maps and typed query API

## Decisions Made
- `onRebuildComplete` is a single nullable callback rather than a Set of listeners — D-11 discretion choice; Phase 3 scheduler only needs one hook point
- `remove()` calls `_rebuildDerivedMaps()` immediately — keeps folder/tag state consistent when a file is deleted
- `rebuildDirty()` snapshots the dirty set into `dirtyPaths` before clearing — prevents files marked dirty during the loop from being lost

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/VaultIndex.ts` is ready for Plan 02-03 (main.ts wiring) and Plan 02-04 (Vitest tests)
- Plan 02-03 can wire `this.index = new VaultIndex(this.app, settings.excludedPaths)` in `onload()` and call `this.index.rebuild()` inside `onLayoutReady`
- Plan 02-04 can import VaultIndex for integration tests or test query methods with a mocked App

---
*Phase: 02-vaultindex-core-data-layer*
*Completed: 2026-04-29*
