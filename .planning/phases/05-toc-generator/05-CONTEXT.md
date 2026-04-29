# Phase 5: TOC Generator - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate two distinct TOC artifacts from VaultIndex heading data: (1) per-note inline TOC
sections injected into user notes via the `kb-manager:toc` delimiter pair, and (2)
section-level `INDEX.md` files per folder listing all notes-with-headings and their h1
titles. Per-note TOC filters to heading levels h1-h3. Both follow the same
`vault.process()` write pattern and `kb-managed: true` frontmatter convention as Phase 4.

Requirements in scope: TOC-01, TOC-02, TOC-03, TOC-04, TOC-05

</domain>

<decisions>
## Implementation Decisions

### Per-note TOC body format (TOC-01, TOC-03, TOC-05)
- **D-01:** Per-note TOC depth filter: **h1-h3 only**. Headings at h4-h6 are excluded. Hard-coded
  in `src/lib/toc-builder.ts` as `MAX_TOC_DEPTH = 3`. No setting in v1 — open as v2 enhancement.
- **D-02:** TOC items are bullet wikilinks with heading anchor: `- [[<note-basename>#<heading-text>]]`.
  Format from TOC-03 requirement. The basename is extracted from the file path same way as
  Phase 4's `moc-builder.ts`.
- **D-03:** TOC items indent by heading level — h1 = no indent, h2 = 2-space indent, h3 = 4-space
  indent. Produces visual hierarchy in markdown:
  ```
  - [[note#Top]]
    - [[note#Sub-section]]
      - [[note#Detail]]
  ```
- **D-04:** Heading text in the anchor is the EXACT text from `HeadingRecord.text` (Phase 2 D-01),
  unmodified. Obsidian's link resolver handles spaces, casing, and special characters via its
  own normalization. No manual escape needed.
- **D-05:** Notes with zero headings (empty `getheadings(filePath)`) are SKIPPED entirely (TOC-05).
  No empty TOC section is inserted; if delimiters exist already, the section between them is
  replaced with a single placeholder line `<!-- no headings -->` so the file isn't left with
  stale heading content from a prior rebuild.
- **D-06:** Notes whose headings are all h4+ (none in h1-h3) are treated the same as zero-heading
  notes per D-05 — TOC body would be empty after filtering, so the placeholder is emitted instead.

### Per-note TOC injection (TOC-01, TOC-02)
- **D-07:** Per-note TOC inline injection: only into files that ALREADY contain both
  `<!-- kb-manager:toc:start -->` and `<!-- kb-manager:toc:end -->` delimiters and pass
  `isWriteSafe(content, 'toc')`. No auto-append behavior for TOC — unlike MOC inline auto-inject
  (Phase 4 D-14, D-15), TOC is purely opt-in per note. Rationale: TOC is more localized than MOC;
  user explicitly chooses where they want one.
- **D-08:** "Insert TOC here" command (TOC-02): identical UX pattern to MOC-05 (Phase 4 D-13).
  Inserts both delimiters with `<!-- pending rebuild -->` placeholder at cursor. Idempotent —
  shows Notice "KB Manager: TOC delimiters already present" and does nothing if `isWriteSafe`
  returns true. Command id: `kb-manager-insert-toc`. Command name: `KB Manager: Insert TOC here`.
- **D-09:** Per-note TOC injection runs serially across all .md files in the vault (not just
  the active file) on every rebuild. The TocGenerator filters by "has both delimiters" before
  attempting any write — files without delimiters are silently skipped (FOUND-05). This means
  per-note TOC ignores per-folder rules; it's purely delimiter-driven.

### Section-level INDEX.md (TOC-04)
- **D-10:** Per-folder index file is named exactly `INDEX.md` (separate from `MOC.md`). Located
  at `{folder-path}/INDEX.md`. Vault root → `INDEX.md` at root.
