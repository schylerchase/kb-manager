# Phase 7: Sidebar View - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A persistent Obsidian `ItemView` panel docked on the right that displays a vertical split:
the MOC tree (folders → files) on top and the tag hierarchy on bottom. Both update
automatically after each VaultIndex rebuild via the existing `onRebuildComplete` hook.
Tag nodes show a count badge `(N)`. Click behaviors: file opens the note, folder opens
its `MOC.md`, tag opens Obsidian's built-in tag search for that tag. Survives Obsidian
restarts via `Plugin.registerView` + `Plugin.app.workspace.getLeavesOfType`.

Requirements in scope: SIDE-01, SIDE-02, SIDE-03, SIDE-04

</domain>

<decisions>
## Implementation Decisions

### View Type and Lifecycle (SIDE-01, SIDE-04)
- **D-01:** View type id: `kb-manager-sidebar`. View name (display label): `KB Manager`.
  Icon: `network` (Lucide icon — represents the tree/graph nature of the panel).
- **D-02:** Default location: **right pane**. On first activation, `app.workspace.getRightLeaf(false).setViewState({ type: 'kb-manager-sidebar', active: true })` opens it.
  Subsequent restarts read whichever leaf the user moved it to (Obsidian persists leaf
  state automatically); plugin only re-registers the view type, doesn't force-relocate.
- **D-03:** SIDE-04 persistence: `registerView(VIEW_TYPE, leaf => new KBSidebarView(leaf, this))` runs
  in `onload()`. After Obsidian restarts, Obsidian re-creates the view from saved layout
  using this registration. `onLayoutReady` does NOT re-open the panel — that would create
  duplicates. Instead, `onLayoutReady` checks `app.workspace.getLeavesOfType(VIEW_TYPE)`;
  only opens a new leaf if zero exist (first install, or user explicitly closed it).
- **D-04:** A ribbon icon (`network` glyph) and a command (`kb-manager-open-sidebar`)
  re-open the sidebar if the user closes it. Tooltip: `KB Manager: Open sidebar`.
  Command name: `KB Manager: Open sidebar`.

### Layout (SIDE-02)
- **D-05:** Vertical split inside the view: MOC tree on TOP, Tags hierarchy on BOTTOM.
  Two `<div>` siblings inside `containerEl`. Resizable divider via flex grow + simple
  CSS — no third-party splitter library. Default split: 60% MOC / 40% Tags.
- **D-06:** Each section has a sticky h3 header (`MOC Tree`, `Tags`) at the top, then a
  scrollable list below. Scrolling is independent per section.
- **D-07:** Empty state messaging:
  - MOC section before first rebuild completes: `Indexing vault…` italic line.
  - MOC section when vault is empty (no folders): `No folders to index`.
  - Tags section before first rebuild: `Indexing vault…`.
  - Tags section when no tags: `No tags found`.

### MOC Tree Rendering (SIDE-01)
- **D-08:** Hierarchy structure: render folders as expandable nodes; files within a folder
  appear as leaves directly under that folder. Subfolders are nested children of their
  parent folder. Twirl arrow (▶/▼) on folder nodes.
- **D-09:** Folder click target: opens `{folder}/MOC.md` in the active workspace pane.
  If `MOC.md` doesn't exist (folder is `inline` mode per Phase 4 D-17), click does nothing
  visually but logs `console.warn('KB Manager: no MOC.md in {folder} (inline mode)')` once.
- **D-10:** Folder twirl arrow click target: toggles expand/collapse independently from
  the folder name click target. Requires two click zones on the same row — twirl on the
  left, name on the right. Standard tree-view UX.
- **D-11:** File click target: opens the file in the active pane via
  `app.workspace.getLeaf(false).openFile(file)`. Same behavior as the file explorer.
- **D-12:** Files filtered out of the tree: excluded paths (per Phase 1 `isExcluded`),
  files with `kb-managed: true` frontmatter (i.e. `MOC.md` / `INDEX.md`). Same skip rules
  as MocGenerator (Phase 4 D-22).
- **D-13:** Sort order: folders sorted alphabetically before files; folders before files
  at every level. Files sorted alphabetically by basename. Standard explorer convention.
- **D-14:** Initial expansion state: all folders collapsed by default. user expands as
  needed. Plugin does NOT persist expanded state across restarts in v1 (deferred).

### Tag Hierarchy Rendering (SIDE-02)
- **D-15:** Tag tree mirrors the structure from `tagManager.getTagHierarchy()`. Each node
  is a tag segment (e.g., `project`, `alpha`). Nested via the tree's `children` Map.
