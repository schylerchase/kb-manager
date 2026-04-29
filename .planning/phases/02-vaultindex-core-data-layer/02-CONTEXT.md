# Phase 2: VaultIndex — Core Data Layer - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a complete in-memory index of all vault files, folders, tags, and headings on startup — and track which files are dirty at runtime — so all downstream generators (MOC, TOC, TagManager, Sidebar) have a single reliable data source without hitting the file system.

Requirements in scope: INDX-01, INDX-02, INDX-03, INDX-04

</domain>

<decisions>
## Implementation Decisions

### FileRecord Shape (INDX-01, INDX-02)
- **D-01:** Headings are stored as a **flat array of `{text: string, level: number}`** per file. No nested tree — TOC generation iterates sequentially. HeadingCache from MetadataCache already provides this shape.
- **D-02:** Tags stored as a **normalized flat array of strings** — `#` prefix stripped, lowercased. `getAllTags()` returns with `#` prefix; strip on index build so downstream code never handles casing inconsistencies.
- **D-03:** Folders get a **separate FolderRecord map** alongside the FileRecord map. `VaultIndex` holds `Map<path, FileRecord>` for files AND `Map<path, FolderRecord>` for folders. `getFilesInFolder()` is O(1), not a file-path scan.

### Tag Hierarchy (INDX-03)
- **D-04:** Tag hierarchy uses a **TagNode tree**: `Map<string, TagNode>` where `TagNode = { files: string[], children: Map<string, TagNode> }`. Root map contains top-level tags; children recurse for `#parent/child` nesting.
- **D-05:** VaultIndex also maintains a **parallel flat tag→files map** (`Map<string, string[]>`) alongside the tree. Tree is for hierarchy traversal; flat map is for O(1) exact-tag lookups. Small memory overhead, large query win for Phase 4 MOC groupings and Phase 6 cross-reference queries.
- **D-06:** VaultIndex exposes raw tag data only (`getTagTree()`, `getFilesWithTag(tag)`). Phase 6 TagManager adds cross-reference logic (notes sharing 2+ tags from a cluster). Clean data layer vs query layer separation.

### Dirty-File Tracking (INDX-04)
- **D-07:** Dirty set is **ephemeral** — cleared on startup, full rebuild on every vault open. No persistence across restarts. Correctness over startup optimization; MetadataCache rebuild is fast for typical vault sizes.
- **D-08:** At runtime, **modify + create + rename** vault events mark a file dirty. Delete removes the file from the index immediately (not mark-dirty). Events registered inside `onLayoutReady` per CLAUDE.md rules.
- **D-09:** "Rebuild from dirty files only" means **re-index only dirty files, keep clean FileRecords in place**, then clear the dirty set. Dirty files get a fresh `metadataCache.getFileCache()` call; clean files are untouched. Phase 3 scheduler calls this incremental path on tick; full rebuild on startup.

### VaultIndex API Surface
- **D-10:** VaultIndex is a **class with typed query methods**; internal maps are private. Downstream code programs to the interface, not raw data structures. Internals can change without breaking consumers. Minimum API:
  - `getFilesInFolder(folderPath: string): FileRecord[]`
  - `getFilesWithTag(tag: string): string[]` (normalized tag, no `#`)
  - `getHeadings(filePath: string): HeadingRecord[]`
  - `getAllFolders(): string[]`
  - `getTagTree(): Map<string, TagNode>`
  - `isDirty(filePath: string): boolean`
  - `rebuild(): Promise<void>` (full rebuild)
  - `rebuildDirty(): Promise<void>` (incremental)
- **D-11:** VaultIndex exposes an **`onRebuildComplete` callback** (or simple listener list). Phase 7 sidebar registers here to know when to re-render. Phase 3 scheduler calls `rebuild()` then the callback fires. No polling needed.
- **D-12:** VaultIndex lives on the **plugin instance** (`this.index`). Created in `onload()`, passed to downstream generators via constructor or direct plugin reference. Lifecycle tied to plugin load/unload.

