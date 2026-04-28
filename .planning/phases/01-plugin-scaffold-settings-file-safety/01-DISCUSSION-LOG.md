# Phase 1: Plugin Scaffold + Settings + File Safety - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 1-Plugin Scaffold + Settings + File Safety
**Areas discussed:** Exclusion pattern matching, Default settings values, Per-folder MOC config in Phase 1, Min Obsidian version floor

---

## Exclusion Pattern Matching

| Option | Description | Selected |
|--------|-------------|----------|
| Simple prefix/name matching | Plain folder/file names, no wildcard syntax, no library | ✓ |
| Basic glob (* only) | Hand-rolled ~15 lines, supports * wildcard | |
| Full gitignore-style (bundle minimatch) | ~8KB bundle addition, full ** support | |

**User's choice:** Simple prefix/name matching
**Notes:** No wildcard syntax needed — keeps implementation zero-dependency and easy to explain to users.

| Option | Description | Selected |
|--------|-------------|----------|
| Any path segment | 'templates' matches /notes/templates/ AND /templates/ | ✓ |
| Root-level folders only | 'templates' only matches /templates/ at vault root | |
| Exact full path prefix | User must type full paths | |

**User's choice:** Any path segment
**Notes:** Most intuitive mental model — excluded = gone from plugin's view regardless of nesting.

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown files only | Plugin indexes/writes .md only; exclusions apply to .md | ✓ |
| All file types | Exclusions apply to all vault file types | |

**User's choice:** Markdown files only

| Option | Description | Selected |
|--------|-------------|----------|
| Excluded folders fully off-limits | No indexing, no MOC creation inside excluded paths | ✓ |
| Exclusions apply to user notes only | Plugin still generates MOC.md inside excluded folders | |

**User's choice:** Fully off-limits

---

## Default Settings Values

| Option | Description | Selected |
|--------|-------------|----------|
| 5 minutes | Matches PROJECT.md mention, responsive without hammering FS | ✓ |
| 10 minutes | More conservative for large vaults | |
| 30 minutes | Near-manual, poor first impression | |

**User's choice:** 5 minutes (300 seconds)

| Option | Description | Selected |
|--------|-------------|----------|
| templates | Template files | |
| .obsidian | Obsidian config folder | |
| archive | Common archival folder | |
| attachments | Asset folder | |
| None | Empty default exclusion list | ✓ |

**User's choice:** Empty list — no default exclusions. User configures from scratch.

| Option | Description | Selected |
|--------|-------------|----------|
| Disabled by default | Safer first install; user opts in explicitly | ✓ |
| Enabled by default | Shows the feature immediately but risky on first enable | |

**User's choice:** Disabled by default

---

## Per-folder MOC Config in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Full per-folder map now | `folderRules: Record<string, 'dedicated' \| 'inline'>` + global fallback | ✓ |
| Global default only | Simpler schema now, schema migration needed in Phase 4 | |
| Skip MOC format config in Phase 1 | Add entirely in Phase 4 | |

**User's choice:** Full per-folder map now — avoids schema migration in Phase 4.

| Option | Description | Selected |
|--------|-------------|----------|
| Text area, one rule per line | `folder/path = inline` format, ~0 custom DOM | ✓ |
| Dynamic table with Add/Remove rows | More polished, ~40 extra lines | |
| Folder picker dropdown | Most discoverable, vault access at render time | |

**User's choice:** Text area with `folder/path = inline` format

---

## Min Obsidian Version Floor

| Option | Description | Selected |
|--------|-------------|----------|
| 1.4.0 | frontmatterLinks available; widely adopted | ✓ |
| 1.5.0 | Slightly newer baseline | |
| 1.6.0 | Maximum API surface, fewer covered users | |

**User's choice:** 1.4.0 — verify frontmatterLinks availability before finalizing.

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript 5.8+, target ES2018 | Safe for Obsidian's Electron shell | ✓ |
| TypeScript 5.8+, target ES2022 | Native class fields; riskier compatibility | |

**User's choice:** TypeScript 5.8+, ES2018

---

## Claude's Discretion

- Plugin ID and display name (e.g., `kb-manager` or `obsidian-kb-manager`)
- Exact `KbManagerSettings` field naming
- Settings tab section layout and organization

## Deferred Ideas

None — discussion stayed within phase scope.
