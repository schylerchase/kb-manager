# Stack Research — Obsidian KB Manager Plugin

**Researched:** 2026-04-28
**Sources:** Official sample plugin repo, Context7 developer docs, npm registry, community testing tools

---

## Recommended Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Language | TypeScript | ^5.8.3 | Required by official template; strict mode unlocked |
| Plugin API | obsidian (npm) | latest (1.12.3 as of research) | Type definitions only; Obsidian provides at runtime |
| Bundler | esbuild | 0.25.5 (pinned) | Official template uses it; fast, CJS output, handles externals |
| Linter | typescript-eslint + eslint-plugin-obsidianmd | 8.35.1 / 0.1.9 | Official template includes Obsidian-specific lint rules |
| Runtime helpers | tslib | 2.4.0 | importHelpers reduces bundle size for repeated TS helpers |
| Node.js | >=16 | — | Minimum stated in official sample plugin README |

No framework (React, Svelte, etc.) is recommended for this plugin. The Obsidian API provides its own DOM helpers (`createEl`, `createDiv`, `containerEl`) that are idiomatic for plugin UI and avoid the overhead of shipping a rendering library.

---

## Build Toolchain

### esbuild configuration (from official template, verified)

Entry: `src/main.ts` → Output: `main.js` (CommonJS, not ESM)

```
target: ES2018
format: cjs
bundle: true
treeShaking: true
sourcemap: inline (dev) / off (production)
minify: production only
platform: browser
```

**External packages** — must NOT be bundled (Obsidian provides at runtime):
- `obsidian`
- `electron`
- All `@codemirror/*` modules
- All `@lezer/*` modules
- All Node.js built-ins

Run modes:
- `npm run dev` — esbuild watch, rebuilds on change, inline sourcemaps
- `npm run build` — tsc type-check (no emit) then esbuild production bundle

### tsconfig (from official template, verified)

Key settings:
```json
{
  "compilerOptions": {
    "baseUrl": "src",
    "module": "ESNext",
    "target": "ES6",
    "moduleResolution": "node",
    "importHelpers": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "strictNullChecks": true,
    "strictBindCallApply": true,
    "useUnknownInCatchVariables": true,
    "isolatedModules": true,
    "lib": ["DOM", "ES5", "ES6", "ES7"],
    "inlineSourceMap": true,
    "inlineSources": true
  },
  "include": ["src/**/*.ts"]
}
```

Notable: `noUncheckedIndexedAccess` is explicitly enabled (not part of `strict: true`). This matters for this plugin — MetadataCache returns arrays that can be undefined-indexed; the compiler will catch it.

### Hot reload during development

Use the community `hot-reload` plugin (pjeby/hot-reload on GitHub). It watches for changes to `main.js` in any plugin directory that contains a `.hotreload` file or a `.git` directory. Place a `.hotreload` file in the plugin folder during development. This means you do not need Ctrl+R to reload — changes to the built `main.js` trigger an automatic plugin disable/re-enable cycle.

Prerequisite: your plugin must implement `onunload()` correctly and use `registerX()` methods for all event/interval registrations, otherwise hot reload will leave Obsidian in a broken state.

### File layout

```
src/
  main.ts          ← Plugin entry, extends Plugin
  settings.ts      ← PluginSettingTab subclass
  views/
    sidebar.ts     ← ItemView subclass
  ...
main.js            ← esbuild output (git-ignored during dev)
manifest.json      ← Plugin metadata (committed)
versions.json      ← Version compatibility map (committed)
styles.css         ← Optional plugin styles
```

---

## Obsidian API Key Classes

Confidence: HIGH — verified against Context7 developer docs and official API type definitions.

### Plugin (base class)

Extend this for the plugin entry point. Key lifecycle methods:

| Method | When Called | What to Do |
|--------|-------------|------------|
| `onload()` | Plugin enabled | Register everything: commands, views, intervals, settings tab, events |
| `onunload()` | Plugin disabled | Automatic if you used registerX(); add manual cleanup here only for non-registered resources |

Settings persistence pattern (official):
```typescript
async loadSettings() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}
async saveSettings() {
  await this.saveData(this.settings);
}
```

### Vault

Core file I/O. Key methods for this plugin:

| Method | Use Case | Notes |
|--------|----------|-------|
| `vault.getMarkdownFiles()` | Get all notes for MOC scan | Returns TFile[] |
| `vault.getAbstractFileByPath(path)` | Check if MOC file exists | Returns TAbstractFile or null |
| `vault.create(path, content)` | Create new MOC.md | Throws if file exists |
| `vault.process(file, fn)` | Atomically read-modify-write MOC files | PREFERRED over read+modify; prevents data loss |
| `vault.cachedRead(file)` | Read file for display/analysis only | Faster; uses OS cache |
| `vault.read(file)` | Read file for modification | Use before modify; prefer process() |
| `vault.modify(file, content)` | Write full file content | Use only when process() won't work |
| `vault.trash(file, true)` | Delete to system trash | Safer than permanent delete |

**Critical for this plugin:** Use `vault.process()` for all MOC/TOC file writes. It guarantees atomicity — the callback receives current content and must return new content synchronously. This prevents partial writes if two updates race.

### MetadataCache

Do not re-parse frontmatter or links yourself. MetadataCache already has it.

| API | Returns | Notes |
|-----|---------|-------|
| `app.metadataCache.getFileCache(file)` | `CachedMetadata \| null` | All metadata for a file |
| `getAllTags(cache)` | `string[] \| null` | Combines body tags + frontmatter tags; imported from 'obsidian' |
| `cache.headings` | `HeadingCache[]` | All headings with level and text — use for TOC generation |
| `cache.links` | `LinkCache[]` | All wikilinks in the note body |
| `cache.frontmatterLinks` | `FrontmatterLinkCache[]` | Wikilinks in frontmatter (available since Obsidian 1.4.0) |
| `cache.frontmatter` | `FrontMatterCache` | Raw frontmatter key-value pairs |
| `app.metadataCache.resolvedLinks` | `Record<string, Record<string, number>>` | Map of sourcePath → {targetPath: linkCount}; use for backlink computation |
| `app.metadataCache.on('changed', cb)` | EventRef | Fires when a file is indexed after save |

`getBacklinksForFile()` exists but is undocumented/internal. Do not use it. Use `resolvedLinks` instead — it is the documented way to compute backlinks by iterating source files.

### ItemView + WorkspaceLeaf (sidebar panel)

```typescript
class KBSidebarView extends ItemView {
  getViewType(): string { return VIEW_TYPE_KB; }
  getDisplayText(): string { return 'KB Structure'; }
  async onOpen() { /* build DOM in this.contentEl */ }
  async onClose() { /* cleanup */ }
}

// Registration in Plugin.onload():
this.registerView(VIEW_TYPE_KB, (leaf) => new KBSidebarView(leaf));

// Activation:
async activateView() {
  const leaf = this.app.workspace.getRightLeaf(false)!;
  await leaf.setViewState({ type: VIEW_TYPE_KB, active: true });
  this.app.workspace.revealLeaf(leaf);
}
```

Use `workspace.getLeavesOfType(VIEW_TYPE_KB)` first to avoid opening duplicate leaves.

### PluginSettingTab

```typescript
class KBSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: KBManagerPlugin) {
    super(app, plugin);
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName('Update interval (minutes)')
      .addSlider(slider => slider
        .setLimits(1, 60, 1)
        .setValue(this.plugin.settings.updateIntervalMinutes)
        .onChange(async (value) => {
          this.plugin.settings.updateIntervalMinutes = value;
          await this.plugin.saveSettings();
        }));
  }
}
```

Register with `this.addSettingTab(new KBSettingTab(this.app, this))` in `onload()`.

### TFile

Represents a file node in the vault tree. Key properties: `path`, `basename`, `extension`, `stat.mtime`, `stat.size`, `parent` (TFolder). Always use `instanceof TFile` check when working with `getAbstractFileByPath()` returns.

---

## Background Tasks

### The correct pattern: registerInterval

```typescript
this.registerInterval(
  window.setInterval(async () => {
    await this.runBackgroundUpdate();
  }, this.settings.updateIntervalMinutes * 60 * 1000)
);
```