### Claude's Discretion
- Exact `FolderRecord` fields (e.g., whether it holds `childFolders`, `fileCount`, or just acts as a key for `getFilesInFolder`)
- Whether `onRebuildComplete` is a single callback or a Set of listeners
- Internal method naming conventions (e.g., `_indexFile` vs `indexFile`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` §Indexing — INDX-01..04 full requirement text
- `.planning/ROADMAP.md` §Phase 2 — Success criteria (3 criteria that must be TRUE)
- `.planning/PROJECT.md` — Core constraints and out-of-scope items

### Project Rules (MANDATORY)
- `CLAUDE.md` §Critical Obsidian Plugin Rules — `vault.process()`, `onLayoutReady`, `window.setInterval`, `normalizePath()`, no `console.log`. Hard rules for all phases.
- `CLAUDE.md` §Stack — TypeScript 5.8+, esbuild, Vitest, Obsidian API surface

### Prior Phase Decisions
- `.planning/STATUS.md` §Accumulated Context — All locked architectural decisions (VaultIndex as single source of truth, delimiter contract, mutex pattern)
- `.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md` — Phase 1 decisions (D-01..D-16), especially D-12/D-13/D-14 on write safety

### Existing Code to Build On
- `src/lib/exclusions.ts` — `isExcluded(filePath, patterns)` — VaultIndex must call this during `rebuild()` to skip excluded files
- `src/lib/delimiter.ts` — `isWriteSafe()`, `replaceDelimitedSection()` — consumed by Phase 4+, not Phase 2
- `src/settings.ts` — `KBManagerSettings` interface — `excludedPaths` and `folderRules` used by VaultIndex during index build
- `src/main.ts` — Plugin entry point; `registerVaultEvents()` placeholder is where Phase 2 wires vault events

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/exclusions.ts` → `isExcluded(filePath, patterns)`: Call this during VaultIndex rebuild to skip excluded paths. Already unit-tested.
- `src/settings.ts` → `KBManagerSettings.excludedPaths`: Pass `this.settings.excludedPaths` into VaultIndex constructor or `rebuild()` call.
- `src/main.ts` → `registerVaultEvents()`: This is the exact hook where Phase 2 adds `vault.on('modify', ...)`, `vault.on('create', ...)`, `vault.on('rename', ...)`, `vault.on('delete', ...)`.

### Established Patterns
- Pure-logic modules (no Obsidian imports) for testability via Vitest — VaultIndex internals like tag hierarchy building and FileRecord normalization should live in testable pure functions separate from the Obsidian-coupled class shell.
- Constructor injection: downstream generators receive VaultIndex (and plugin settings) via constructor, not module-level global.

### Integration Points
- `main.ts` → `this.index = new VaultIndex(this.app, this.settings)` created before `onLayoutReady`
- `main.ts` → `registerVaultEvents()` → wire `vault.on()` events to `this.index.markDirty(path)` / `this.index.remove(path)`
- Phase 3 scheduler will call `this.index.rebuildDirty()` on tick (incremental) and `this.index.rebuild()` on manual command (full)
- Phase 7 sidebar registers `this.index.onRebuildComplete(() => this.refresh())`

</code_context>

<specifics>
## Specific Details

- Tag normalization: strip `#`, lowercase, deduplicate per file. `getAllTags(fileCache)` from Obsidian merges frontmatter + body tags and includes `#` — strip on insert.
- FolderRecord minimum shape: `{ path: string, name: string, files: string[] }` — file paths indexed under their parent folder path for `getFilesInFolder()`.
- TagNode type: `interface TagNode { files: string[]; children: Map<string, TagNode>; }` — root `tagTree: Map<string, TagNode>` holds top-level segments.
- Pure-logic targets for Vitest: tag normalization, tag tree building from a flat tag list, FileRecord assembly from mock MetadataCache data.
- Obsidian MetadataCache API: `app.metadataCache.getFileCache(file)` returns `CachedMetadata | null` (headings, tags, frontmatter, links). `app.vault.getMarkdownFiles()` returns all `TFile[]`. Both available after `onLayoutReady`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-VaultIndex — Core Data Layer*
*Context gathered: 2026-04-29*
