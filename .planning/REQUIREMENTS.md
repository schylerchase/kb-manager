# Requirements: KB Manager — Obsidian Knowledge Base Plugin

**Defined:** 2026-04-28
**Core Value:** The vault structure stays accurate without manual work — MOC files, TOC sections, and tag relationships update themselves in the background.

## v1 Requirements

### Foundation (Plugin Scaffold + Safety)

- [x] **FOUND-01**: Plugin loads in Obsidian without errors and can be enabled/disabled
- [x] **FOUND-02**: Plugin settings persist across Obsidian restarts
- [x] **FOUND-03**: Plugin respects configured folder/file exclusion patterns (e.g., archive/, templates/)
- [x] **FOUND-04**: Plugin never overwrites user content outside of delimiter-bounded sections
- [x] **FOUND-05**: Inline sections identified by `<!-- kb-manager:TYPE:start -->` / `<!-- kb-manager:TYPE:end -->` delimiters; plugin skips files with malformed or absent delimiters

### Indexing (VaultIndex)

- [x] **INDX-01**: Plugin builds an in-memory index of all vault files, folders, tags, and headings on startup
- [x] **INDX-02**: Index merges body tags and frontmatter tags correctly via `getAllTags()`
- [x] **INDX-03**: Index builds nested tag hierarchy from `#parent/child` tag patterns
- [x] **INDX-04**: Index maintains a dirty-file set — files modified since last full rebuild

### Update Scheduling

- [x] **SCHED-01**: Plugin runs background periodic updates at a configurable interval (default: 5 minutes)
- [x] **SCHED-02**: Plugin does not run concurrent rebuilds — a mutex prevents overlap between background tick and manual trigger
- [x] **SCHED-03**: Plugin registers vault events inside `onLayoutReady` to avoid startup event burst
- [x] **SCHED-04**: User can trigger an immediate full rebuild via ribbon command

### MOC Generation

- [x] **MOC-01**: Plugin auto-generates a dedicated `MOC.md` file per folder, containing wikilinks to all notes in that folder
- [x] **MOC-02**: Plugin groups MOC entries by tag — notes with matching tags are listed under a heading for that tag
- [x] **MOC-03**: Dedicated MOC files are tagged `kb-managed: true` in frontmatter; plugin safely overwrites them on rebuild
- [x] **MOC-04**: Plugin injects an inline MOC section into an existing user note when the user manually inserts delimiter markers
- [x] **MOC-05**: Plugin injects an inline MOC section into an existing user note when the user runs an "Insert MOC here" command at cursor position
- [x] **MOC-06**: Plugin injects inline MOC sections automatically into all notes in a folder when per-folder config is set to "inline"
- [x] **MOC-07**: Per-folder MOC format is configurable: "dedicated file" (default) or "inline injection"
- [x] **MOC-08**: MOC entries use standard wikilinks `[[note-name]]`, not Dataview queries

### TOC Generation

- [x] **TOC-01**: Plugin injects a per-note TOC section (from headings) into notes that have delimiter markers
- [x] **TOC-02**: Plugin injects a per-note TOC section when user runs "Insert TOC here" command at cursor position
- [x] **TOC-03**: TOC links use standard Obsidian heading anchor format `[[note#heading]]`
- [x] **TOC-04**: Plugin generates a section-level TOC: an index note listing all notes within a topic area (folder), with their first-level headings
- [x] **TOC-05**: Plugin skips TOC generation for notes with no headings rather than inserting an empty section

### Tag Management

- [x] **TAG-01**: Plugin builds a visual tag hierarchy from `#parent/child` nesting in the in-memory index
- [x] **TAG-02**: User can view all notes that share a specific tag cluster (cross-reference: notes sharing 2+ of the same tags)
- [x] **TAG-03**: Tag hierarchy feeds into MOC section groupings (MOC-02 depends on this)

### Sidebar

- [x] **SIDE-01**: Plugin provides a sidebar panel (Obsidian ItemView) showing the live MOC tree
- [x] **SIDE-02**: Sidebar panel shows the live tag hierarchy alongside the MOC tree
- [x] **SIDE-03**: Sidebar panel refreshes automatically after each index rebuild
- [x] **SIDE-04**: Sidebar panel survives Obsidian restart (view re-registered on startup)

### Settings