Use `window.setInterval` (not `setInterval`) to avoid TypeScript ambiguity between Node.js and browser types. Wrap with `this.registerInterval()` so the interval is automatically cancelled on plugin unload — no manual cleanup needed.

Available since Obsidian 0.13.8 (HIGH confidence, from API docs).

### Async safety inside the interval callback

The interval fires synchronously but the callback is async. Obsidian's single-thread model means there is no true parallelism, but you must still guard against overlapping runs if an update takes longer than the interval:

```typescript
private isUpdating = false;

private async runBackgroundUpdate() {
  if (this.isUpdating) return;
  this.isUpdating = true;
  try {
    await this.rebuildAllMOCs();
    await this.rebuildAllTOCs();
  } finally {
    this.isUpdating = false;
  }
}
```

### Why not event-driven?

The PROJECT.md already captures this decision: `MetadataCache.on('changed')` fires on every file save. On a large vault with frequent edits, this triggers a rebuild per-save. A 5-minute interval is far less intrusive and is the documented recommendation for heavy vault scans. Event-driven makes sense only for immediate feedback features (e.g., "update sidebar after save") — for bulk writes back to vault files, use the interval.

### Debounce for manual triggers

Ribbon commands should debounce if the user clicks rapidly. Use a simple flag or timestamp guard rather than a debounce library.

---

## Testing

Testing Obsidian plugins is genuinely hard. The plugin runs inside Electron and imports from the `obsidian` module, which does not exist in a standard Node.js test environment.

### Practical approach for this plugin

**Layer 1 — Pure logic unit tests (Vitest, no Obsidian dependency)**

Extract all data transformation logic into functions that take plain data and return plain data. These have no Obsidian imports and can be tested with Vitest normally:

- MOC content generation: `buildMOCContent(notes: NoteInfo[]) => string`
- TOC extraction: `extractTOC(headings: HeadingCache[]) => string`
- Tag hierarchy builder: `buildTagHierarchy(tagMap: Map<string, string[]>) => TagNode[]`
- Folder rule evaluation: `shouldExcludePath(path: string, rules: ExclusionRule[]) => boolean`

This is where most of the correctness risk lives. Keep Obsidian-coupled code thin (just wiring API data into these functions).

**Layer 2 — Jest with jest-environment-obsidian (optional, limited)**

`jest-environment-obsidian` (community, npm: `jest-environment-obsidian`) mocks the Obsidian module so you can write Jest tests for code that imports from `obsidian`. However:
- Last release was v0.0.1 (April 2023) — work in progress, API coverage incomplete
- 8 GitHub stars as of research date — minimal community validation
- Requires Jest >= 29, Node >= 15

Verdict: Viable for testing Plugin lifecycle setup and settings save/load if you want coverage there. Not mature enough to rely on as the primary test strategy.

**Layer 3 — Manual testing in a test vault**

Unavoidable for integration testing. Keep a dedicated test vault with known structure (controlled folder layout, specific tags, predictable headings) to verify MOC/TOC output looks correct after each change.

### Testing stack recommendation

```
Vitest (pure logic)  — primary, run in CI
jest-environment-obsidian — optional, for lifecycle tests only
Manual test vault    — required for full integration
```

Install:
```bash
npm install -D vitest
# Optional:
npm install -D jest jest-environment-obsidian
```

---

## Manifest and Version Targeting

`manifest.json` fields that matter:

```json
{
  "id": "kb-manager",
  "name": "KB Manager",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Auto-maintains MOC files, TOC sections, and tag hierarchies",
  "author": "Your Name",
  "isDesktopOnly": false
}
```

`minAppVersion: "1.4.0"` is the recommended minimum:
- Frontmatter wikilinks (`cache.frontmatterLinks`) became available at 1.4.0
- The current sample plugin ships with `0.15.0` as minimum, but that predates frontmatterLinks
- The current Obsidian stable is well past 1.4.0; setting this floor loses almost no users

If you do not use `frontmatterLinks`, `0.15.0` is acceptable. Use `1.4.0` to safely query wikilinks in frontmatter properties without worrying about undefined.

`versions.json` maps plugin version → minimum Obsidian version:
```json
{
  "0.1.0": "1.4.0"
}
```

Update both files together when bumping versions. The `npm run version` script in the sample template automates this.

---

## What NOT to Use

