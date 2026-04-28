# Architecture Research — Obsidian KB Manager Plugin

**Researched:** 2026-04-28
**API version verified against:** obsidian 1.7.2 (local node_modules)
**Confidence:** HIGH — all patterns verified directly from obsidian.d.ts and real plugin source code

---

## Component Overview

The plugin has seven distinct concerns. Each maps cleanly to a TypeScript class or module.

| Component | Type | Responsibility | Owns |
|-----------|------|---------------|------|
| `KBManagerPlugin` | `extends Plugin` | Lifecycle, wires all services together, registers commands/events/views/settings | Nothing — delegates everything |
| `VaultIndex` | Service class | Reads MetadataCache; builds the in-memory KB model (tag tree, file→tags map, folder structure) | The canonical in-memory model |
| `MOCGenerator` | Service class | Writes/updates MOC.md files and inline MOC sections using VaultIndex output | MOC file format logic |
| `TOCGenerator` | Service class | Writes/updates per-note TOC blocks from HeadingCache data | TOC block format logic |
| `TagManager` | Service class | Builds parent/child tag hierarchy and cross-ref map from VaultIndex | Tag tree data structure |
| `KBSidebarView` | `extends ItemView` | Renders the sidebar panel: MOC tree + tag hierarchy | View DOM only — reads from VaultIndex |
| `KBSettingsTab` | `extends PluginSettingTab` | Settings UI; reads/writes `data.json` via `loadData`/`saveData` | Settings schema |

### Component Boundaries

- **KBManagerPlugin** is the only class that touches `app` directly. It passes `app` into services at construction time — services do not import or store `app` themselves beyond what is passed in.
- **VaultIndex** is the single source of truth. MOCGenerator, TOCGenerator, TagManager, and KBSidebarView all read from it. Nothing writes to it except VaultIndex itself.
- **Generators (MOC, TOC)** write to vault files. They are the only classes that call `vault.process()` or `vault.modify()`.
- **KBSidebarView** is read-only from the vault's perspective. It renders from VaultIndex state and triggers index refreshes via callbacks, but never writes to vault files.

---

## Data Flow

```
Vault files
    |
    v
MetadataCache (Obsidian-managed, always current)
    |
    | app.metadataCache.getFileCache(file)  → CachedMetadata
    | app.metadataCache.resolvedLinks       → Record<path, Record<path, count>>
    | app.vault.getMarkdownFiles()          → TFile[]
    v
VaultIndex.rebuild()
    |  builds:
    |  - fileMetaMap: Map<TFile, CachedMetadata>
    |  - tagTree: Map<string, Set<string>>   (parent → children)
    |  - tagToFiles: Map<string, TFile[]>
    |  - folderToFiles: Map<TFolder, TFile[]>
    |
    +---> MOCGenerator.run(index)   → vault.process() MOC.md files
    |
    +---> TOCGenerator.run(index)   → vault.process() per-note TOC blocks
    |
    +---> TagManager.run(index)     → in-memory tag hierarchy (no writes)
    |
    +---> KBSidebarView.refresh()   → re-renders contentEl DOM
```

**Trigger path (periodic + event-driven with debounce):**

```
window.setInterval (periodic)  ──┐
vault 'create' event            ──┤
vault 'delete' event            ──┤--> scheduleUpdate (debounce 2000ms) --> VaultIndex.rebuild() --> generators
vault 'rename' event            ──┤
metadataCache 'resolved' event  ──┘
```

All events are registered inside `app.workspace.onLayoutReady()` to avoid the startup burst of `create` events that fires when Obsidian opens.

---

## Key Obsidian Patterns

### Plugin Lifecycle (verified from obsidian.d.ts 1.7.2)

`Plugin extends Component`. The Component class provides:
- `registerEvent(eventRef: EventRef): void` — auto-detaches on unload
- `registerInterval(id: number): number` — auto-clears on unload; use with `window.setInterval`
- `addChild<T extends Component>(component: T): T` — child lifecycle management
- `register(cb: () => any): void` — arbitrary cleanup on unload

Plugin adds:
- `loadData(): Promise<any>` and `saveData(data: any): Promise<void>` — read/write `data.json`
- `addCommand(command: Command): Command`
- `addRibbonIcon(icon, title, callback)`
- `addSettingTab(settingTab: PluginSettingTab): void`
- `registerView(type: string, viewCreator: ViewCreator): void`

