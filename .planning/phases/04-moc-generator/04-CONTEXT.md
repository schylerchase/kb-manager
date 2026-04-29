# Phase 4: MOC Generator - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate Map of Content files for the vault. Two output modes per folder: dedicated `MOC.md`
files (default) or inline MOC sections inside user notes. Both use a tag-tree-hierarchy body
format with nested markdown headings. Triggered after every VaultIndex rebuild via
`onRebuildComplete`. All writes go through `vault.process()` and respect the delimiter
contract from Phase 1 and the per-folder rules from settings.

Requirements in scope: MOC-01, MOC-02, MOC-03, MOC-04, MOC-05, MOC-06, MOC-07, MOC-08

</domain>

<decisions>
## Implementation Decisions

### MOC Body Format (MOC-01, MOC-02)
- **D-01:** MOC body = **tag-tree hierarchy with nested markdown headings**. Each top-level tag becomes
  an `## h2` section; sub-tags become `### h3` (and `#### h4`, `##### h5` for deeper nesting).
  Files at each tag level appear as bullet wikilinks under that heading. After all tag sections,
  a final `## Untagged` section lists files with zero tags.
- **D-02:** Notes with multiple tags appear **once under each tag's heading**. Duplication is
  intentional — user sees the same note under each topical lens. Acceptable cost: the file is
  scanned multiple times but the tag tree already groups by tag (Phase 2 D-04).
- **D-03:** Tags deeper than h6 (5+ slash segments — `#a/b/c/d/e/f`) clamp at `###### h6`. Obsidian
  doesn't render h7+. Edge case; users with that depth will see flat structure beyond h6.
- **D-04:** Files appear as bullet items: `- [[note-basename]]` (one per line). No bold, no
  metadata, no first-heading preview — keeps MOC scan-friendly.
- **D-05:** Within each tag heading, files sort **alphabetically by basename** (case-insensitive).
  Stable order across rebuilds.

### Wikilink Format (MOC-08)
- **D-06:** Wikilinks use **basename only**: `[[note-name]]` (no path, no alias). Obsidian's link
  resolver handles same-name disambiguation via shortest-unique-path automatically. Vaults
  without name collisions get the cleanest output. MOC-08 example matches.

### Dedicated MOC.md Files (MOC-01, MOC-03)
- **D-07:** Generated MOC.md per folder is named exactly `MOC.md` (control, no underscore prefix
  or suffix). Located at `{folder-path}/MOC.md`. Folder=`''` (vault root) gets `MOC.md` at vault root.
- **D-08:** Frontmatter on every dedicated MOC.md:
  ```yaml
  ---
  kb-managed: true
  kb-type: moc
  kb-folder: notes/projects
  ---
  ```
  `kb-managed: true` is the safety carr — fallback used by all overwrite logic. `kb-type` is for
  forward compatibility with TOC/section-index files (Phase 5). `kb-folder` records the
  source folder for diagnostics.
- **D-09:** Body format: `# MOC: {folder-path}` h1 title (or `# MOC: vault root` for root),
  blank line, then the tag-tree body from D-01. The MOC.md file itself is excluded from
  its own listings (filtered out in the file gather step).