| What | Why Not |
|------|---------|
| React / Svelte / Vue | Overkill for plugin UI; Obsidian's DOM helpers are sufficient; adds bundle weight; complicates esbuild externals |
| Rollup | Obsidian ecosystem standardized on esbuild; no benefit to switching |
| Vite | Designed for browser dev servers; esbuild is the right tool for plugin bundling where output is a single CJS file |
| Webpack | Slow, complex config, no advantage over esbuild here |
| `setInterval` directly | TypeScript will warn about Node vs browser type ambiguity; use `window.setInterval` wrapped in `registerInterval` |
| `app.metadataCache.getBacklinksForFile()` | Undocumented internal method; not in public API types; can break on Obsidian updates |
| Raw file parsing (regex on markdown) | MetadataCache already parses frontmatter, tags, links, headings; re-parsing is fragile and slow |
| External HTTP calls | Out of scope per PROJECT.md; also flagged during plugin submission review |
| `vault.read` + `vault.modify` (separate calls) | Race condition if vault changes between read and write; use `vault.process()` instead |
| Node.js `fs` module | Obsidian wraps fs in `vault` and `adapter`; direct fs access bypasses Obsidian's abstraction and breaks on mobile |

---

## Confidence Notes

| Claim | Confidence | Verification Status |
|-------|------------|---------------------|
| esbuild is official toolchain | HIGH | Verified against obsidianmd/obsidian-sample-plugin package.json and esbuild.config.mjs |
| tsconfig options | HIGH | Verified against raw tsconfig.json from official template |
| obsidian npm package version 1.12.3 | HIGH | Verified against npmjs.org registry |
| TypeScript version ^5.8.3 | HIGH | Verified against official template package.json |
| registerInterval pattern | HIGH | Verified in Context7 developer docs with code example |
| vault.process() atomicity guarantee | HIGH | Verified in Context7 API docs |
| MetadataCache.resolvedLinks for backlinks | HIGH | Verified via Context7; documented alternative to internal getBacklinksForFile |
| frontmatterLinks available since 1.4.0 | MEDIUM | Stated in community sources and API search results; not confirmed against official changelog |
| minAppVersion "1.4.0" recommendation | MEDIUM | Derived from frontmatterLinks availability claim; verify against Obsidian changelog before shipping |
| jest-environment-obsidian maturity | HIGH | Confirmed as low-maturity (v0.0.1, 8 stars, 2023 release) — do not rely on as primary test strategy |
| Node.js >=16 requirement | HIGH | Stated in official sample plugin README |
| Hot-reload plugin workflow | HIGH | Documented at docs.obsidian.md/Plugins/Development+workflow |

**Areas where training data may be stale (verify before building):**

1. `obsidian` npm package version — currently 1.12.3 at research time; run `npm view obsidian version` before starting
2. `esbuild` version in template — template pins exact versions; run `npm outdated` after `npm install` to check
3. `minAppVersion` floor — confirm 1.4.0 is still appropriate by checking the Obsidian changelog at obsidian.md for when frontmatterLinks shipped
4. `typescript-eslint` and `eslint-plugin-obsidianmd` versions — the plugin submission review checks for ESLint compliance; template versions are the safest baseline

---

## Sources

- [obsidian-sample-plugin package.json](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/package.json)
- [obsidian-sample-plugin esbuild.config.mjs](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/esbuild.config.mjs)
- [obsidian-sample-plugin tsconfig.json](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/tsconfig.json)
- [obsidian-sample-plugin README](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/README.md)
- [Obsidian Developer Docs — registerInterval](https://docs.obsidian.md/Reference/TypeScript+API/Component/registerInterval)
- [Obsidian Developer Docs — Manifest](https://docs.obsidian.md/Plugins/Manifest)
- [Obsidian Developer Docs — Submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)
- [pjeby/hot-reload](https://github.com/pjeby/hot-reload)
- [jest-environment-obsidian](https://github.com/obsidian-community/jest-environment-obsidian)
- [obsidian npm package](https://www.npmjs.com/package/obsidian)
- Context7 /obsidianmd/obsidian-developer-docs — MetadataCache, Vault, Plugin, ItemView, PluginSettingTab, registerInterval