Standard onload skeleton:
```typescript
export default class KBManagerPlugin extends Plugin {
  settings: KBManagerSettings;
  index: VaultIndex;
  mocGen: MOCGenerator;
  tocGen: TOCGenerator;
  tagManager: TagManager;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.index = new VaultIndex(this.app);
    this.mocGen = new MOCGenerator(this.app, this.settings);
    this.tocGen = new TOCGenerator(this.app, this.settings);
    this.tagManager = new TagManager();

    this.registerView(KB_SIDEBAR_VIEW_TYPE, (leaf) => new KBSidebarView(leaf, this));
    this.addSettingTab(new KBSettingsTab(this.app, this));

    this.addRibbonIcon('layout-list', 'Rebuild KB', () => this.runFullRebuild());
    this.addCommand({ id: 'rebuild-moc', name: 'Rebuild all MOCs', callback: () => this.runFullRebuild() });
    this.addCommand({ id: 'rebuild-toc', name: 'Rebuild all TOCs', callback: () => this.tocGen.runAll(this.index) });
    this.addCommand({ id: 'open-sidebar', name: 'Open KB sidebar', callback: () => this.activateSidebar() });

    this.app.workspace.onLayoutReady(() => {
      this.registerVaultEvents();
      this.startPeriodicUpdates();
      this.runFullRebuild();       // initial index build after vault is ready
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(KB_SIDEBAR_VIEW_TYPE);
  }
}
```

### MetadataCache Usage (verified from obsidian.d.ts 1.7.2)

`app.metadataCache` exposes:

```typescript
// Per-file cache — returns null if file not yet indexed
getFileCache(file: TFile): CachedMetadata | null

// Link graph — both already resolved
resolvedLinks: Record<string, Record<string, number>>    // source path → dest path → count
unresolvedLinks: Record<string, Record<string, number>>  // unresolved wikilinks
```

`CachedMetadata` fields (all optional):
```typescript
interface CachedMetadata {
  links?:             LinkCache[]          // [[wikilinks]] in body
  embeds?:            EmbedCache[]         // ![[embeds]]
  tags?:              TagCache[]           // #tags in body (NOT frontmatter tags)
  headings?:          HeadingCache[]       // ## headings
  sections?:          SectionCache[]       // root-level MD blocks
  listItems?:         ListItemCache[]
  frontmatter?:       FrontMatterCache     // YAML frontmatter as key→value
  frontmatterLinks?:  FrontmatterLinkCache[]
  footnotes?:         FootnoteCache[]
}

interface HeadingCache extends CacheItem {
  heading: string   // heading text (no # prefix)
  level: number     // 1–6
}

interface TagCache extends CacheItem {
  tag: string       // includes # prefix, e.g. "#project/active"
}
```

**Important:** `tags` in CachedMetadata contains only body tags (`#tag` in note text). Frontmatter `tags:` array is in `frontmatter.tags`. To get all tags for a file, use the utility function `getAllTags(cache: CachedMetadata): string[] | null` which merges both sources.

MetadataCache events:
```typescript
app.metadataCache.on('changed', (file: TFile, data: string, cache: CachedMetadata) => {})
// Note: NOT fired on rename — must also listen to vault 'rename'

app.metadataCache.on('deleted', (file: TFile, prevCache: CachedMetadata | null) => {})

app.metadataCache.on('resolve', (file: TFile) => {})
// fired when resolvedLinks/unresolvedLinks are updated for a file

app.metadataCache.on('resolved', () => {})
// fired when ALL pending files are resolved — good trigger for a full rebuild
```

**Recommended event for periodic-style indexing:** `metadataCache.on('resolved', ...)` — fires once after a batch of changes settle, rather than per-file. Combine with debounce to avoid rapid successive fires.

### ItemView Pattern (verified from obsidian.d.ts 1.7.2)

`ItemView extends View extends Component`. Must implement:
- `getViewType(): string` — unique string ID (e.g., `'kb-manager-sidebar'`)
- `getDisplayText(): string` — tab title
- `onOpen(): Promise<void>` — build DOM in `this.contentEl`
- `onClose(): Promise<void>` — clean up any non-Component resources

`contentEl: HTMLElement` — the safe container to render into. Do NOT use `containerEl.children[1]` — unstable across Obsidian versions.

