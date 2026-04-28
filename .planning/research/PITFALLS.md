# Pitfalls Research — Obsidian KB Manager Plugin

**Domain:** Obsidian plugin (file writing, background tasks, sidebar views, content injection)
**Researched:** 2026-04-28
**Overall confidence:** HIGH — most findings verified against official Obsidian developer documentation and confirmed across multiple forum discussions

---

## Critical Pitfalls (data loss / breaking)

### Pitfall 1: Using `adapter.write()` Instead of `vault.modify()`

**What goes wrong:** Writing files through `app.vault.adapter.write()` bypasses Obsidian's internal file watcher and in-memory cache. When a file grows larger than its previous size, Obsidian's file watcher can transiently overwrite the on-disk file with the stale in-memory cache (truncated to the old file size) before self-correcting in roughly 1–2 seconds. Any process that reads the file during that window — a sync client, an integration test, another plugin — gets the truncated data.

**Why it happens:** `adapter` is a low-level filesystem abstraction that does not notify Obsidian's vault event bus or update the in-memory cache. The vault event system only fires when you go through the `Vault` API layer.

**Consequences:** Partial file writes, silent data truncation, MetadataCache desynchronization (the cache now describes a file that no longer matches what is on disk).

**Prevention:**
- Always use `app.vault.modify(file, newContent)` for markdown files already tracked by Obsidian.
- Use `app.vault.process(file, fn)` (preferred over `modify` per the official reviewer checklist) for atomic read-modify-write, as it reduces the window for concurrent modification.
- Use `adapter.write()` only for plugin data files outside the vault (e.g., custom config blobs in `.obsidian/plugins/your-plugin/`).

**Detection:** Cache inconsistencies where `metadataCache.getFileCache()` returns stale headings/tags immediately after a write. External sync tools reporting file corruption or size regression.

**Phase to address:** Phase 1 (core file writing infrastructure). Every MOC write, TOC injection, and tag-hierarchy write in this plugin must go through `vault.modify` or `vault.process`.

---

### Pitfall 2: Concurrent / Unguarded Async Writes to the Same File

**What goes wrong:** Two async operations both read a file, independently compute a new version, then both call `vault.modify()`. The second write silently overwrites the first. This is the classic read-modify-write race.

**Why it happens:** `vault.modify()` is not atomic across two separate async call chains. JavaScript is single-threaded but async execution allows interleaving: `readA` → `readB` → `writeA` → `writeB`, where `writeB` clobbers `writeA`'s changes.

**Consequences:** Silent data loss. A MOC rebuild that fires while a TOC injection is mid-flight can drop the TOC entirely from the file, or vice versa.

**Prevention:**
- Use `vault.process(file, (content) => newContent)` — its callback is synchronous and Obsidian serializes calls to it per-file, making it the safest atomic primitive.
- For operations that need async work inside the transform, maintain a per-file serial promise queue (a `Map<string, Promise<void>>` keyed by file path). Chain each operation onto the previous promise for that file.
- Never read a file, do async work, then write back. All transformation logic must complete within the `vault.process` callback synchronously, or be pre-computed before entering the write.

**Detection:** MOC files that intermittently lose entries after background refresh. TOC sections that disappear after rapid consecutive saves.

**Phase to address:** Phase 1 before any concurrent operations are added. The background periodic updater (Phase 2) must serialize its writes through a queue.

---

### Pitfall 3: Overwriting User Content in Non-MOC Notes

**What goes wrong:** A TOC injection or inline MOC section update reads the whole file, regenerates a section, and calls `vault.modify()` with the rebuilt content — but miscalculates the section boundaries and replaces user-written paragraphs.

**Why it happens:** Naive string-splitting on headings is fragile. Users can write headings with the same text as the generated section header. Regex-based extraction can match the wrong block if the delimiter pattern appears in a code fence or block quote.

**Consequences:** Permanent data loss of user-written content. This is the highest-severity failure mode for this plugin.

**Prevention:**
- Use machine-readable delimiter comments that users are unlikely to type naturally. Example pattern:
  ```
  <!-- kb-manager:toc:start -->
  ...generated content...
  <!-- kb-manager:toc:end -->
  ```
