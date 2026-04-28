# Requirements: KB Manager — Obsidian Knowledge Base Plugin

**Defined:** 2026-04-28
**Core Value:** The vault structure stays accurate without manual work — MOC files, TOC sections, and tag relationships update themselves in the background.

## v1 Requirements

### Foundation (Plugin Scaffold + Safety)

- [ ] **FOUND-01**: Plugin loads in Obsidian without errors and can be enabled/disabled
- [ ] **FOUND-02**: Plugin settings persist across Obsidian restarts
- [ ] **FOUND-03**: Plugin respects configured folder/file exclusion patterns (e.g., archive/, templates/)
- [ ] **FOUND-04**: Plugin never overwrites user content outside of delimiter-bounded sections
- [ ] **FOUND-05**: Inline sections identified by `<!-- kb-manager:TYPE:start -->` / `<!-- kb-manager:TYPE:end -->` delimiters; plugin skips files with malformed or absent delimiters

### Indexing (VaultIndex)

- [ ] **INDX-01**: Plugin builds an in-memory index of all vault files, folders, tags, and headings on startup
- [ ] **INDX-02**: Index merges body tags and frontmatter tags correctly via `getAllTags()`
- [ ] **INDX-03**: Index builds nested tag hierarchy from `#parent/child` tag patterns
- [ ] **INDX-04**: Index maintains a dirty-file set — files modified since last full rebuild

### Update Scheduling

- [ ] **SCHED-01**: Plugin runs background periodic updates at a configurable interval (default: 5 minutes)
- [ ] **SCHED-02**: Plugin does not run concurrent rebuilds — a mutex prevents overlap between background tick and manual trigger
- [ ] **SCHED-03**: Plugin registers vault events inside `onLayoutReady` to avoid startup event burst
- [ ] **SCHED-04**: User can trigger an immediate full rebuild via ribbon command

### MOC Generation

- [ ] **MOC-01**: Plugin auto-generates a dedicated `MOC.md` file per folder, containing wikilinks to all notes in that folder
- [ ] **MOC-02**: Plugin groups MOC entries by tag — notes with matching tags are listed under a heading for that tag
- [ ] **MOC-03**: Dedicated MOC files are tagged `kb-managed: true` in frontmatter; plugin safely overwrites them on rebuild
- [ ] **MOC-04**: Plugin injects an inline MOC section into an existing user note when the user manually inserts delimiter markers
- [ ] **MOC-05**: Plugin injects an inline MOC section into an existing user note when the user runs an "Insert MOC here" command at cursor position
- [ ] **MOC-06**: Plugin injects inline MOC sections automatically into all notes in a folder when per-folder config is set to "inline"
- [ ] **MOC-07**: Per-folder MOC format is configurable: "dedicated file" (default) or "inline injection"
- [ ] **MOC-08**: MOC entries use standard wikilinks `[[note-name]]`, not Dataview queries

### TOC Generation

- [ ] **TOC-01**: Plugin injects a per-note TOC section (from headings) into notes that have delimiter markers
- [ ] **TOC-02**: Plugin injects a per-note TOC section when user runs "Insert TOC here" command at cursor position
- [ ] **TOC-03**: TOC links use standard Obsidian heading anchor format `[[note#heading]]`
- [ ] **TOC-04**: Plugin generates a section-level TOC: an index note listing all notes within a topic area (folder), with their first-level headings
- [ ] **TOC-05**: Plugin skips TOC generation for notes with no headings rather than inserting an empty section

### Tag Management

- [ ] **TAG-01**: Plugin builds a visual tag hierarchy from `#parent/child` nesting in the in-memory index
- [ ] **TAG-02**: User can view all notes that share a specific tag cluster (cross-reference: notes sharing 2+ of the same tags)
- [ ] **TAG-03**: Tag hierarchy feeds into MOC section groupings (MOC-02 depends on this)

### Sidebar

- [ ] **SIDE-01**: Plugin provides a sidebar panel (Obsidian ItemView) showing the live MOC tree
- [ ] **SIDE-02**: Sidebar panel shows the live tag hierarchy alongside the MOC tree
- [ ] **SIDE-03**: Sidebar panel refreshes automatically after each index rebuild
- [ ] **SIDE-04**: Sidebar panel survives Obsidian restart (view re-registered on startup)

### Settings

- [ ] **SET-01**: User can configure background update interval (1–60 minutes)
- [ ] **SET-02**: User can configure folder/file exclusion patterns (gitignore-style)
- [ ] **SET-03**: User can configure per-folder MOC format (dedicated file vs inline injection)
- [ ] **SET-04**: User can enable/disable auto-injection globally

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
| FOUND-01 | Phase 1 — Plugin Scaffold + Settings + File Safety | Pending |
| FOUND-02 | Phase 1 — Plugin Scaffold + Settings + File Safety | Pending |
| FOUND-03 | Phase 1 — Plugin Scaffold + Settings + File Safety | Pending |
| FOUND-04 | Phase 1 — Plugin Scaffold + Settings + File Safety | Pending |
| FOUND-05 | Phase 1 — Plugin Scaffold + Settings + File Safety | Pending |
| SET-01 | Phase 1 — Plugin Scaffold + Settings + File Safety | Pending |
| SET-02 | Phase 1 — Plugin Scaffold + Settings + File Safety | Pending |
| SET-03 | Phase 1 — Plugin Scaffold + Settings + File Safety | Pending |
| SET-04 | Phase 1 — Plugin Scaffold + Settings + File Safety | Pending |
| INDX-01 | Phase 2 — VaultIndex Core Data Layer | Pending |
| INDX-02 | Phase 2 — VaultIndex Core Data Layer | Pending |
| INDX-03 | Phase 2 — VaultIndex Core Data Layer | Pending |
| INDX-04 | Phase 2 — VaultIndex Core Data Layer | Pending |
| SCHED-01 | Phase 3 — Background Update Scheduler | Pending |
| SCHED-02 | Phase 3 — Background Update Scheduler | Pending |
| SCHED-03 | Phase 3 — Background Update Scheduler | Pending |
| SCHED-04 | Phase 3 — Background Update Scheduler | Pending |
| MOC-01 | Phase 4 — MOC Generator | Pending |
| MOC-02 | Phase 4 — MOC Generator | Pending |
| MOC-03 | Phase 4 — MOC Generator | Pending |
| MOC-04 | Phase 4 — MOC Generator | Pending |
| MOC-05 | Phase 4 — MOC Generator | Pending |
| MOC-06 | Phase 4 — MOC Generator | Pending |
| MOC-07 | Phase 4 — MOC Generator | Pending |
| MOC-08 | Phase 4 — MOC Generator | Pending |
| TOC-01 | Phase 5 — TOC Generator | Pending |
| TOC-02 | Phase 5 — TOC Generator | Pending |
| TOC-03 | Phase 5 — TOC Generator | Pending |
| TOC-04 | Phase 5 — TOC Generator | Pending |
| TOC-05 | Phase 5 — TOC Generator | Pending |
| TAG-01 | Phase 6 — TagManager + Tag Hierarchy | Pending |
| TAG-02 | Phase 6 — TagManager + Tag Hierarchy | Pending |
| TAG-03 | Phase 6 — TagManager + Tag Hierarchy | Pending |
| SIDE-01 | Phase 7 — Sidebar View | Pending |
| SIDE-02 | Phase 7 — Sidebar View | Pending |
| SIDE-03 | Phase 7 — Sidebar View | Pending |
| SIDE-04 | Phase 7 — Sidebar View | Pending |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0

---
*Requirements defined: 2026-04-28*
*Last updated: 2026-04-28 after roadmap creation*