```typescript
export const KB_SIDEBAR_VIEW_TYPE = 'kb-manager-sidebar';

export class KBSidebarView extends ItemView {
  private plugin: KBManagerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: KBManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return KB_SIDEBAR_VIEW_TYPE; }
  getDisplayText(): string { return 'KB Manager'; }
  getIcon(): IconName { return 'layout-list'; }

  async onOpen(): Promise<void> {
    this.navigation = false;  // static panel, not navigable
    this.refresh();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  refresh(): void {
    this.contentEl.empty();
    // render MOC tree and tag hierarchy from this.plugin.index
    // use Obsidian's createEl, createDiv, etc. or vanilla DOM
  }
}
```

**Activating the sidebar view** (the standard pattern from forum + Waypoint source):
```typescript
async activateSidebar(): Promise<void> {
  const { workspace } = this.app;
  let leaf = workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE)[0];
  if (!leaf) {
    const rightLeaf = workspace.getRightLeaf(false);
    if (rightLeaf) {
      await rightLeaf.setViewState({ type: KB_SIDEBAR_VIEW_TYPE, active: true });
      leaf = workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE)[0];
    }
  }
  if (leaf) await workspace.revealLeaf(leaf);
}
```

Prefer `getLeavesOfType` before creating a new leaf — prevents duplicate panels on reload.

### Settings Pattern (verified from obsidian.d.ts 1.7.2 + Waypoint source)

```typescript
interface KBManagerSettings {
  updateIntervalMinutes: number;
  mocFormat: 'dedicated' | 'inline' | 'both';
  folderRules: Record<string, 'dedicated' | 'inline' | 'both'>;
  excludedPaths: string[];
  tocEnabled: boolean;
  tocMarkerStart: string;  // e.g. "<!-- kb-toc-start -->"
  tocMarkerEnd: string;
}

const DEFAULT_SETTINGS: KBManagerSettings = {
  updateIntervalMinutes: 10,
  mocFormat: 'dedicated',
  folderRules: {},
  excludedPaths: [],
  tocEnabled: true,
  tocMarkerStart: '<!-- kb-toc-start -->',
  tocMarkerEnd: '<!-- kb-toc-end -->',
};

// In Plugin:
async loadSettings(): Promise<void> {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}

async saveSettings(): Promise<void> {
  await this.saveData(this.settings);
}
```

`PluginSettingTab` receives `(app, plugin)` in constructor. Its `display()` method builds the settings UI. Call `plugin.saveSettings()` in every `onChange`.

### Vault Event Pattern (verified from Waypoint source + forum)

Register ALL vault events inside `app.workspace.onLayoutReady()`. Without this guard, the `vault.on('create', ...)` event fires for every file Obsidian opens on startup, triggering spurious rebuilds:

```typescript
private registerVaultEvents(): void {
  // Vault structural events
  this.registerEvent(this.app.vault.on('create', (file) => {
    if (file instanceof TFile) this.scheduleUpdate();
  }));
  this.registerEvent(this.app.vault.on('delete', () => this.scheduleUpdate()));
  this.registerEvent(this.app.vault.on('rename', () => this.scheduleUpdate()));

  // metadataCache.on('changed') fires per-file while user types — too noisy
  // 'resolved' fires once after a batch settles — use this instead
  this.registerEvent(this.app.metadataCache.on('resolved', () => this.scheduleUpdate()));
}
```

`registerEvent` auto-detaches the listener when the plugin unloads — no manual cleanup needed.

---

## Background Task Architecture

### Periodic Update Implementation

`Component.registerInterval` wraps `window.setInterval` and auto-cancels on unload:

```typescript
private startPeriodicUpdates(): void {
  const intervalMs = this.settings.updateIntervalMinutes * 60 * 1000;
  this.registerInterval(
    window.setInterval(() => this.scheduleUpdate(), intervalMs)
  );
}
```

**Use `window.setInterval`** explicitly — TypeScript may otherwise resolve `setInterval` to the Node.js version.

### Debounced Update Scheduling

Obsidian exports a `debounce` utility. The pattern from Waypoint (confirmed working in production):

```typescript
// Batch rapid vault events into a single rebuild
// leading=true means the first call fires immediately; trailing fires after quiet period
scheduleUpdate = debounce(
  async () => {
    await this.runFullRebuild();
  },
  2000,   // 2s quiet period — long enough to absorb file-save debounce
  true    // leading edge: also fire immediately on first event
);
```

