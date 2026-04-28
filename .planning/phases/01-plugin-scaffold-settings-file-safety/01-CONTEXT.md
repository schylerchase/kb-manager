# Phase 1: Plugin Scaffold + Settings + File Safety - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Plugin loads cleanly in Obsidian, settings persist across restarts, and write-safety contracts (delimiter pattern + exclusion rules) are validated before any file-writing feature ships. No vault writes happen in Phase 1 — this phase establishes the scaffold, settings schema, and safety validators that all downstream phases depend on.

Requirements in scope: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, SET-01, SET-02, SET-03, SET-04

</domain>

<decisions>
## Implementation Decisions

### Exclusion Pattern Matching (FOUND-03, SET-02)
- **D-01:** Pattern format is simple name/prefix matching — no wildcard syntax, no external library. Users type plain folder or file names (e.g., `templates`, `archive`).
- **D-02:** A pattern matches if it appears as any path segment in the full vault-relative path. `templates` excludes `/notes/templates/foo.md` AND `/templates/bar.md`.
- **D-03:** Plugin indexes and writes `.md` files only. Exclusion patterns apply to markdown files. Images, PDFs, and other asset types are ignored entirely regardless of exclusion config.
- **D-04:** Excluded folders are fully off-limits — no indexing, no MOC.md creation, no any plugin write inside excluded paths. Excluded = plugin doesn't touch it.

### Default Settings Values (SET-01..04)
- **D-05:** Background update interval default: **5 minutes** (300 seconds).
- **D-06:** Default exclusion list: **empty**. User configures exclusions from scratch on first install — no pre-seeded folder names.
- **D-07:** Auto-injection global toggle: **disabled by default**. Plugin generates dedicated MOC files only until the user explicitly enables auto-injection.

### Per-folder MOC Format Config (SET-03)
- **D-08:** Phase 1 defines the full settings schema now: `folderRules: Record<string, 'dedicated' | 'inline'>` plus a `defaultMocFormat: 'dedicated' | 'inline'` global fallback. Default is `'dedicated'`. No schema migration needed in Phase 4.
- **D-09:** Settings UI for per-folder rules: plain text area, one rule per line in `folder/path = inline` or `folder/path = dedicated` format. Lines that don't parse cleanly are silently ignored. Falls back to `defaultMocFormat` for any folder not listed.

### Build Config + Obsidian Version Floor
- **D-10:** `minAppVersion` in manifest.json: **1.4.0**. Verify `frontmatterLinks` availability at 1.4.0 against official changelog before finalizing (STATUS.md open question).
- **D-11:** TypeScript 5.8+, esbuild target ES2018. Matches Obsidian's Electron shell compatibility. No external npm dependencies beyond Obsidian internals.

### Write Safety (FOUND-04, FOUND-05) — Pre-decided
- **D-12:** `vault.process()` is the only write primitive — never `adapter.write()` or separate read+modify.
- **D-13:** Delimiter contract: `<!-- kb-manager:TYPE:start -->` / `<!-- kb-manager:TYPE:end -->`. Files with absent or malformed delimiters are skipped entirely — no partial writes, no guessing.
- **D-14:** Scaffold includes a `SafeWriter` or `isWriteSafe()` utility that validates delimiter presence before any write. Phase 4+ calls this; Phase 1 builds and unit-tests it.

### Scaffold Approach
- **D-15:** Start from the official Obsidian sample plugin template (sets up package.json, tsconfig, esbuild). Build on top; don't invent toolchain.
- **D-16:** Pure business logic (exclusion matching, delimiter validation, settings parsing) lives in files without Obsidian imports — testable via Vitest without mocking the Obsidian API.

### Claude's Discretion
- Plugin ID and display name (e.g., `kb-manager` or `obsidian-kb-manager`) — open to standard convention.
- Exact `KbManagerSettings` field naming — use clear, idiomatic TypeScript names.
- Settings tab section layout — organize logically (General, Exclusions, MOC Format); no strict requirement.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` — Full Phase 1 requirements: FOUND-01..05, SET-01..04
- `.planning/ROADMAP.md` §Phase 1 — Success criteria (4 criteria that must be TRUE)
- `.planning/PROJECT.md` — Core constraints, out-of-scope items, key decisions

### Project Rules (MANDATORY)
- `CLAUDE.md` §Critical Obsidian Plugin Rules — vault.process(), onLayoutReady, window.setInterval, normalizePath(), no console.log. These are hard rules, not suggestions.
- `CLAUDE.md` §Stack — TypeScript 5.8+, esbuild, Vitest, Obsidian API surface

### Prior Decisions (from STATUS.md)
- `.planning/STATUS.md` §Accumulated Context — All architectural decisions already locked (vault.process, onLayoutReady, delimiter contract, mutex pattern). Do not re-derive these.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — clean slate. Official Obsidian sample plugin template is the starting point.

### Established Patterns
- All patterns are defined in decisions above and CLAUDE.md, not derived from existing code.
- Key pattern: pure-logic modules (no Obsidian imports) for testability via Vitest.

### Integration Points
- `main.ts` → Plugin class entry point, onload/onunload, onLayoutReady registration
- `settings.ts` → KbManagerSettings interface + PluginSettingTab class
- `safe-writer.ts` (or similar) → delimiter validation utility consumed by Phases 4+
- `exclusions.ts` → path segment matching utility consumed by all phases

</code_context>

<specifics>
## Specific Ideas

- Per-folder config text area format: `folder/path = inline` (one rule per line). Silently skip malformed lines. Example:
  ```
  notes/projects = inline
  dailies = dedicated
  ```
- Vitest covers: exclusion path matching, delimiter validation, settings parse/serialize, folderRules text parsing
- `frontmatterLinks` at Obsidian 1.4.0 needs verification — check against the official changelog at `https://obsidian.md/changelog` before committing the manifest floor.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Plugin Scaffold + Settings + File Safety*
*Context gathered: 2026-04-28*
