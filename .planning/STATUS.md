# Project Status: KB Manager

**Current Phase:** Phase 2 — VaultIndex — Core Data Layer (Phase 1 complete)
**Overall Progress:** 1/7 phases complete

---

## Phases

| # | Phase | Status | Started | Completed |
|---|-------|--------|---------|-----------|
| 1 | Plugin Scaffold + Settings + File Safety | Complete | 2026-04-28 | 2026-04-28 |
| 2 | VaultIndex — Core Data Layer | In progress | 2026-04-29 | - |
| 3 | Background Update Scheduler | Not started | - | - |
| 4 | MOC Generator | Not started | - | - |
| 5 | TOC Generator | Not started | - | - |
| 6 | TagManager + Tag Hierarchy | Not started | - | - |
| 7 | Sidebar View | Not started | - | - |

---

## Current Phase Detail

**Phase 2: VaultIndex — Core Data Layer — IN PROGRESS (1/4 plans complete)**

**Goal:** Build a complete in-memory index of all vault files, folders, tags, and headings on startup — and track which files are dirty — so all downstream generators have a single reliable data source.

**Requirements in scope:** INDX-01, INDX-02, INDX-03, INDX-04

**Plans:**
- [x] 02-01-PLAN-types-and-tag-utils.md — Pure-logic types + tag/folder utilities (COMPLETE 2026-04-29)
- [ ] 02-02-PLAN-vault-index-class.md — VaultIndex class (Wave 2)
- [ ] 02-03-PLAN-main-integration.md — main.ts wiring (Wave 3)
- [ ] 02-04-PLAN-tests.md — Vitest tests for tag-utils (Wave 2, parallel with 02-02)

**Blockers:** None

---

## Accumulated Context

### Decisions Logged
- Background periodic updates (not event-driven) — avoids UI lag on large vaults
- Both MOC formats supported (dedicated files + inline injection) — configurable per-folder
- VaultIndex as single source of truth — all generators consume it; nothing reads MetadataCache directly
- `vault.process()` as the only write primitive — atomic, no race condition window
- Delimiter contract: `<!-- kb-manager:TYPE:start -->` / `<!-- kb-manager:TYPE:end -->` — skip if absent or malformed, never guess
- Heavy work deferred to `onLayoutReady` — vault events registered inside it, not in `onload()`
- `isRefreshing` boolean mutex at scheduler level — prevents concurrent background + manual rebuild
- TagNode.children typed as `Map<string, TagNode>` — filePath only at terminal segment, ancestors empty
- FolderRecord root key is `''` — root-level files keyed by empty string in indexFolders

### Key Constraints
- TypeScript + Obsidian Plugin API only — no external dependencies except Obsidian internals
- `minAppVersion` floor TBD — verify `frontmatterLinks` availability at 1.4.0 before shipping
- `normalizePath()` required for all user-defined paths
- `window.setInterval` not bare `setInterval`
- `createEl()` / `el.textContent` instead of `innerHTML`
- No `console.log()` in production builds

### Phase 2 Decisions Locked (2026-04-29)
- FileRecord: flat `{text, level}` headings array; normalized (no `#`, lowercase) tag array; separate FolderRecord map
- Tag hierarchy: `TagNode` tree (`Map<string, TagNode>` where TagNode has `{files, children}`) + parallel flat tag→files map
- Dirty set: ephemeral (full rebuild on startup); runtime events: modify + create + rename mark dirty, delete removes immediately
- Incremental rebuild: re-index only dirty files, keep clean FileRecords in place, clear dirty set after
- VaultIndex: class with typed query methods (private maps); `onRebuildComplete` callback; lives on `this.index`
- Phase 6 TagManager wraps VaultIndex raw tag data — cross-reference logic lives in Phase 6, not Phase 2

### Open Questions (from research)
1. **minAppVersion** — verify `frontmatterLinks` at 1.4.0 against official changelog before setting manifest floor
2. **Inline MOC opt-in UX** — manual delimiter insert vs "inject here" command vs per-folder auto-inject on first run
3. ~~**Dirty-file set persistence**~~ — RESOLVED: ephemeral (full rebuild on startup)
4. **Section-level TOC scope** — TOC-04 is mapped to Phase 5 as v1; revisit if scope creep emerges
5. **Conflict handling for generated sections** — hash-check vs delimiter-only as conflict signal; decide before Phase 4

---

## Session Continuity

**Last session:** 2026-04-29 — Plan 02-01 complete; vault-index-types.ts and tag-utils.ts created with 16 passing Vitest tests
**Next action:** Execute Plan 02-02 (VaultIndex class) and Plan 02-04 (tag-utils tests) — both Wave 2
**Resume file:** `.planning/phases/02-vaultindex-core-data-layer/`

---
*Last updated: 2026-04-29*