- [x] **SET-01**: User can configure background update interval (1–60 minutes)
- [x] **SET-02**: User can configure folder/file exclusion patterns (gitignore-style)
- [x] **SET-03**: User can configure per-folder MOC format (dedicated file vs inline injection)
- [x] **SET-04**: User can enable/disable auto-injection globally

## v2 Requirements

### Multi-vault

- **MV-01**: Plugin supports multiple vaults (team/shared vault)

### AI-Assisted

- **AI-01**: Plugin can suggest MOC section headings based on note content
- **AI-02**: Plugin can suggest tag hierarchy structure from existing tags

### Export

- **EXP-01**: User can export MOC structure to a standalone index document
- **EXP-02**: User can export tag hierarchy to a visual graph

## Out of Scope

| Feature | Reason |
|---------|--------|
| Team / shared vault support | Personal-use focus for v1; auth/sync complexity out of scope |
| AI-generated content | Plugin manages structure only, not content creation |
| Note creation / editing | Plugin reads and annotates existing notes; never creates content notes |
| Cloud sync / remote storage | Local vault only; no network calls |
| Cross-vault operations | Single vault scope |
| Graph view manipulation | Owned by Obsidian core and dedicated plugins |
| Dataview-syntax output | Breaks if Dataview removed; use real wikilinks instead |
| Frontmatter mutation as primary store | Risk of merge conflicts and surprises |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 — Plugin Scaffold + Settings + File Safety | Implemented |
| FOUND-02 | Phase 1 — Plugin Scaffold + Settings + File Safety | Implemented |
| FOUND-03 | Phase 1 — Plugin Scaffold + Settings + File Safety | Implemented |
| FOUND-04 | Phase 1 — Plugin Scaffold + Settings + File Safety | Implemented |
| FOUND-05 | Phase 1 — Plugin Scaffold + Settings + File Safety | Implemented |
| SET-01 | Phase 1 — Plugin Scaffold + Settings + File Safety | Implemented |
| SET-02 | Phase 1 — Plugin Scaffold + Settings + File Safety | Implemented |
| SET-03 | Phase 1 — Plugin Scaffold + Settings + File Safety | Implemented |
| SET-04 | Phase 1 — Plugin Scaffold + Settings + File Safety | Implemented |
| INDX-01 | Phase 2 — VaultIndex Core Data Layer | Implemented |
| INDX-02 | Phase 2 — VaultIndex Core Data Layer | Implemented |
| INDX-03 | Phase 2 — VaultIndex Core Data Layer | Implemented |
| INDX-04 | Phase 2 — VaultIndex Core Data Layer | Implemented |
| SCHED-01 | Phase 3 — Background Update Scheduler | Implemented |
| SCHED-02 | Phase 3 — Background Update Scheduler | Implemented |
| SCHED-03 | Phase 3 — Background Update Scheduler | Implemented |
| SCHED-04 | Phase 3 — Background Update Scheduler | Implemented |
| MOC-01 | Phase 4 — MOC Generator | Implemented |
| MOC-02 | Phase 4 — MOC Generator | Implemented |
| MOC-03 | Phase 4 — MOC Generator | Implemented |
| MOC-04 | Phase 4 — MOC Generator | Implemented |
| MOC-05 | Phase 4 — MOC Generator | Implemented |
| MOC-06 | Phase 4 — MOC Generator | Implemented |
| MOC-07 | Phase 4 — MOC Generator | Implemented |
| MOC-08 | Phase 4 — MOC Generator | Implemented |
| TOC-01 | Phase 5 — TOC Generator | Implemented |
| TOC-02 | Phase 5 — TOC Generator | Implemented |
| TOC-03 | Phase 5 — TOC Generator | Implemented |
| TOC-04 | Phase 5 — TOC Generator | Implemented |
| TOC-05 | Phase 5 — TOC Generator | Implemented |
| TAG-01 | Phase 6 — TagManager + Tag Hierarchy | Implemented |
| TAG-02 | Phase 6 — TagManager + Tag Hierarchy | Implemented |
| TAG-03 | Phase 6 — TagManager + Tag Hierarchy | Implemented |
| SIDE-01 | Phase 7 — Sidebar View | Implemented |
| SIDE-02 | Phase 7 — Sidebar View | Implemented |
| SIDE-03 | Phase 7 — Sidebar View | Implemented |
| SIDE-04 | Phase 7 — Sidebar View | Implemented |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0

---
*Requirements defined: 2026-04-28*
*Last updated: 2026-04-29 after v1 implementation*