**Why 2 seconds:** Obsidian's own file-save debounce is ~2 seconds. `vault.modify()` and `vault.process()` will fail silently if called within that window on a file the user just edited. The 2s plugin debounce keeps plugin writes safely after the editor flushes.

### Full Rebuild Pipeline

```typescript
private async runFullRebuild(): Promise<void> {
  // 1. Build index from MetadataCache (fast — no disk reads)
  await this.index.rebuild();

  // 2. Run generators in parallel (each writes vault files)
  await Promise.all([
    this.mocGen.run(this.index),
    this.tocGen.run(this.index),
  ]);

  // 3. Update in-memory tag hierarchy (no I/O)
  this.tagManager.rebuild(this.index);

  // 4. Refresh sidebar if open
  const views = this.app.workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE);
  views.forEach(leaf => (leaf.view as KBSidebarView).refresh());
}
```

Generators run in parallel because they write to different files (MOC files vs. user notes). The index rebuild must complete first since generators depend on its output.

### Async Safety

- Never `await` inside a vault event callback directly. The callback fires synchronously and awaiting inside it can cause issues. Schedule the work via `scheduleUpdate` instead.
- When iterating all vault files for a bulk operation, process in batches with `await` between batches to yield the event loop:

```typescript
const files = this.app.vault.getMarkdownFiles();
for (let i = 0; i < files.length; i += 50) {
  const batch = files.slice(i, i + 50);
  await Promise.all(batch.map(f => this.processFile(f)));
}
```

---

## File Safety Patterns

### The Core Principle: Markers, Not Ownership

The plugin must never own an entire file's content (except for dedicated MOC.md files it creates). For user notes, the plugin manages only delimited regions.

**Dedicated MOC files** (plugin-created, plugin-owned):
- Plugin creates `MOC.md` in a folder, marks the file with a frontmatter tag (`kb-managed: true`)
- Full file content is plugin-controlled
- Safe to overwrite entirely on each rebuild

**Inline sections in user notes** (plugin inserts, user owns surrounding content):
- Delimited by marker comments, e.g.:
  ```
  <!-- kb-toc-start -->
  - [[Heading 1]]
  - [[Heading 2]]
  <!-- kb-toc-end -->
  ```
- Plugin finds start marker, finds end marker, replaces only the content between them
- If markers not found: warn and skip — never insert without explicit markers

### vault.process() — The Correct Write Method (verified from obsidian.d.ts 1.7.2)

`vault.process()` is the **atomic read-modify-write** API introduced in recent Obsidian versions:

```typescript
// Signature: process(file, fn: (data) => string, options?): Promise<string>
// fn receives current content, returns new content synchronously
// Obsidian handles the read-lock and write atomically

await this.app.vault.process(file, (content: string) => {
  return this.replaceMarkedSection(content, newSectionContent);
});
```

Use `vault.process()` over `vault.read()` + `vault.modify()` because:
- Atomic: no race condition between read and write
- Returns the written content for verification
- Preferred over `modify` per the API docs: "Atomically read, modify, and save"

The `fn` passed to `process()` must be synchronous (returns `string`, not `Promise<string>`). Build the new content before calling `process()`, then return it from the callback.

### Marker-based Section Replace Pattern

```typescript
function replaceMarkedSection(
  content: string,
  markerStart: string,
  markerEnd: string,
  newSection: string
): string {
  const startIdx = content.indexOf(markerStart);
  const endIdx = content.indexOf(markerEnd);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    // Markers not found or malformed — return content unchanged
    return content;
  }

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + markerEnd.length);
  return `${before}${markerStart}\n${newSection}\n${markerEnd}${after}`;
}
```

Key properties:
- Returns the original string unchanged if markers are absent — no accidental data loss
- End marker position check (`endIdx > startIdx`) prevents clobbering if markers are out-of-order
- The function is pure (no side effects) — testable in isolation

### Exclusion Checking

Always check exclusions before writing:

```typescript
function isExcluded(file: TFile, settings: KBManagerSettings): boolean {
  return settings.excludedPaths.some(pattern =>
    file.path.startsWith(pattern) || file.path === pattern
  );
}
```

Check `isExcluded` at the top of every generator method that writes to vault files.