- **D-16:** Tag node label format: `{name} ({count})` where count = number of files that
  apply this exact normalized tag (`tagManager.getFilesWithTag(fullTagPath)`). Counts
  reflect EXACT-tag matches per Phase 6 D-02 (no descendant aggregation in v1).
- **D-17:** Tag click target: opens Obsidian's tag search via
  `app.internalPlugins.getPluginById('global-search')?.instance.openGlobalSearch(`tag:#${fullTagPath}`)`
  if available, ELSE falls back to opening a new tab with the tag search URL
  (`obsidian://search?query=tag:#${fullTagPath}`). Either way, user lands on the
  built-in search results for that tag.
- **D-18:** Tag twirl arrow on nested-tag nodes — same UX as folder twirl (D-10):
  expand/collapse children. Leaf tags (no children) have no twirl, just the count badge.
- **D-19:** Sort order: alphabetical at every level.
- **D-20:** Initial expansion state: all tag nodes collapsed by default. Same as folders
  (D-14).

### Refresh on Rebuild (SIDE-03)
- **D-21:** KBSidebarView subscribes to a refresh signal in its `onOpen()` and unsubscribes
  in `onClose()`. The plugin holds a `Set<() => void>` of sidebar refresh callbacks
  (`this.sidebarRefreshCallbacks`); each open KBSidebarView adds its own. On rebuild
  complete, plugin iterates the set and calls each.
