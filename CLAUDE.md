# KB Manager — Project Instructions

## Project

Obsidian plugin for unified knowledge base management. Handles MOC generation, TOC injection, and tag hierarchy in a single plugin. TypeScript + Obsidian Plugin API.

See `.planning/PROJECT.md` for full context.

## GSD Workflow

This project uses the GSD (Get Shit Done) planning framework.

**Planning artifacts:**
- `.planning/PROJECT.md` — project context and requirements
- `.planning/ROADMAP.md` — 7 phases, 37 requirements
- `.planning/REQUIREMENTS.md` — full requirement list with traceability
- `.planning/research/` — domain research (stack, features, architecture, pitfalls)
- `.planning/STATUS.md` — current progress

**Phase commands:**
- `/gsd-discuss-phase N` — gather context and clarify approach
- `/gsd-plan-phase N` — create execution plan
- `/gsd-execute-phase N` — execute the plan
- `/gsd-verify-work` — verify phase deliverables

**Current phase:** v1 implementation complete

## Critical Obsidian Plugin Rules

1. **`vault.process()` only** for all vault file writes — never `adapter.write()` or separate `vault.read()` + `vault.modify()`
2. **Delimiter contract** — inline sections bounded by `<!-- kb-manager:TYPE:start -->` / `<!-- kb-manager:TYPE:end -->`; skip files with absent/malformed delimiters, never guess
3. **`onLayoutReady`** — register all vault events and heavy work here, not in `onload()`
4. **`window.setInterval`** — not bare `setInterval` (TypeScript type ambiguity)
5. **`normalizePath()`** — wrap all user-defined paths
6. **No `console.log`** in production — use `warn`/`error`/`debug` only

## Stack

- TypeScript 5.8+, esbuild (official template toolchain)
- Obsidian API: `Plugin`, `Vault`, `MetadataCache`, `ItemView`, `WorkspaceLeaf`, `PluginSettingTab`
- Tests: Vitest for pure-logic unit tests (keep business logic free of Obsidian imports)
- Dev: pjeby/hot-reload plugin with `.hotreload` marker

## File Size Limits

Functions < 30 lines | Files < 300 lines | Nesting max 3 levels
