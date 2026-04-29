---
phase: 02-vaultindex-core-data-layer
plan: "01"
subsystem: vault-index
tags: [types, tag-utils, pure-logic, tdd, vitest]
dependency_graph:
  requires: []
  provides:
    - HeadingRecord interface
    - FileRecord interface
    - FolderRecord interface
    - TagNode interface
    - normalizeTag function
    - normalizeTags function
    - buildTagTree function
    - buildFlatTagMap function
    - indexFolders function
  affects:
    - src/VaultIndex.ts (Plan 02-02 imports all types and utils)
    - src/lib/tag-utils.test.ts (test suite, also extended in Plan 02-04)
tech_stack:
  added: []
  patterns:
    - Pure TypeScript interfaces with zero imports (zero-Obsidian testability pattern)
    - TDD (RED/GREEN) for pure logic modules
key_files:
  created:
    - src/lib/vault-index-types.ts
    - src/lib/tag-utils.ts
    - src/lib/tag-utils.test.ts
  modified: []
decisions:
  - "TagNode.children typed as Map<string, TagNode> (recursive type) — confirmed by D-04"
  - "Only terminal segment receives filePath in buildTagTree — ancestor nodes stay empty"
  - "FolderRecord uses '' as both path and name for root-level files"
metrics:
  duration: "~6 minutes"
  completed: "2026-04-29"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 2 Plan 01: Types and Tag Utils Summary

Pure TypeScript interfaces and tag/folder utility functions with zero Obsidian imports — the Vitest-testable foundation for VaultIndex.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create vault-index-types.ts | 69302a2 | src/lib/vault-index-types.ts |
| 2 (RED) | Failing tests for tag-utils | c5afe8a | src/lib/tag-utils.test.ts |
| 2 (GREEN) | Implement tag-utils | 5488dc1 | src/lib/tag-utils.ts |

## What Was Built

**`src/lib/vault-index-types.ts`** — 4 exported TypeScript interfaces with zero imports:
- `HeadingRecord`: `{ text: string; level: number }` — flat heading per D-01
- `FileRecord`: `{ path, tags, headings, folderPath }` — normalized per D-02/D-03
- `FolderRecord`: `{ path, name, files }` — O(1) folder lookup per D-03
- `TagNode`: `{ files: string[]; children: Map<string, TagNode> }` — recursive per D-04

**`src/lib/tag-utils.ts`** — 5 exported pure functions (69 lines, zero Obsidian imports):
- `normalizeTag`: strips `#` prefix, lowercases
- `normalizeTags`: maps normalize then deduplicates preserving first-occurrence order
- `buildTagTree`: builds nested TagNode tree split on `/`; filePath only at terminal node
- `buildFlatTagMap`: flat tag→files map for O(1) exact-tag lookups
- `indexFolders`: FolderRecord map keyed by folderPath; root files keyed by `''`

**`src/lib/tag-utils.test.ts`** — 16 Vitest tests (all passing), covering all edge cases from the plan's `<behavior>` spec.

## TDD Gate Compliance

- RED gate: `c5afe8a` — `test(02-01): add failing tests for tag-utils pure functions`
- GREEN gate: `5488dc1` — `feat(02-01): implement tag-utils pure functions — all 16 tests pass`
- All 16 tests pass; no REFACTOR phase needed (code was clean as written)

## Decisions Made

1. **Terminal-only file accumulation in buildTagTree** — `filePath` is pushed only to the final segment's node. Intermediate ancestors stay empty. This matches the plan spec ("filePath goes into the node for the LAST segment only, not every ancestor node").
2. **Root folder key is `''`** — `indexFolders(['foo.md'])` produces a FolderRecord at key `''` with `path: '', name: ''`. Consistent with the plan spec and D-03.
3. **First-occurrence dedup in normalizeTags** — Uses a `Set` to track seen tags while iterating, so `['#B', '#A', '#b']` → `['b', 'a']` (B first).

## Verification Results

```
grep -r "from 'obsidian'" vault-index-types.ts tag-utils.ts   → (none — PASS)
grep -r "console.log" vault-index-types.ts tag-utils.ts       → (none — PASS)
grep -c "^export" vault-index-types.ts                        → 4 (PASS)
grep -c "^export" tag-utils.ts                                → 5 (PASS)
npm test                                                       → 53 tests passed (PASS)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder values, no hardcoded returns, no TODO comments.

## Threat Flags

None — both files are pure in-memory functions with no I/O, no network, no secret handling. Threat model accepted all three STRIDE entries as `accept` disposition.

## Self-Check: PASSED

- [x] `src/lib/vault-index-types.ts` exists
- [x] `src/lib/tag-utils.ts` exists
- [x] `src/lib/tag-utils.test.ts` exists
- [x] Commit `69302a2` exists (Task 1: vault-index-types)
- [x] Commit `c5afe8a` exists (Task 2 RED: failing tests)
- [x] Commit `5488dc1` exists (Task 2 GREEN: implementation)
- [x] All 16 tag-utils tests pass
- [x] Zero Obsidian imports in both source files
- [x] Zero console calls in both source files