- **D-22:** The existing `onRebuildComplete` handler in `main.ts` (set up in Phase 5
  Plan 05-03's `runGenerators`) is extended to fire sidebar refreshes AFTER both
  generators complete. Order: `mocGenerator.run() → tocGenerator.run() → notify sidebars`.
  Sidebars see the new MOC.md / INDEX.md content already on disk and updated VaultIndex
  data simultaneously.
- **D-23:** Refresh re-renders the entire panel content (clear + rebuild DOM). No
  dirty-DOM diffing in v1 — keeps code simple. Performance is fine for typical vaults
  (under 5000 notes / few hundred tags). v2 may add reconciliation if profiling shows
  the need.
- **D-24:** Refresh preserves user's expanded-state for the duration of the open view —
  re-render reads the stored expanded set and restores it. Stored in JS Map on the view
  instance (not persisted across closes).

### Click Wiring Implementation
- **D-25:** Click handlers attach via `addEventListener('click', ...)` on each row. No
  delegation mess in v1. Each rendered row is a `<div>` with `onClick` that captures
  the row's identity (folder path, file path, or tag path) via closure.
- **D-26:** Twirl click stops propagation so it doesn't trigger the row's open-MOC click.

### Performance + Skip Rules
- **D-27:** Tree builds from `tagManager.getTagHierarchy()` and from a folder-and-file
  view model derived from `VaultIndex.getAllFolders()` + `getFilesInFolder(folder)`.
  Pure-logic helpers in `src/lib/sidebar-data.ts` keep the render function dumb.
- **D-28:** Excluded paths are filtered at the data-prep stage (Plan 07-01) so the render
  loop never sees them. No double-checks during DOM creation.

### Claude's Discretion
- CSS class names + exact color values — keep minimal, use Obsidian's CSS variables
  (`--text-muted`, `--background-secondary`) for theme compatibility.
- Whether to use `setIcon(...)` (Obsidian helper) for twirl glyphs vs SVG inline.
  `setIcon` is preferred for theme consistency.
- Class file split: monolithic `KBSidebarView.ts` vs splitting into
  `KBSidebarView.ts` + `MocTreeRenderer.ts` + `TagTreeRenderer.ts`. Inline if file
  stays under 280 lines; split otherwise.
- Hover states / animation on twirl chevron — omit in v1; add in v2 if the panel feels
  static.
- Whether to use the same icon for ribbon and view (`network` glyph) — yes, consistency.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` §Sidebar — SIDE-01..04 full requirement text
- `.planning/ROADMAP.md` §Phase 7 — Success criteria (4 criteria)

### Project Rules (MANDATORY)
- `CLAUDE.md` §Critical Obsidian Plugin Rules — `onLayoutReady` for view registration
  side effects, `normalizePath()` for paths derived from data, no `console.log` in
  production
- `CLAUDE.md` §File Size Limits — Functions <30, Files <300, Nesting <3

### Prior Phase Decisions
- `.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md` §VaultIndex API:
  `getAllFolders()`, `getFilesInFolder()`, `getTagTree()`, `getFilesWithTag()`,
  `onRebuildComplete` callback consumed by sidebar refresh hook
- `.planning/phases/04-moc-generator/04-CONTEXT.md` §MOC.md naming (D-07) and §File Skip
  (D-22): sidebar tree filters use the same skip rules
- `.planning/phases/05-toc-generator/05-CONTEXT.md` §Lifecycle (D-18..D-20):
  runGenerators ordering ensures MocGenerator + TocGenerator finish before sidebar refresh
- `.planning/phases/06-tagmanager-tag-hierarchy/06-CONTEXT.md` §TagManager API (D-06):
  `getTagHierarchy()`, `getFilesWithTag()`, `getAllTags()` — sidebar Tags section consumes
  these directly

### Existing Code (consumed)
- `src/main.ts` — Phase 6 added TagManager; this phase adds KBSidebarView registration,
  ribbon icon, command, sidebarRefreshCallbacks set, and extends runGenerators to fire
  refreshes
- `src/VaultIndex.ts` — folder + file query methods
- `src/TagManager.ts` — Phase 6; consumed by sidebar Tags section
- `src/lib/exclusions.ts` — `isExcluded` for tree filter
- `src/lib/vault-index-types.ts` — `TagNode`, `FolderRecord`, `FileRecord` types

### Obsidian API surfaces used
- `Plugin.registerView(viewType, viewCreator)` — SIDE-04 persistent registration
- `Plugin.addRibbonIcon`, `Plugin.addCommand` — SIDE-01 entry points
- `ItemView` (extended by KBSidebarView), `ItemView.getViewType()`,
  `ItemView.getDisplayText()`, `ItemView.getIcon()`, `ItemView.onOpen()`,
  `ItemView.onClose()`
- `app.workspace.getRightLeaf(false)`, `setViewState(...)`, `revealLeaf(...)` —
  open the panel
- `app.workspace.getLeavesOfType(VIEW_TYPE)` — find existing leaf, avoid duplicates
- `app.workspace.getLeaf(false).openFile(file)` — open files on click
- `app.internalPlugins.getPluginById('global-search').instance.openGlobalSearch(query)` —
  tag search; defensive optional chaining for missing plugin instances
- `setIcon(el, name)` — Lucide icon rendering inside DOM elements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tagManager.getTagHierarchy()` returns the exact `Map<string, TagNode>` the sidebar
  needs to render. No transformation required beyond computing per-node counts.
- `tagManager.getFilesWithTag(fullTagPath)` for D-16 count badges. Per-tag lookup is O(1).
- `VaultIndex.getAllFolders()` + `getFilesInFolder(folder)` for the MOC tree data prep.
- `isExcluded(path, settings.excludedPaths)` for filtering at data-prep time (D-28).

### Established Patterns
- Pure-logic + Obsidian-coupled split: data-prep helpers in `src/lib/sidebar-data.ts`
  (no Obsidian imports, Vitest-testable); render in `src/KBSidebarView.ts` (DOM + Obsidian).
- Constructor injection: `KBSidebarView(leaf: WorkspaceLeaf, plugin: KBManagerPlugin)`.
  View needs plugin reference to access `tagManager`, `index`, `settings`.
- Refresh-callback Set on the plugin (D-21) is similar to the `onRebuildComplete` callback
  pattern from Phase 2 D-11 — explicit subscription, no global event bus.

### Integration Points
- `main.ts onload()`: `this.registerView(VIEW_TYPE, leaf => new KBSidebarView(leaf, this));`
  PLUS `this.sidebarRefreshCallbacks = new Set<() => void>();` field.
- `main.ts onLayoutReady`: after generator wiring, check
  `if (this.app.workspace.getLeavesOfType(VIEW_TYPE).length === 0) await this.app.workspace.getRightLeaf(false).setViewState({ type: VIEW_TYPE, active: false });`.
- `main.ts onLayoutReady .finally(...)`: register `addRibbonIcon('network', 'KB Manager: Open sidebar', () => this.activateSidebar())`
  and `addCommand({ id: 'kb-manager-open-sidebar', name: 'KB Manager: Open sidebar', callback: () => this.activateSidebar() })`.
- `main.ts runGenerators`: extend to call `this.notifySidebarRefresh()` after both
  generator runs complete.
- `KBSidebarView.onOpen()`: register a refresh callback that re-renders, add to
  `plugin.sidebarRefreshCallbacks`. `onClose()`: remove the callback.

</code_context>

<specifics>
## Specific Details

### Folder/file tree data shape (Plan 07-01)
```typescript
export interface FolderTreeNode {
  type: 'folder';
  path: string;           // vault-relative, '' for root
  name: string;           // display label, '' for root → display as 'Vault'
  childFolders: FolderTreeNode[];   // sorted alphabetically
  childFiles: { path: string; basename: string }[];  // sorted alphabetically
  hasMoc: boolean;        // true if {path}/MOC.md is expected (per resolveFormat)
}

export function buildFolderTree(
  allFolderPaths: string[],
  filesByFolder: Map<string, { path: string; basename: string; kbManaged: boolean }[]>,
  excludedPaths: string[],
  resolveFormat: (folderPath: string) => 'dedicated' | 'inline',
): FolderTreeNode;
```

### Tag tree data shape (Plan 07-01)
```typescript
export interface TagTreeViewNode {
  name: string;            // segment label
  fullPath: string;        // full normalized tag path (e.g., 'project/alpha')
  count: number;           // exact-tag file count
  children: TagTreeViewNode[];  // sorted alphabetically by name
}

export function buildTagViewTree(
  hierarchy: Map<string, TagNode>,
  countForTag: (fullPath: string) => number,
): TagTreeViewNode[];
```

### KBSidebarView class shape (Plan 07-02)
```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
import KBManagerPlugin from './main';

export const KB_SIDEBAR_VIEW_TYPE = 'kb-manager-sidebar';

export default class KBSidebarView extends ItemView {
  private refreshCallback: (() => void) | null = null;
  private expandedFolders = new Set<string>();
  private expandedTags = new Set<string>();

  constructor(leaf: WorkspaceLeaf, private plugin: KBManagerPlugin) { super(leaf); }
  getViewType(): string { return KB_SIDEBAR_VIEW_TYPE; }
  getDisplayText(): string { return 'KB Manager'; }
  getIcon(): string { return 'network'; }
  async onOpen(): Promise<void> { /* register refresh, render */ }
  async onClose(): Promise<void> { /* unregister refresh */ }
  private render(): void { /* clear + rebuild DOM from sidebar-data + plugin.tagManager */ }
}
```

### main.ts plugin additions (Plan 07-03)
```typescript
sidebarRefreshCallbacks: Set<() => void> = new Set();

private notifySidebarRefresh(): void {
  for (const cb of this.sidebarRefreshCallbacks) cb();
}

private async activateSidebar(): Promise<void> {
  const leaves = this.app.workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE);
  if (leaves.length > 0) { this.app.workspace.revealLeaf(leaves[0]); return; }
  const right = this.app.workspace.getRightLeaf(false);
  if (!right) return;
  await right.setViewState({ type: KB_SIDEBAR_VIEW_TYPE, active: true });
}

// runGenerators (Phase 5 D-18 extension):
private async runGenerators(): Promise<void> {
  await this.mocGenerator.run();
  await this.tocGenerator.run();
  this.notifySidebarRefresh();   // NEW: SIDE-03 signal
}
```

### Vitest coverage planned (Plan 07-04)
- `buildFolderTree`: empty input, single folder + single file, nested folders,
  excluded folder filtered out, kb-managed file filtered, sort order
- `buildTagViewTree`: empty hierarchy, single top-level tag, nested tag, count
  delegation correctness, sort order

### CSS approach
- Inline `<style>` block in `onOpen()` is acceptable for v1 — small surface (~30 lines).
  Style file split deferred. Use Obsidian CSS variables: `var(--text-normal)`,
  `var(--text-muted)`, `var(--background-secondary)`, `var(--interactive-hover)`.

</specifics>

<deferred>
## Deferred Ideas

- **Persisted expanded-state across Obsidian restarts**: store expandedFolders /
  expandedTags Sets in plugin settings. v2 — adds settings shape complexity for marginal
  UX win in v1.
- **Cluster-filter view in sidebar** (multi-select tags, see notes that match 2+):
  Phase 6 D-09 noted this is deferred. v2.
- **Search/filter input at top of MOC tree**: type to filter folders/files by name. v2.
- **Drag-and-drop notes between folders**: v2; out of scope as plugin doesn't manage
  vault file moves.
- **Context menu (right-click)**: v2; would expose actions like "Open MOC.md" /
  "Rebuild this folder".
- **Reconciliation-based DOM updates** (instead of full re-render on every refresh):
  v2 if performance profiling on large vaults shows the need.
- **Multiple sidebar instances** (user opens two separate KBSidebar leaves): v2 — refresh
  Set already supports it, but render conflicts not yet thought through.

</deferred>

---

*Phase: 7-Sidebar View*
*Context gathered: 2026-04-29*