- **D-11:** INDEX.md frontmatter uses the `kb-managed: true` convention shared with MOC.md
  (Phase 4 D-08), but with `kb-type: index`:
  ```yaml
  ---
  kb-managed: true
  kb-type: index
  kb-folder: notes/projects
  ---
  ```
  The `kb-managed: true` flag means MocGenerator (Phase 4) and TocGenerator both filter
  INDEX.md out of their listings (Phase 4 D-22 already does this for any kb-managed file).
- **D-12:** INDEX.md body format: `# INDEX: {folder-path}` h1 (or `# INDEX: vault root` for
  root), blank line, then a `## Notes` h2 section listing each non-excluded note in the folder
  that HAS at least one h1 heading:
  ```markdown
  ## Notes

  ### note-basename
  - [[note-basename#first h1]]
  - [[note-basename#second h1]]
  ```
  Each note becomes an `### h3` heading by basename, with bullet items for each h1 in that
  note.
- **D-13:** Section-level INDEX is generated for **every non-excluded folder** with at least
  one note-with-h1-headings. Folders with no eligible notes get NO INDEX.md (analogous to
  Phase 4 MocGenerator behavior on empty folders is to still write — but here we skip to
  avoid empty index files).
- **D-14:** INDEX.md scope is **first-level (h1) only** per note. Sub-headings inside notes
  are NOT enumerated in the section index — they live in each note's per-note TOC instead.
  This keeps INDEX.md from sprawling on folders with many notes.
- **D-15:** Notes whose headings are all h2+ (no h1) appear with no bullets — just the `### note-basename`
  heading and a placeholder `_(no h1 headings)_` italic line. Keeps every note in the folder
  visible in the index even if it lacks h1.
- **D-16:** INDEX.md overwrite policy mirrors Phase 4 D-10: existing file with
  `kb-managed: true` frontmatter → safely overwrite via `vault.process()`. Existing file
  without that frontmatter (user-authored INDEX.md) → skip + `console.warn` once per session.
- **D-17:** Like MocGenerator, TocGenerator NEVER writes inside excluded paths and does not
  list excluded files (uses `isExcluded` from Phase 1).

### Trigger / Lifecycle
- **D-18:** TocGenerator runs after MocGenerator on every rebuild. The `onRebuildComplete`
  callback in `main.ts` (set up in Phase 4 Plan 04-03) is extended to call
  `await this.mocGenerator.run(); await this.tocGenerator.run();` serially. Order matters
  only insofar as both write under `vault.process()` — running them serially prevents
  concurrent process() calls on the same file (e.g., a note that has both inline MOC and
  inline TOC delimiters).
- **D-19:** TocGenerator runs serially across files within itself, same pattern as Phase 4
  MocGenerator (D-20). No parallelism in v1.
- **D-20:** TocGenerator implements TWO public methods: `runPerNoteToc()` and
  `runSectionIndex()`. The orchestrator method `run()` calls them in order:
  per-note TOC injection first (file-by-file), then section-level INDEX.md per folder.

### Skip Conditions (echoes Phase 4 D-22)
- **D-21:** Files NEVER processed by TocGenerator: (a) excluded by `isExcluded()`, (b) the
  `MOC.md` and `INDEX.md` files themselves (filtered by basename + kb-managed frontmatter),
  (c) any file whose frontmatter has `kb-managed: true`.

### Claude's Discretion
- Class layout: monolithic `TocGenerator` vs split (`PerNoteTocWriter` + `SectionIndexWriter`).
  Inline is acceptable per file size limit.
- Pure-logic split inside `src/lib/`: one `toc-builder.ts` covering both per-note TOC and
  INDEX.md body generation, OR separate `toc-builder.ts` + `index-builder.ts`. One file is
  acceptable for ~150 lines.
- Whether INDEX.md frontmatter should also include a `notes-count` field for diagnostics
  — skip in v1; not required.