- Never write to a note that does not already contain the start delimiter unless the user has explicitly requested injection for that note.
- Verify the end delimiter exists and comes after the start delimiter before any write. If the structure is malformed, skip the file and log a warning — never attempt a "best effort" fix that could eat content.
- For dedicated MOC files (files this plugin owns entirely), still use delimiters for any user-editable region you want to preserve.
- Store a hash of the last-generated block. If the hash at read time does not match, the user edited the section manually — treat this as a conflict and skip, not overwrite.

**Detection:** Reports of missing paragraphs after a plugin refresh. Section content replaced with a shorter block.

**Phase to address:** Phase 1 (TOC injection) and Phase 2 (MOC generation with inline sections). The delimiter contract must be defined and enforced before any file-writing feature ships.

---

### Pitfall 4: `vault.modify()` and `vault.process()` Silently Fail Within the requestSave Debounce Window

**What goes wrong:** When a user is actively editing a file, Obsidian queues a `requestSave` debounce. Neither `vault.modify()` nor `vault.process()` will successfully write to a file that has an in-flight `requestSave` — the call returns without error but the write is dropped.

**Why it happens:** Obsidian prevents external writes to a file the user is currently editing to avoid clobbering unsaved changes. The debounce window is approximately 2 seconds after the last keystroke.

**Consequences:** Silent data loss. The plugin thinks the write succeeded (no exception thrown) but the file is not updated. This is particularly dangerous for background periodic updates that fire while the user is typing.

**Prevention:**
- Never trigger file writes from events that fire during active editing (e.g., `vault.on('modify')` firing on every keystroke is the wrong trigger for a MOC rebuild).
- Background periodic updates are safer than event-driven updates precisely because they are less likely to hit the active-edit window — this matches the PROJECT.md architectural decision.
- When a write fails silently (can be detected by reading back and comparing), schedule a retry with a delay (`window.setTimeout`, registered via `registerInterval` or `register`).
- For TOC injection in particular: inject only on explicit user command or at a configurable idle interval, never within the debounce window of an active save.

**Detection:** Scheduled updates that appear to run (no errors in console) but the file does not change.

**Phase to address:** Phase 2 (background scheduler). Build retry logic and an active-edit guard from the start.

---

### Pitfall 5: Hardcoding `.obsidian` Config Path

**What goes wrong:** Plugin code references `.obsidian/plugins/...` or `.obsidian/data.json` with a hardcoded string. The plugin breaks for any user who has configured a custom config directory (Obsidian supports renaming this folder).

**Why it happens:** Developers assume `.obsidian` is fixed. It is not — `app.vault.configDir` is the correct accessor.

**Consequences:** Plugin fails to load settings, fails to find its own data files, or writes to a non-existent path.