### MOC File Identification

Tag generated MOC files in frontmatter so the plugin can identify its own files:

```yaml
---
kb-managed: true
kb-type: moc
---
```

Before overwriting any `.md` file as a MOC, verify either (a) `kb-managed: true` is in frontmatter, or (b) the plugin is creating the file fresh via `vault.create()`.

---

## Suggested Build Order

Build order follows dependency direction: core API wrappers first, then features that depend on them.

### Phase 1 — Plugin Scaffold + Settings
**Why first:** Everything else depends on settings existing and the plugin loading cleanly.
- `KBManagerPlugin.onload()` with empty services
- `KBManagerSettings` interface + `DEFAULT_SETTINGS`
- `KBSettingsTab` with basic settings UI
- `manifest.json`, `esbuild.config.mjs`, `tsconfig.json`
- Verify plugin loads/unloads without errors in Obsidian developer mode

### Phase 2 — VaultIndex (Core Data Layer)
**Why second:** All generators depend on the index. Build it with tests before building consumers.
- `VaultIndex.rebuild()` using `app.vault.getMarkdownFiles()` + `app.metadataCache.getFileCache()`
- Tag normalization (`getAllTags()` utility merges body + frontmatter tags)
- Folder structure map
- Tag hierarchy inference (nested tags: `#project/active` → parent `project`, child `active`)
- No writes to vault — safe to iterate and test

### Phase 3 — Background Update Infrastructure
**Why third:** Generators need the scheduling infrastructure before they can run safely.
- `debounce`-based `scheduleUpdate`
- `window.setInterval` with `registerInterval` for periodic updates
- Vault event registration inside `onLayoutReady`
- Verify rebuild fires without duplicate execution and without blocking UI

### Phase 4 — MOC Generator
**Why fourth:** Core feature of the plugin. Depends on VaultIndex being solid.
- Dedicated MOC.md generation from folder structure
- `vault.process()` write pattern with marker-based safety
- Exclusion checking
- Per-folder format override from settings
- Manual trigger command working end-to-end

### Phase 5 — TOC Generator
**Why fifth:** Simpler than MOC (per-note not per-folder) but same write pattern.
- Per-note TOC block from `CachedMetadata.headings`
- Marker-based inline section update
- Handles notes with no headings gracefully (skips, does not insert empty block)

### Phase 6 — TagManager + Tag Hierarchy
**Why sixth:** Depends on VaultIndex. In-memory only — no vault writes — lower risk.
- Parent/child tag tree from nested tag notation (`#parent/child`)
- Cross-reference map (files sharing a tag cluster)
- Exposed as a queryable in-memory structure for sidebar use

### Phase 7 — Sidebar View (KBSidebarView)
**Why last:** Consumer of all other components. Has no logic of its own, only rendering.
- `ItemView` registration and `activateSidebar()` method
- MOC tree rendering in `contentEl`
- Tag hierarchy rendering
- Refresh on index rebuild
- Ribbon icon opens panel

---

## Anti-Patterns to Avoid

**1. Event-driven writes on every `metadataCache.on('changed')` call**
This fires while the user is still typing. Writing to vault inside this handler causes the 2-second debounce conflict and hammers I/O. Use `metadataCache.on('resolved')` + debounce instead.

**2. Raw `vault.read()` + `vault.modify()` without `vault.process()`**
The gap between read and modify is a race condition window. If another write lands between them, the earlier read's content clobbers it. Always use `vault.process()` for atomic updates.

**3. Writing to files not owned by the plugin without marker guards**
Without marker checking, any write to a user note can clobber content if markers were manually deleted or never inserted. The marker check must return the content unmodified when markers are absent.

**4. Registering vault events outside `onLayoutReady`**
Causes a flood of `create` events for every file Obsidian indexes on startup, triggering full rebuilds before the vault is ready. The Waypoint plugin uses this exact guard pattern.

**5. Storing `app` or `vault` references in service classes as static or module-level singletons**
Makes unit testing impossible and creates implicit coupling. Pass `app` into constructors.

**6. Building VaultIndex by re-parsing markdown files from disk**
MetadataCache already parses all headings, tags, links, and frontmatter. Calling `vault.read()` on every file for structure data is wasteful and slower. Read from `app.metadataCache.getFileCache(file)` exclusively for structure.