- Notice text on "Insert TOC here" success vs silent — silent (matches Phase 4 D-13).
- Whether to fold MocGenerator + TocGenerator into a single GeneratorRunner with an array of
  generators — possible refactor but premature with only two; revisit at Phase 7.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` §TOC Generation — TOC-01..05 full requirement text
- `.planning/ROADMAP.md` §Phase 5 — Success criteria (4 criteria that must be TRUE)

### Project Rules (MANDATORY)
- `CLAUDE.md` §Critical Obsidian Plugin Rules — `vault.process()`, delimiter contract, no `console.log`, `normalizePath()`
- `CLAUDE.md` §File Size Limits — Functions <30, Files <300, Nesting <3

### Prior Phase Decisions
- `.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md` §Write Safety
  (D-12, D-13, D-14): delimiter contract supports `'toc'` type via `delimiter.ts`
- `.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md` §VaultIndex API (D-10):
  `getheadings(filePath)`, `getFilesInFolder(folderPath)`, `getAllFolders()` query methods
  consumed by TocGenerator. `onRebuildComplete` callback (D-11) extended in Plan 05-03.
- `.planning/phases/04-moc-generator/04-CONTEXT.md` §Lifecycle (D-19..D-21) and §File Skip (D-22):
  TocGenerator follows the same lifecycle and skip rules. INDEX.md MUST be filtered out of
  MOC listings — covered automatically since `kb-managed: true` flag is the filter Phase 4 D-22 uses.

### Existing Code (consumed by Phase 5)
- `src/lib/delimiter.ts` — already supports `'toc'` as a `DelimiterType`. `buildDelimiter('toc', 'start'|'end')`,
  `isWriteSafe(content, 'toc')`, `replaceDelimitedSection(content, 'toc', newSection)` all reusable
- `src/lib/exclusions.ts` — `isExcluded(filePath, patterns)`
- `src/lib/vault-index-types.ts` — `HeadingRecord`, `FileRecord` types
- `src/VaultIndex.ts` — `getheadings()`, `getFilesInFolder()`, `getAllFolders()` queries
- `src/MocGenerator.ts` — closest analog for TocGenerator class structure (Phase 4 Plan 04-02)
- `src/lib/moc-builder.ts` — closest analog for `toc-builder.ts` pure-logic structure (Phase 4 Plan 04-01)
- `src/main.ts` — Phase 3 + 4 already wired; this phase adds TocGenerator instantiation,
  extends `onRebuildComplete` to call both generators, registers `kb-manager-insert-toc` command

### Obsidian API surfaces used
- `app.vault.process(file, fn)` — atomic per-file write
- `app.vault.create(path, content)` — for new INDEX.md files
- `app.vault.getAbstractFileByPath(path)` — file existence + TFile cast
- `app.metadataCache.getFileCache(file).frontmatter` — read kb-managed flag
- `Plugin.addCommand({editorCallback})` — Insert TOC here
- `Editor.replaceRange()`, `Editor.getCursor()` — cursor-position insertion
- `MarkdownView.file` — active file context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `delimiter.ts` already lists `'toc'` in `VALID_TYPES` — no changes needed; `isWriteSafe(content, 'toc')`,
  `replaceDelimitedSection(content, 'toc', body)`, `buildDelimiter('toc', 'start'|'end')` all work.
- `MocGenerator.ts` `isKbManaged(file)` private method — TocGenerator implements the same check.
  Could be extracted to a shared helper later (Claude's Discretion).
- `moc-builder.ts` `basename()` helper — TocGenerator's pure module needs the same util.
  Re-implement (small) or export it from moc-builder. Re-implementing is fine since
  toc-builder is a separate file.
- `VaultIndex.getheadings(filePath)` returns `HeadingRecord[]` already filtered to
  the file's headings. Phase 5 just consumes — no VaultIndex changes.

### Established Patterns
- Pure-logic + Obsidian-coupled split: `src/lib/toc-builder.ts` (no Obsidian imports,
  Vitest-testable) + `src/TocGenerator.ts` (Obsidian-coupled, vault.process). Mirrors
  Phase 4 split exactly.
- Constructor injection: `TocGenerator(app, index, settings)` — same shape as MocGenerator.
- Frontmatter convention: `kb-managed: true` + `kb-type: <moc|index>` + `kb-folder: <path>`.
  TocGenerator emits `kb-type: index` for INDEX.md.

### Integration Points
- `main.ts onload()`: instantiate `this.tocGenerator = new TocGenerator(this.app, this.index, this.settings)`
  AFTER `this.mocGenerator = new MocGenerator(...)`.
- `main.ts onLayoutReady` callback: extend the `onRebuildComplete` handler from Plan 04-03 to:
  ```typescript
  this.index.onRebuildComplete = () => {
    this.runGenerators().catch(err => console.error('KB Manager: generators failed', err));
  };
  ```
  with a private `runGenerators()` helper that awaits `mocGenerator.run()` then `tocGenerator.run()`.
- `main.ts onLayoutReady` `.finally(...)`: register `kb-manager-insert-toc` command alongside
  `kb-manager-insert-moc`. The two share an `insertSectionAtCursor(editor, view, type)` helper
  to deduplicate logic.

</code_context>

<specifics>
## Specific Details

### Sample per-note TOC content (h1-h3 filter, indented)
For a note with headings: `# Intro` (h1), `## Background` (h2), `### Detail` (h3),
`#### Skipped` (h4):
```markdown
- [[note-basename#Intro]]
  - [[note-basename#Background]]
    - [[note-basename#Detail]]
```

