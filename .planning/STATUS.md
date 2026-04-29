# Project Status: KB Manager

**Current Phase:** v1 implementation complete
**Overall Progress:** 7/7 phases complete

---

## Phases

| # | Phase | Status | Started | Completed |
|---|-------|--------|---------|-----------|
| 1 | Plugin Scaffold + Settings + File Safety | Complete | 2026-04-28 | 2026-04-28 |
| 2 | VaultIndex — Core Data Layer | Complete | 2026-04-29 | 2026-04-29 |
| 3 | Background Update Scheduler | Complete | 2026-04-29 | 2026-04-29 |
| 4 | MOC Generator | Complete | 2026-04-29 | 2026-04-29 |
| 5 | TOC Generator | Complete | 2026-04-29 | 2026-04-29 |
| 6 | TagManager + Tag Hierarchy | Complete | 2026-04-29 | 2026-04-29 |
| 7 | Sidebar View | Complete | 2026-04-29 | 2026-04-29 |

---

## Current Phase Detail

**v1 Implementation — COMPLETE (24/24 plans complete)**

**Goal:** Maintain MOC files, TOC sections, tag hierarchy queries, and a live sidebar from the vault index.

**Requirements in scope:** 37/37 v1 requirements

**Plans:**
- [x] Phase 1 — Plugin scaffold, settings, and file safety (COMPLETE 2026-04-28)
- [x] Phase 2 — VaultIndex core data layer (COMPLETE 2026-04-29)
- [x] Phase 3 — Background update scheduler (COMPLETE 2026-04-29)
- [x] Phase 4 — MOC generator (COMPLETE 2026-04-29)
- [x] Phase 5 — TOC generator (COMPLETE 2026-04-29)
- [x] Phase 6 — TagManager + tag hierarchy (COMPLETE 2026-04-29)
- [x] Phase 7 — Sidebar view (COMPLETE 2026-04-29)

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
- `Promise<void> | null` rebuild mutex at scheduler level — prevents concurrent background + manual rebuild
- TagNode.children typed as `Map<string, TagNode>` — filePath only at terminal segment, ancestors empty
- FolderRecord root key is `''` — root-level files keyed by empty string in indexFolders
- Manual rebuild surface includes both ribbon icon and command palette command
- Status bar shows `KB: idle` / `KB: rebuilding…` around all rebuilds
- MOC generator writes dedicated `MOC.md` files and inline MOC sections with delimiter safety
- TOC generator writes per-note TOC sections and per-folder `INDEX.md` files
- TagManager exposes exact-tag cluster queries and tag hierarchy pass-throughs
- Sidebar view renders the MOC tree and tag hierarchy, re-registers on startup, and refreshes after rebuilds

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

### Phase 3 Decisions Locked (2026-04-29)
- Scheduled ticks call `VaultIndex.rebuildDirty()` only; manual rebuild calls full `VaultIndex.rebuild()`
- Background ticks are dropped while any rebuild is running; manual rebuild queues behind the active lock
- Scheduler starts after the initial full rebuild inside `onLayoutReady`
- Interval setting changes restart the timer immediately; the next tick waits for the newly configured interval
- Background rebuild errors use `console.error`; only manual rebuilds show Obsidian notices

### Phase 4-7 Decisions Locked (2026-04-29)
- Dedicated generated files use `kb-managed: true` frontmatter and are skipped unless managed
- Inline MOC auto-injection is gated by folder format plus the global `autoInject` setting
- TOC inline sections are opt-in by delimiter or insert command; no TOC auto-append
- `VaultIndex.onRebuildComplete` now awaits generator work, so rebuild locking covers generated writes
- Sidebar uses Obsidian-native ItemView registration and a refresh callback set on the plugin

### Open Questions (from research)
1. **minAppVersion** — verify `frontmatterLinks` at 1.4.0 against official changelog before setting manifest floor
2. **Inline MOC opt-in UX** — manual delimiter insert vs "inject here" command vs per-folder auto-inject on first run
3. ~~**Dirty-file set persistence**~~ — RESOLVED: ephemeral (full rebuild on startup)
4. **Section-level TOC scope** — TOC-04 is mapped to Phase 5 as v1; revisit if scope creep emerges
5. **Conflict handling for generated sections** — hash-check vs delimiter-only as conflict signal; decide before Phase 4

---

## Session Continuity

**Last session:** 2026-04-29 — v1 implementation complete; production build and all 98 Vitest tests passing
**Next action:** Manual UAT in an Obsidian dev vault, then ship/review
**Resume file:** `.planning/STATUS.md`

---
*Last updated: 2026-04-29*