- **D-10:** Overwrite policy: when a file at `{folder}/MOC.md` exists AND its frontmatter
  contains `kb-managed: true`, plugin safely overwrites the entire file via `vault.process()`.
  When `kb-managed: true` is ABSENT (user's own MOC.md predating plugin install), plugin
  skips the file and logs `console.warn` once per session — never destroys user content.

### Inline MOC Injection (MOC-04, MOC-05, MOC-06)
- **D-11:** Inline injection delimiters: `<!-- kb-manager:moc:start -->` / `<!-- kb-manager:moc:end -->`
  (already established in Phase 1 D-13, and `delimiter.ts` already handles this type).
- **D-12:** Body inserted between delimiters is the SAME tag-tree hierarchy from D-01..D-05,
  but WITHOUT the `# MOC: …` h1 (the host note has its own h1). Heading levels stay at
  `## h2` for top-level tags so the section nests under the host note's h1.
- **D-13:** "Insert MOC here" command (MOC-05) acts on the active editor at cursor position:
  inserts both delimiters AND a one-line placeholder between them (`<!-- pending rebuild -->`)
  at the cursor; the next rebuild fills in actual content. If the active note already has
  the delimiters, command shows a Notice "MOC delimiters already present" and does nothing.
  Idempotent.
- **D-14:** Auto-injection (MOC-06) for folders set to `inline` is GATED by the global
  `autoInject: boolean` setting (Phase 1 D-07; defaults `false`). Behavior matrix:
  - `folder rule = inline` AND `autoInject = true` → plugin appends `\n\n<!-- kb-manager:moc:start -->\n<!-- kb-manager:moc:end -->\n`
    to every non-excluded `.md` file in the folder that doesn't already have the delimiters,
    then populates them on this and every subsequent rebuild.
  - `folder rule = inline` AND `autoInject = false` → plugin only injects into files that
    ALREADY have the delimiters (user-added via "Insert MOC here" or hand-typed).
    No auto-append happens. Files without delimiters are silently skipped (FOUND-05).
  - `folder rule = dedicated` → plugin generates `MOC.md` (D-07..D-10). Inline injection
    NEVER happens for files in `dedicated` folders, even if those files contain delimiters.
- **D-15:** Append-delimiters write (D-14 first sub-bullet) is itself a `vault.process()` write
  but is NOT bounded by existing delimiters — it's a one-time additive write. The append
  is gated on a `isWriteSafe()`-like absence check (delimiters NOT already present) AND
  the global `autoInject` flag. Once delimiters are appended, all subsequent writes use
  `replaceDelimitedSection()` and respect FOUND-04/FOUND-05.

### Per-Folder Format (MOC-07)
- **D-16:** Resolution order for a folder's MOC format:
  1. Lookup `settings.folderRules[folderPath]` — if `'inline'` or `'dedicated'`, use it.
  2. Else use `settings.defaultMocFormat` (Phase 1 D-08; defaults `'dedicated'`).
- **D-17:** When folder rule = `inline`, plugin does NOT generate a `MOC.md` file in that
  folder. Inline-injected notes ARE the MOC for that folder. Avoids duplicate sources of
  truth.
- **D-18:** Excluded paths (Phase 1 D-04) are NEVER touched: no MOC.md created, no inline
  injection attempted, files in excluded folders not listed in any parent MOC.

### Trigger / Lifecycle
- **D-19:** MocGenerator runs after every VaultIndex rebuild via the `onRebuildComplete`
  callback (Phase 2 D-11). One generator instance lives on the plugin (`this.mocGenerator`),
  created during `onload()` after VaultIndex.
- **D-20:** MocGenerator runs SERIALLY through folders within a single rebuild — not parallel.
  Avoids `vault.process()` contention on the same file (e.g., a folder's `MOC.md` and a
  parent folder's `MOC.md` listing it). Performance: write throughput is the bottleneck
  on real vaults; serial keeps mental model simple.
- **D-21:** MocGenerator respects the rebuild mutex from Phase 3 implicitly: it runs from
  `onRebuildComplete` which fires AFTER the lock releases, so no nested-lock concerns.

### File Skip Conditions
- **D-22:** Files NEVER listed in any MOC: (a) excluded by `isExcluded()`, (b) the `MOC.md`
  files themselves (filtered by frontmatter `kb-managed: true` OR by basename `MOC.md`),
  (c) any file whose frontmatter contains `kb-managed: true` (forward-compat — TOC index
  files in Phase 5 will also have this flag).

### Claude's Discretion
- Class layout: monolithic `MocGenerator` class vs split (`DedicatedMocWriter` + `InlineMocWriter`).
  Inline-vs-monolithic is a judgement call per file size limit (300 lines).
- Pure-logic split inside `src/lib/`: one `moc-builder.ts` containing all markdown generation
  vs separate `moc-body.ts` + `moc-file.ts`. One file is fine for ~150 lines.
- Notice text on "Insert MOC here" success vs silent. Lean toward silent — user sees the
  delimiters appear in their note immediately.
- Whether MocGenerator caches the previous tag-tree markdown per folder to skip writes when
  unchanged — performance optimization, not required for correctness. Skip in v1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` §MOC Generation — MOC-01..08 full requirement text
- `.planning/ROADMAP.md` §Phase 4 — Success criteria (5 criteria that must be TRUE)
- `.planning/PROJECT.md` — Core value (vault structure stays accurate without manual work)

### Project Rules (MANDATORY)
- `CLAUDE.md` §Critical Obsidian Plugin Rules — `vault.process()` for ALL writes (no `adapter.write()`,
  no separate read+modify), delimiter contract, no `console.log`, `normalizePath()` for user paths
- `CLAUDE.md` §File Size Limits — Functions <30 lines, Files <300 lines, Nesting max 3

### Prior Phase Decisions
- `.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md` §Write Safety
  (D-12, D-13, D-14): delimiter contract, `isWriteSafe()`, exclusion semantics
- `.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md` §Default Settings
  (D-07): `autoInject: false` default
- `.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md` §VaultIndex API (D-10):
  `getFilesInFolder()`, `getFilesWithTag()`, `getAllFolders()`, `getTagTree()` query methods
  + `onRebuildComplete` callback (D-11) consumed by MocGenerator

### Existing Code (consumed by Phase 4)
- `src/lib/delimiter.ts` — `buildDelimiter('moc', 'start'|'end')`, `isWriteSafe(content, 'moc')`,
  `replaceDelimitedSection(content, 'moc', newSection)`. Phase 4 calls all three.
- `src/lib/exclusions.ts` — `isExcluded(filePath, patterns)` for skip checks
- `src/lib/vault-index-types.ts` — `FileRecord`, `FolderRecord`, `TagNode` types
- `src/VaultIndex.ts` — query methods listed above; `onRebuildComplete` callback hook
- `src/settings.ts` — `KBManagerSettings` (`autoInject`, `folderRules`, `defaultMocFormat`,
  `excludedPaths`)
- `src/main.ts` — Phase 3 added `runWithLock`, status bar; Phase 4 adds MocGenerator wiring
  inside `onLayoutReady` and `onRebuildComplete` callback registration

### Obsidian API surfaces used in this phase
- `app.vault.process(file, fn)` — atomic read-modify-write per file
- `app.vault.getAbstractFileByPath(path)`, `app.vault.create(path, content)` — for new MOC.md files
- `app.metadataCache.getFileCache(file).frontmatter` — read frontmatter to check `kb-managed`
- `Plugin.addCommand({editorCallback})` — "Insert MOC here" needs editor context
- `Editor.replaceRange()` — insert delimiters at cursor

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `delimiter.ts` already supports `'moc'` as a `DelimiterType`. `replaceDelimitedSection`
  is the safe in-place update primitive — call it inside `vault.process()` callback.
- `tag-utils.ts` `buildTagTree` produces the exact data shape MocGenerator needs to walk.
- `VaultIndex.getFilesInFolder()` returns `FileRecord[]` with `tags` already normalized.
- `VaultIndex.onRebuildComplete` callback already exists; Phase 4 sets
  `this.index.onRebuildComplete = () => this.mocGenerator.run()`.

### Established Patterns
- Pure-logic + Obsidian-coupled split: markdown body builders go in `src/lib/moc-builder.ts`
  (no Obsidian imports, Vitest-testable). The `MocGenerator` class in `src/MocGenerator.ts`
  imports and orchestrates. Same pattern as Phase 2 (`tag-utils.ts` + `VaultIndex.ts`).
- Constructor injection: MocGenerator receives `(app, vault, index, settings)` references.
- All writes inside `vault.process()` callback returning the new full content.

### Integration Points
- `main.ts onload()` after `new VaultIndex(...)`: add `this.mocGenerator = new MocGenerator(this.app, this.index, this.settings)`.
- `main.ts onLayoutReady` callback: after `this.runWithLock(...)`, set `this.index.onRebuildComplete = () => this.mocGenerator.run()` BEFORE the initial rebuild fires (so the first rebuild also triggers MOC generation).
- `main.ts onLayoutReady` callback: register the `kb-manager-insert-moc` editor command.
- Phase 5 will follow the same pattern with `TocGenerator` — keep MocGenerator's interface
  small and consistent.

</code_context>

<specifics>
## Specific Details

### Sample dedicated `MOC.md` content for folder `notes/projects` with files tagged `project/alpha`, `project/beta`, and one untagged
```markdown
---
kb-managed: true
kb-type: moc
kb-folder: notes/projects
---

# MOC: notes/projects

## project
### alpha
- [[alpha-spec]]
- [[alpha-status]]
### beta
- [[beta-spec]]

## Untagged
- [[untitled-thought]]
```

### Sample inline MOC section inside a user note
```markdown
# My Project Hub

Some user prose.

<!-- kb-manager:moc:start -->
## project
### alpha
- [[alpha-spec]]
### beta
- [[beta-spec]]

## Untagged
- [[untitled-thought]]
<!-- kb-manager:moc:end -->

More user prose.
```

### Frontmatter parse strategy
- Use `app.metadataCache.getFileCache(file)?.frontmatter?.['kb-managed']` to read the flag.
  No raw YAML parsing — MetadataCache already exposes parsed frontmatter as an object.
- For NEW MOC.md creation, write the frontmatter as a plain string template (4-line YAML block).
  No YAML serializer dependency.

### "Insert MOC here" command id
- Command id: `kb-manager-insert-moc`
- Command name: `KB Manager: Insert MOC here`
- `editorCallback: (editor, view) => { ... }` — has access to the active note + cursor.

### Auto-inject append snippet
```
\n\n<!-- kb-manager:moc:start -->\n<!-- kb-manager:moc:end -->\n
```
- Always two leading newlines to ensure separation from prior content.
- Trailing newline so subsequent appends (Phase 5 TOC) don't run together.

### Vitest coverage
- `moc-builder.ts` body generation: empty input, single tag, nested tags, multi-tag files,
  untagged section, h6 clamp at 5+ slash depth, basename collision (Obsidian handles, but
  test that we always emit basename).
- `moc-builder.ts` frontmatter+full file generation: round-trip with `replaceDelimitedSection`.

</specifics>

<deferred>
## Deferred Ideas

- **MOC body customization (templating)**: user-supplied template per folder. v2.
- **First-heading preview as item description**: `- [[note]] — first h1 text`. v2.
- **Per-MOC frontmatter `kb-generated: 2026-04-29T…`**: timestamp tracking. Useful for
  diagnostics but out of scope for v1.
- **Configurable wikilink format** (toggle path vs basename in settings). Defer until
  user reports a name-collision pain point. v2.
- **MOC sort order setting** (alphabetical vs creation-date vs last-modified). v2.

</deferred>

---

*Phase: 4-MOC Generator*
*Context gathered: 2026-04-29*