### Sample INDEX.md content for folder `notes/projects` with two notes (alpha-spec.md has h1 "Alpha Plan"; status.md has h1 "Status"; missing.md has only h2 headings)
```markdown
---
kb-managed: true
kb-type: index
kb-folder: notes/projects
---

# INDEX: notes/projects

## Notes

### alpha-spec
- [[alpha-spec#Alpha Plan]]

### missing
_(no h1 headings)_

### status
- [[status#Status]]
```

Note: notes sorted alphabetically by basename (D-05 from Phase 4 sort rule applies analogously).

### Empty / placeholder handling
- Per-note TOC with zero h1-h3 headings → body is `<!-- no headings -->` (single line),
  not empty between delimiters.
- INDEX.md body when folder has no notes-with-headings AT ALL → INDEX.md is NOT written
  (D-13 skip). When some notes lack h1 → those notes appear with the italic placeholder (D-15).

### Vitest coverage planned for `toc-builder.ts`
- buildPerNoteTocBody: empty headings, h1-only, h1+h2+h3 nested, h1+h4+h5 (filter to h1 only),
  all-h4-or-deeper (returns the `<!-- no headings -->` placeholder), heading text with special
  chars (round-trip preserved unmodified).
- buildIndexFile: folder with notes-having-h1, folder with notes-no-h1, mixed, vault-root
  ('') folder name, frontmatter format.
- DEDICATED_FRONTMATTER_KEYS analog (`INDEX_FRONTMATTER_KEYS`) deepEquals expected list.

### Insert TOC command id
- Command id: `kb-manager-insert-toc`
- Command name: `KB Manager: Insert TOC here`

</specifics>

<deferred>
## Deferred Ideas

- Configurable per-note TOC depth (`tocMaxDepth: 1-6` setting). v2.
- TOC link auto-update when headings are renamed (currently relies on next rebuild).
  Obsidian normally updates `[[note#heading]]` links via metadata cache; v1 doesn't intervene.
- INDEX.md showing subfolder navigation tree (parent → child folder breadcrumb). v2.
- Per-folder rule for INDEX generation (e.g., skip INDEX in folders with `noindex: true`
  flag). v2.
- Sub-heading enumeration in INDEX.md (currently h1-only per D-14). Enable via setting in v2.

</deferred>

---

*Phase: 5-TOC Generator*
*Context gathered: 2026-04-29*