**Prevention:** Always use `this.app.vault.configDir` (or `this.manifest.dir` for the plugin's own directory). Never hardcode `.obsidian`.

**Phase to address:** Phase 1. Settings persistence uses these paths from day one.

---

## Performance Pitfalls

### Pitfall 6: Blocking Work in `onload()`

**What goes wrong:** Vault indexing, reading all files, or building an initial cache inside `onload()` blocks Obsidian's startup sequence. The app waits for all plugin `onload()` calls to complete before rendering the workspace. Heavy synchronous work in `onload()` can add 10–30 seconds to vault open time.

**Warning signs:** Users report Obsidian "hanging" on the loading spinner. The Obsidian 1.7.1+ performance overlay (Settings → General → Advanced) shows your plugin consuming most startup time.

**Prevention:**
- Move all heavy operations into `this.app.workspace.onLayoutReady(() => { ... })`.
- `onload()` should only: register views, register commands, register event handlers, load settings. Nothing that iterates the vault.
- Do not `await` anything expensive in `onload()`. Use `onLayoutReady` as the async entry point for initialization.

**Phase to address:** Phase 1. Structure the plugin skeleton correctly from the start.

---

### Pitfall 7: Processing Every File on Every MetadataCache `changed` Event

**What goes wrong:** Subscribing to `metadataCache.on('changed', handler)` and rebuilding the full MOC/tag hierarchy in the handler fires on every single file save in the vault. A vault with 1,000 notes triggers 1,000 rebuild cycles. The handler blocks the event loop if it does synchronous work. Even if async, concurrent rebuilds queue up and compete.

**Warning signs:** CPU spike on every save. Background tasks queue growing without bound. UI stuttering during typing.

**Prevention:**
- Use background periodic interval updates (`registerInterval`) rather than event-driven rebuilds for full-vault operations. This is already the correct design decision in PROJECT.md.
- If fine-grained event hooks are used for incremental updates, debounce them: collect changed files for 2–5 seconds, then process the batch. Use a `Map<path, timeout>` pattern, not Obsidian's `debounce()` utility (which behaves like a throttle — see Pitfall 8).
- Never rebuild the entire MOC hierarchy because one file changed. Only recompute the affected MOC file.

**Phase to address:** Phase 2 (background scheduler and event handling strategy).

---

### Pitfall 8: Obsidian's `debounce()` Behaves Like a Throttle

**What goes wrong:** `debounce(fn, 500)` from the Obsidian API fires the function every 500ms if called continuously — it does not wait until calls stop. This is throttle behavior, not debounce behavior. A developer expecting "fire after the last call" gets "fire at interval" instead, which can cause runaway processing.

**Warning signs:** Functions fire much more frequently than expected. File I/O during rapid edits.

**Prevention:** Implement a manual debounce using `clearTimeout`/`setTimeout` patterns, or use the `async-mutex` npm package for serialization if bundled. Do not rely on Obsidian's `debounce()` for "wait until editing stops" semantics.

**Phase to address:** Phase 2 (anywhere debouncing is used in the background update system).

---

### Pitfall 9: Re-scanning the Entire Vault on Each Periodic Update

**What goes wrong:** The background timer reads every markdown file from disk on each tick, re-parses frontmatter, and rebuilds all MOC/TOC structures. On vaults with thousands of notes, this creates excessive I/O even when nothing has changed.

**Warning signs:** Disk I/O spikes every N minutes. `vault.read()` calls proportional to vault size on every tick. Mobile battery drain.

**Prevention:**
- Use `app.metadataCache` as the primary data source — it is already parsed and indexed by Obsidian. Only call `vault.read()` when you need the raw file content (i.e., for injection). For metadata (tags, links, headings), read from the cache.
- Maintain a dirty-file set. Register `metadataCache.on('changed')` to mark files as dirty. On each periodic tick, only process dirty files, then clear the set. This reduces per-tick work from O(vault-size) to O(changed-files-since-last-tick).
- Add a version hash per generated MOC file. Skip regeneration if the inputs (the cache data that feeds this MOC) have not changed since the last write.

**Phase to address:** Phase 2 (background scheduler architecture). Must be designed into the data flow from the start, not retrofitted.

---

## API Gotchas

### Gotcha 1: MetadataCache Is Not Synchronously Fresh After `vault.modify()`

**What happens:** Calling `app.metadataCache.getFileCache(file)` immediately after `vault.modify(file, newContent)` returns the *old* cache — the cache update is asynchronous. The sequence `write → read cache` does not work.

**The correct sequence:** Write with `vault.modify()`, then wait for `metadataCache.on('changed', handler)` to fire for that specific file before trusting the cache.

**Implication for this plugin:** After writing a MOC file, do not immediately re-read the cache to confirm the write. Use the next cache-changed event as the confirmation signal, or simply trust the write succeeded if `vault.modify()` resolved without error.

---

### Gotcha 2: `metadataCache.on('changed')` Does NOT Fire on File Rename

**What happens:** Renaming a file triggers `vault.on('rename')`, not `metadataCache.on('changed')`. If you only listen to the cache's `changed` event, renames are invisible. Links in your MOC that reference the old filename become stale silently.

**Prevention:** Register `this.registerEvent(this.app.vault.on('rename', handler))` in addition to cache change events. On rename, find all MOC files that reference the old path and schedule an update.

---

### Gotcha 3: MetadataCache `deleted` Event May Return `null` Cache

**What happens:** When a file is deleted, the `metadataCache.on('deleted')` callback receives a "best-effort previous cache" that may be `null` if the file was never successfully cached. Always null-check before accessing.

**Prevention:** Guard all delete-event handlers: `if (!prevCache) return;`. Use `vault.on('delete')` if you only need the `TFile` reference, not the cache.

---

### Gotcha 4: MetadataCache Event Sequence for Modified Files

**What happens:** When a markdown file is saved, the cache fires three events in order: `changed`, then `resolve`, then `resolved`. `changed` fires first but the link resolution (`resolvedLinks`, `unresolvedLinks`) is only updated after `resolved`. If you read `metadataCache.resolvedLinks[file.path]` in a `changed` handler, you get stale link data.

**Prevention:** For operations that depend on resolved links (cross-reference generation), listen to `resolve` or `resolved`, not `changed`.

---

### Gotcha 5: `app.fileManager.renameFile()` vs `vault.rename()` — Link Integrity

**What happens:** `vault.rename()` moves the file but does not update wikilinks pointing to the old path. `app.fileManager.renameFile()` performs the move AND updates all wikilinks across the vault. For a plugin that manages MOC files, using the wrong API when renaming a MOC leaves a broken link graph.

**Prevention:** Always use `app.fileManager.renameFile()` for user-facing file moves. Use `vault.rename()` only when you explicitly do not want link updates (rare).

---

### Gotcha 6: `app.vault.configDir` vs Hardcoded `.obsidian`

**What happens:** Obsidian lets users rename the config directory. `app.vault.configDir` returns the actual name. Hardcoding `.obsidian` breaks any non-default configuration.

**Prevention:** Always use `this.app.vault.configDir` and `this.manifest.dir` (for `<configDir>/plugins/<plugin-id>/`).

---

### Gotcha 7: `window.setInterval` Required, Not `setInterval`

**What happens:** Calling bare `setInterval` in an Obsidian plugin uses Node.js's `setInterval` (which returns a `NodeJS.Timer` object) instead of the browser's `setInterval` (which returns a `number`). TypeScript type errors ensue, and `registerInterval()` (which expects the browser return type) fails.

**Prevention:** Always call `window.setInterval(fn, ms)` and pass the result to `this.registerInterval()`. This is documented behavior and a common review comment.

---

### Gotcha 8: Views Must Be Registered Before `onLayoutReady`, Opened Inside It

**What happens:** Obsidian saves the workspace layout (which panels are open) between sessions. On restart, it tries to rehydrate views from the saved layout. If `registerView()` has not been called before layout restoration begins, `getLeavesOfType()` returns an empty array even though a leaf of that type exists in the saved layout — the view is "deferred" (a blank placeholder) and the plugin cannot interact with it.

**Additionally:** A confirmed bug as of early 2026 shows that even when calling `getLeavesOfType()` inside `onLayoutReady`, custom views from the saved layout are sometimes not detected in the callback.

**Prevention:**
- Call `this.registerView(VIEW_TYPE, (leaf) => new YourView(leaf))` in `onload()`, before `onLayoutReady`.
- Open the view (create a leaf if none exists) inside `onLayoutReady`, not `onload()`.
- Pattern: check `getLeavesOfType(VIEW_TYPE).length === 0` inside `onLayoutReady` and only create a new leaf if zero leaves exist. This prevents double-opening.
- Do not assume the view leaf exists on the first tick after `onLayoutReady`. Use `app.workspace.getLeavesOfType()` with a guard rather than caching the leaf reference at startup.

---

### Gotcha 9: `Events.trigger()` Is Synchronous — Async Handlers Are Fire-and-Forget

**What happens:** Obsidian's internal event system calls `trigger()` synchronously. If you pass an `async` function as an event handler, `trigger()` does not await it. Errors thrown inside the async handler are unhandled promise rejections. The event emitter has no mechanism to serialize or wait for async handlers.

**Prevention:**
- Event handlers that do async work (file writes, cache reads) must catch their own errors internally.
- Do not rely on the event trigger returning "after the handler finishes."
- Wrap async event handlers: `this.registerEvent(this.app.vault.on('modify', (file) => { this.handleModify(file).catch(e => console.error('modify handler failed', e)); }));`

---

## Plugin Review Gotfails

These are behaviors that cause rejection during Obsidian community plugin review (sourced from the official developer policies and submission review criteria).

### Hard Rejections (automatic failure)

| Issue | Reason | Fix |
|-------|---------|-----|
| Code obfuscation / minification | Reviewers cannot audit obfuscated code | Ship readable source; tree-shaking is fine, minification is not |
| Client-side telemetry | Privacy violation | Remove all analytics. This plugin has no network calls — keep it that way |
| Self-update mechanism | Bypasses Obsidian's update control | Use standard release process; Obsidian handles updates |
| Dynamic ads loaded from internet | Network asset policy | Not applicable to this plugin |
| `innerHTML` with unsanitized user input | XSS vulnerability | Use `createEl()` / `el.textContent` for user-facing content in sidebar view |
| Missing `LICENSE` file | Licensing requirement | Include a LICENSE at repo root |

### Code Quality Rejections (common review comments)

| Issue | Correct Pattern |
|-------|-----------------|
| Unhandled promises | Every `async` call must be awaited, use `.catch()`, or be explicitly voided with `void expr` |
| `console.log()` in production code | Only `console.warn()`, `console.error()`, `console.debug()` are permitted — remove all `console.log` |
| Hardcoded `.obsidian` path | Use `this.app.vault.configDir` |
| User-defined paths not normalized | Wrap all path strings with `normalizePath()` from the obsidian import |
| `global.app` usage | Use `this.app` — global app instance is an antipattern |
| Missing `onunload()` cleanup | Register all intervals/events/DOM listeners through `registerInterval()` / `registerEvent()` / `registerDomEvent()` |
| Template code left in from sample plugin | Remove all placeholder commands, icons, and settings from the sample template |
| Plugin ID duplicated in command IDs | Command IDs should not include the plugin ID as a prefix (Obsidian adds it automatically) |
| `isDesktopOnly` missing when Node.js APIs used | Set `"isDesktopOnly": true` in `manifest.json` if `require('fs')` or Electron APIs are used |
| Sentence case violations in UI | Button labels, settings headers: sentence case, not Title Case |

### Manifest Requirements

- `version` must match the Git tag (semantic versioning `x.y.z`)
- `description` max 250 characters, must end with a period
- Plugin ID must be unique, cannot contain "obsidian"
- Release assets must include: `main.js`, `manifest.json`, optionally `styles.css`

---

## Race Condition Risks

### Race 1: Multiple Background Ticks Overlapping

**Scenario:** Background timer fires every 5 minutes. First tick starts processing 500 files. Tick takes 6 minutes. Second tick fires before first finishes. Two concurrent full-rebuild passes run on the same files.

**Consequence:** Concurrent `vault.modify()` calls on the same MOC files. Both reads happen before either write, so the later write silently discards the first write's work.

**Mitigation:** Use a boolean `isRunning` flag or a mutex at the scheduler level. If a tick fires while the previous is still running, skip the new tick (or queue it to run once). Pattern:
```typescript
private isRefreshing = false;

private async runRefresh() {
  if (this.isRefreshing) return;
  this.isRefreshing = true;
  try {
    await this.doFullRefresh();
  } finally {
    this.isRefreshing = false;
  }
}
```

---

### Race 2: Manual Trigger + Background Timer Collision

**Scenario:** User clicks "Rebuild MOC" ribbon command while the background timer is mid-way through a refresh.

**Consequence:** Same as Race 1 — concurrent writes to the same files.

**Mitigation:** The manual trigger must check the same `isRefreshing` guard and either queue or return early with a user-visible notice ("Refresh already in progress").

---

### Race 3: File Write + Immediate Re-read for Downstream Processing

**Scenario:** Plugin writes MOC file A, then immediately reads MOC file A's cache to generate a cross-reference section in file B. The cache read returns the pre-write state.

**Consequence:** Cross-reference section in B is generated from stale data. On the next refresh it self-corrects, but the window creates a confusing temporary state.

**Mitigation:** Do not chain writes that depend on freshly-written cache data in the same tick. Either pre-compute all output before any writes begin (preferred: compute everything, write in batch), or wait for `metadataCache.on('changed')` to confirm cache freshness before downstream processing.

---

### Race 4: Event-Driven Update Firing During User Edit (requestSave Conflict)

**Scenario:** If any event-driven file writes are implemented (e.g., updating a MOC when a file is saved), the write fires within the 2-second requestSave debounce window of the user's save. The write silently fails.

**Consequence:** Plugin appears to work (no error) but file is not updated. On the next periodic background tick, the update finally lands.

**Mitigation:** For event-driven writes, implement a "write-with-retry" pattern: attempt the write, then schedule a verification read 3 seconds later. If the file does not reflect the write, retry once. For background periodic updates, this is less likely because the timer fires at long intervals unrelated to user keystrokes.

---

### Race 5: MetadataCache Read During Vault Startup / Indexing

**Scenario:** Plugin's `onLayoutReady` callback fires and immediately reads `metadataCache.getFileCache()` for all files. On cold vault open with a large vault, Obsidian may not have finished indexing all files yet. The cache returns `null` for recently-added or not-yet-indexed files.

**Consequence:** MOC generation misses notes that exist on disk but are not yet in the cache. If the plugin then writes MOC files based on this incomplete picture, it removes links to those notes.

**Mitigation:** Do not trigger a full rebuild immediately on `onLayoutReady`. Either wait for `metadataCache.on('resolved')` (fires when the initial full-vault resolution pass completes), or delay the first background tick by a grace period (30–60 seconds after layout ready). The first full rebuild should be explicitly triggered by the user or scheduled for the first background interval, not the startup event.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Phase 1: Core file writing | Pitfall 2 (concurrent writes) | Implement per-file serial queue using `vault.process` before any other feature |
| Phase 1: TOC injection | Pitfall 3 (overwriting user content) | Define and enforce delimiter contract in Phase 1; never ship without it |
| Phase 1: Plugin skeleton | Pitfall 6 (blocking onload) | Register only; all init deferred to `onLayoutReady` |
| Phase 1: Settings persistence | Pitfall 5 (hardcoded config path) | Use `this.manifest.dir` from day one |
| Phase 2: Background scheduler | Race 1 + Race 2 (concurrent ticks) | `isRefreshing` guard required before any async work begins |
| Phase 2: Background scheduler | Pitfall 7 (processing every file) | Dirty-file set + MetadataCache as primary source |
| Phase 2: Background scheduler | Pitfall 8 (Obsidian debounce is throttle) | Custom debounce implementation for any event-driven updates |
| Phase 2: Startup behavior | Race 5 (cache not ready at startup) | Delay first rebuild; wait for `resolved` event or use grace period |
| Phase 3: Sidebar view | Gotcha 8 (view not found on restart) | `registerView` in `onload`, open in `onLayoutReady`, guard with `getLeavesOfType` length check |
| Phase 3: Sidebar view | Gotcha 9 (async event handlers) | Wrap all async event handlers with `.catch()` |
| Phase 4: MOC generation | Pitfall 4 (requestSave window) | Background periodic only; retry-on-fail pattern for any event-triggered writes |
| Any: UI rendering | Plugin review: innerHTML XSS | Use `createEl()` API or `el.textContent`; never `innerHTML` with vault content |
| Release: Submission | Review gotfails | `normalizePath()` all paths, remove `console.log`, handle all promises, `window.setInterval` not `setInterval` |

---

## Sources

- Obsidian Forum: vault cache truncation after `adapter.write` — confirmed by multiple developers (MEDIUM confidence — forum thread, consistent with API design)
- Obsidian Developer Documentation DeepWiki: plugin development lifecycle, cleanup patterns, `registerEvent`/`registerInterval`/`registerDomEvent` (HIGH confidence)
- Obsidian Developer Policies (via DeepWiki 5.1): prohibited behaviors, required disclosures, rejection triggers (HIGH confidence)
- Obsidian Submission & Review Process (via DeepWiki 5.2): code quality requirements, reviewer checklist items (HIGH confidence)
- Obsidian Forum: `vault.process` and `vault.modify` blocked by `requestSave` debounce (MEDIUM confidence — confirmed forum report, November 2025)
- Obsidian Forum: Obsidian `debounce()` behaves as throttle (MEDIUM confidence — forum discussion, consistent with reported behavior)
- Obsidian Forum: custom views not detected in `onLayoutReady` callback on restart (MEDIUM confidence — confirmed March 2026 bug report)
- Obsidian Forum: MetadataCache `changed` event does not fire on rename (HIGH confidence — documented behavior)
- Obsidian Forum: `Events.trigger()` is synchronous, async handlers are fire-and-forget (HIGH confidence — confirmed by API design)
- Obsidian API: `metadataCache.on('deleted')` may return null (HIGH confidence — official type definitions)
- Obsidian Forum: MetadataCache event sequence: `changed` → `resolve` → `resolved` (MEDIUM confidence — community-confirmed behavior)
- Obsidian Developer Forum: `window.setInterval` required over bare `setInterval` (HIGH confidence — official documentation pattern)
- Obsidian Developer Forum: `app.fileManager.renameFile()` vs `vault.rename()` for link integrity (HIGH confidence — documented API difference)
