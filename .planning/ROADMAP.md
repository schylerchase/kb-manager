# Roadmap: KB Manager

**Project:** KB Manager — Obsidian Knowledge Base Plugin
**Core Value:** The vault structure stays accurate without manual work — MOC files, TOC sections, and tag relationships update themselves in the background.
**Granularity:** Standard (7 phases)
**Coverage:** 37/37 v1 requirements mapped

---

## Overview

| # | Phase | Goal | REQ-IDs | Success Criteria |
|---|-------|------|---------|-----------------|
| 1 | Plugin Scaffold + Settings + File Safety | Plugin loads, persists settings, and enforces write safety contracts before any file-writing feature exists | FOUND-01..05, SET-01..04 | 4 criteria |
| 2 | VaultIndex — Core Data Layer | An in-memory model of all vault files, tags, headings, and folder structure is built and queryable | INDX-01..04 | 3 criteria |
| 3 | Background Update Scheduler | Periodic background rebuilds run safely without racing manual triggers | SCHED-01..04 | 3 criteria |
| 4 | MOC Generator | The plugin generates and maintains MOC files and inline MOC sections from vault structure and tags | MOC-01..08 | 5 criteria |
| 5 | TOC Generator | Per-note and section-level TOC sections are injected and maintained using the same write infrastructure as MOC | TOC-01..05 | 4 criteria |
| 6 | TagManager + Tag Hierarchy | A queryable tag hierarchy with cross-reference data is built in memory from vault tags | TAG-01..03 | 3 criteria |
| 7 | Sidebar View | A persistent sidebar panel shows the live MOC tree and tag hierarchy, surviving restarts | SIDE-01..04 | 4 criteria |

---

## Phases

- [ ] **Phase 1: Plugin Scaffold + Settings + File Safety** — Plugin loads, settings persist, write-safety contracts enforced
- [ ] **Phase 2: VaultIndex — Core Data Layer** — In-memory vault index built from MetadataCache; all generators unblocked
- [ ] **Phase 3: Background Update Scheduler** — Periodic background rebuilds with mutex; manual rebuild command works
- [ ] **Phase 4: MOC Generator** — Dedicated MOC files and inline MOC sections generated and maintained
- [ ] **Phase 5: TOC Generator** — Per-note TOC and section-level TOC generated and maintained
- [ ] **Phase 6: TagManager + Tag Hierarchy** — Tag hierarchy built in memory; cross-reference queries work
- [ ] **Phase 7: Sidebar View** — Persistent sidebar panel shows live MOC tree and tag hierarchy

---

## Phase Details

### Phase 1: Plugin Scaffold + Settings + File Safety
**Goal:** The plugin loads cleanly in Obsidian, settings persist across restarts, and write-safety contracts (delimiter pattern + exclusion rules) are enforced before any file-writing feature ships.
**Depends on:** Nothing (first phase)
**Requirements:** FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, SET-01, SET-02, SET-03, SET-04
**Success Criteria** (what must be TRUE):
  1. User can enable and disable the plugin without Obsidian errors or console noise
  2. User can open the settings tab and configure update interval, folder exclusions, per-folder MOC format, and global auto-injection toggle — all values persist after Obsidian restart
  3. Plugin never writes outside delimiter-bounded sections in user notes; files matching exclusion patterns are silently skipped on all code paths
  4. A file with absent or malformed `<!-- kb-manager:TYPE:start -->` / `<!-- kb-manager:TYPE:end -->` delimiters is skipped entirely — no partial writes, no guessing
**Plans:** TBD
**UI hint:** yes

### Phase 2: VaultIndex — Core Data Layer
**Goal:** The plugin builds a complete in-memory index of vault files, folders, tags, and headings on startup — and tracks which files are dirty — so all downstream generators have a single reliable data source.
**Depends on:** Phase 1
**Requirements:** INDX-01, INDX-02, INDX-03, INDX-04
**Success Criteria** (what must be TRUE):
  1. After vault open, the index contains every file, folder, tag (frontmatter + body merged), and heading in the vault — queryable without hitting the file system
  2. Tags of the form `#parent/child` are represented as a nested hierarchy in the index, not a flat list
  3. Files modified since last full rebuild are tracked in a dirty-file set; a fresh rebuild starts from only dirty files, not the entire vault
**Plans:** TBD

### Phase 3: Background Update Scheduler
**Goal:** The plugin runs periodic background rebuilds at a user-configured interval without ever running two rebuilds concurrently, and exposes a manual rebuild command that respects the same mutex.
**Depends on:** Phase 2
**Requirements:** SCHED-01, SCHED-02, SCHED-03, SCHED-04
**Success Criteria** (what must be TRUE):
  1. Background rebuilds run on the configured interval (default 5 minutes) without blocking the Obsidian UI — the editor remains responsive during a rebuild
  2. Triggering a manual rebuild via ribbon command while a background rebuild is in progress does not start a second concurrent rebuild; the in-progress rebuild completes first
  3. Vault events (file change, create, delete) are registered only after `onLayoutReady` fires — no event burst on startup
**Plans:** TBD

### Phase 4: MOC Generator
**Goal:** The plugin generates a dedicated MOC.md file per folder and can inject inline MOC sections into user notes, with entries grouped by tag, using only standard wikilinks.
**Depends on:** Phase 3
**Requirements:** MOC-01, MOC-02, MOC-03, MOC-04, MOC-05, MOC-06, MOC-07, MOC-08
**Success Criteria** (what must be TRUE):
  1. After a rebuild, each non-excluded folder contains a `MOC.md` file with wikilinks to all notes in that folder, grouped under tag headings where tags apply
  2. `MOC.md` files carry `kb-managed: true` in frontmatter; the plugin safely overwrites their full content on each rebuild without touching user notes
  3. A user note with `<!-- kb-manager:moc:start -->` / `<!-- kb-manager:moc:end -->` delimiters has the MOC section replaced between those markers on each rebuild; content outside the delimiters is untouched
  4. User can run an "Insert MOC here" command at cursor position in any note to insert delimiter markers and immediately populate an inline MOC section
  5. Per-folder MOC format (dedicated file vs inline injection) is respected: folders set to "inline" inject into all notes in that folder; folders set to "dedicated" (default) use MOC.md
**Plans:** TBD

### Phase 5: TOC Generator
**Goal:** The plugin injects and maintains a per-note TOC from headings and a section-level index note listing all notes and their headings within a folder, using the same delimiter-based write pattern as MOC.
**Depends on:** Phase 4
**Requirements:** TOC-01, TOC-02, TOC-03, TOC-04, TOC-05
**Success Criteria** (what must be TRUE):
  1. A note with `<!-- kb-manager:toc:start -->` / `<!-- kb-manager:toc:end -->` delimiters has its TOC section regenerated from current headings on each rebuild; content outside delimiters is untouched
  2. User can run an "Insert TOC here" command at cursor position to insert delimiter markers and immediately populate a TOC section
  3. TOC links use Obsidian heading anchor format `[[note#heading]]` and are navigable from within Obsidian
  4. Notes with no headings are skipped entirely — no empty TOC section is inserted or left behind; notes in excluded folders are also skipped
**Plans:** TBD

### Phase 6: TagManager + Tag Hierarchy
**Goal:** The plugin builds a navigable tag hierarchy in memory from the vault index, supports cross-reference queries for notes sharing a tag cluster, and feeds this data into MOC section groupings.
**Depends on:** Phase 5
**Requirements:** TAG-01, TAG-02, TAG-03
**Success Criteria** (what must be TRUE):
  1. The tag hierarchy reflects all `#parent/child` relationships in the vault with correct nesting — adding or removing a tag in a note is reflected after the next rebuild
  2. User can query a specific tag (or tag cluster) and retrieve all notes that carry 2 or more of the same tags in that cluster
  3. MOC sections that group notes by tag (MOC-02) draw their groupings from the TagManager hierarchy — the two data structures are consistent
**Plans:** TBD

### Phase 7: Sidebar View
**Goal:** A persistent Obsidian ItemView sidebar panel shows the live MOC tree and tag hierarchy side by side, refreshes automatically after each rebuild, and re-registers itself correctly after Obsidian restart.
**Depends on:** Phase 6
**Requirements:** SIDE-01, SIDE-02, SIDE-03, SIDE-04
**Success Criteria** (what must be TRUE):
  1. User can open the sidebar panel from a ribbon icon or command and see the current MOC tree (folder → MOC entries) rendered as an expandable list
  2. The sidebar panel also shows the live tag hierarchy alongside the MOC tree, without requiring a separate view or command
  3. After a background rebuild completes, the sidebar panel updates its display automatically — no manual refresh needed
  4. After Obsidian is closed and reopened, the sidebar panel reappears in the same position without user intervention
**Plans:** TBD
**UI hint:** yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Scaffold + Settings + File Safety | 0/? | Not started | - |
| 2. VaultIndex — Core Data Layer | 0/? | Not started | - |
| 3. Background Update Scheduler | 0/? | Not started | - |
| 4. MOC Generator | 0/? | Not started | - |
| 5. TOC Generator | 0/? | Not started | - |
| 6. TagManager + Tag Hierarchy | 0/? | Not started | - |
| 7. Sidebar View | 0/? | Not started | - |

---

## Coverage Verification

| Requirement | Phase |
|-------------|-------|
| FOUND-01 | Phase 1 |
| FOUND-02 | Phase 1 |
| FOUND-03 | Phase 1 |
| FOUND-04 | Phase 1 |
| FOUND-05 | Phase 1 |
| SET-01 | Phase 1 |
| SET-02 | Phase 1 |
| SET-03 | Phase 1 |
| SET-04 | Phase 1 |
| INDX-01 | Phase 2 |
| INDX-02 | Phase 2 |
| INDX-03 | Phase 2 |
| INDX-04 | Phase 2 |
| SCHED-01 | Phase 3 |
| SCHED-02 | Phase 3 |
| SCHED-03 | Phase 3 |
| SCHED-04 | Phase 3 |
| MOC-01 | Phase 4 |
| MOC-02 | Phase 4 |
| MOC-03 | Phase 4 |
| MOC-04 | Phase 4 |
| MOC-05 | Phase 4 |
| MOC-06 | Phase 4 |
| MOC-07 | Phase 4 |
| MOC-08 | Phase 4 |
| TOC-01 | Phase 5 |
| TOC-02 | Phase 5 |
| TOC-03 | Phase 5 |
| TOC-04 | Phase 5 |
| TOC-05 | Phase 5 |
| TAG-01 | Phase 6 |
| TAG-02 | Phase 6 |
| TAG-03 | Phase 6 |
| SIDE-01 | Phase 7 |
| SIDE-02 | Phase 7 |
| SIDE-03 | Phase 7 |
| SIDE-04 | Phase 7 |

**Mapped:** 37/37 v1 requirements

---
*Roadmap created: 2026-04-28*
*Last updated: 2026-04-28 after initial creation*
