# Research Summary — KB Manager Obsidian Plugin

**Synthesized:** 2026-04-28
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md

---

## Recommended Stack

- **TypeScript ^5.8.3** — required by official template; `noUncheckedIndexedAccess` catches MetadataCache null-index bugs
- **esbuild 0.25.5 (pinned)** — official toolchain; CJS output, ES2018 target; do not substitute Rollup/Vite/Webpack
- **obsidian npm 1.12.3** — type definitions only; real module provided by Obsidian at runtime; run `npm view obsidian version` before starting
- **No UI framework (no React/Svelte)** — Obsidian's `createEl`/`createDiv` DOM helpers are idiomatic and sufficient
- **Vitest** — primary test runner for pure-logic unit tests; keep data transformation functions free of Obsidian imports
- **minAppVersion: "1.4.0"** — required for `cache.frontmatterLinks`; verify against official Obsidian changelog before shipping (MEDIUM confidence)
- **pjeby/hot-reload plugin** — mandatory for development loop; place `.hotreload` in plugin dir

---

## Table Stakes Features

Must exist in v1 or users uninstall immediately.

| Feature | Why Non-Negotiable |
|---------|-------------------|
| Auto-generate MOC.md from folder structure | Core value prop; Waypoint/Zoottelkeeper/Folder Index all do this |
| MOC stays current without manual trigger | Dataview queries set the baseline expectation |
| Per-note TOC from headings | Multiple dedicated TOC plugins exist; users expect this as baseline |
| Tags determine MOC membership | Dataview-based workflows group by tag; users expect tags to drive MOC sections |
| Configurable folder/file exclusions | Every indexing plugin supports this; archive/, templates/, .trash/ are universal |
| Settings page with sensible defaults | No config required to get value on day one |
| Ribbon command for manual rebuild | Users want a panic button when auto-update feels stale |
| Non-destructive writes | Highest trust barrier — never silently overwrite user content |

---

## Differentiators

What makes this plugin worth choosing over running Waypoint + a TOC plugin + Tag Wrangler + Dataview separately.

| Feature | Gap It Fills |
|---------|-------------|
| Unified MOC + TOC + tag hierarchy in one plugin | No single plugin combines all three |
| Inline MOC section injection into existing notes | Every folder-index plugin requires a dedicated folder note or new file |
| Per-folder MOC format config (dedicated file vs inline) | Waypoint and Zoottelkeeper are all-or-nothing |
| Tag hierarchy cross-reference (notes sharing a tag cluster) | TagFolder shows tags-as-folders but doesn't cross-reference cluster membership |
| Sidebar panel showing live MOC tree + tag hierarchy | No plugin combines both views in a persistent panel |
| Background interval updates (not event-driven) | All current MOC plugins are event-driven or manual; interval model is what the community explicitly asks for |
| Section-level TOC across notes in a topic area | All existing TOC plugins are strictly per-note |

---

## Critical Architecture Decisions

**1. VaultIndex is the single source of truth.**
One class reads MetadataCache and builds the in-memory model (tag tree, folder structure, file metadata map). All generators consume VaultIndex output. Nothing else reads MetadataCache directly.

**2. `vault.process()` is the only write primitive.**
Never use `vault.read()` + `vault.modify()` as separate calls — race condition window. `vault.process()` is atomic. Every write goes through it.

**3. Delimiter-contract for inline sections; frontmatter ownership for dedicated MOC files.**
- Dedicated MOC files: tagged `kb-managed: true` in frontmatter, plugin owns entirely
- Inline sections: delimited by `<!-- kb-manager:toc:start -->` / `<!-- kb-manager:toc:end -->`, plugin only replaces content between delimiters, skip if delimiters absent/malformed, never guess

**4. All heavy work deferred to `onLayoutReady`; vault events registered inside it.**
`onload()` registers views, commands, settings tab only. First real rebuild triggered by `metadataCache.on('resolved')`.

**5. `isRefreshing` guard at the scheduler level.**
Single boolean mutex prevents concurrent background tick + manual trigger from racing writes on the same files.

---

## Must-Avoid Pitfalls

**1. `vault.adapter.write()` → silent cache desync + potential truncation.**
Prevention: use only `vault.modify()` or `vault.process()`. Address in Phase 1.

**2. `vault.modify()` / `vault.process()` silently fail within 2-second requestSave window.**
Prevention: use background interval model (not event-driven writes); never trigger writes from `metadataCache.on('changed')`. Address in Phase 3.

**3. Obsidian's built-in `debounce()` is actually a throttle.**
Prevention: implement manual debounce with `clearTimeout`/`setTimeout`. Address in Phase 3.

**4. Overwriting user content due to delimiter boundary miscalculation.**
Prevention: `<!-- kb-manager:X:start -->` / `end` markers; verify both exist with end > start before any write; skip if absent; never attempt "best effort" recovery. Address in Phase 1 before any file-writing feature ships.

**5. Processing all vault files on every metadata event.**
Prevention: maintain dirty-file set; mark files dirty on `changed`, process only dirty files on each periodic tick. Address in Phase 2.

**Bonus — Plugin review hard rejections:**
- No `console.log()` in production
- All user-defined paths through `normalizePath()`
- `window.setInterval` not bare `setInterval`
- `createEl()` / `el.textContent` instead of `innerHTML`
- Remove all sample-plugin placeholder code

---

## Suggested Phase Order

| Phase | Name | Rationale |
|-------|------|-----------|
| 1 | Plugin Scaffold + Settings + File Safety | Delimiter contract and write patterns must exist before any file-writing feature |
| 2 | VaultIndex (Core Data Layer) | All generators consume VaultIndex; build and test before consumers; no vault writes |
| 3 | Background Update Scheduler | Generators need safe scheduling context; isRefreshing mutex must exist first |
| 4 | MOC Generator | Core differentiating feature; depends on VaultIndex + write infrastructure |
| 5 | TOC Generator | Same write pattern as MOC but per-note scoped; validates infrastructure under second feature |
| 6 | TagManager + Tag Hierarchy | In-memory only (no writes), lower risk; feeds sidebar |
| 7 | Sidebar View | Pure consumer; all data structures exist after Phase 6 |

---

## Open Questions

1. **minAppVersion** — verify `frontmatterLinks` availability at 1.4.0 against official changelog before setting manifest floor
2. **Inline MOC injection opt-in UX** — how does user opt a note into inline injection? (a) manually insert delimiters, (b) "inject here" command, (c) per-folder auto-inject on first run
3. **Dirty-file set persistence** — ephemeral (rebuilt on `metadataCache.on('resolved')`) is probably fine; confirm no gap for changes made while plugin disabled
4. **Section-level TOC scope** — confirm before Phase 5: v1 or v2? Per-note TOC is clearly v1; cross-note TOC could be deferred
5. **Conflict handling for manually-edited generated sections** — hash-check vs delimiter-only as conflict signal; decide before Phase 4

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack | HIGH | Verified against official obsidian-sample-plugin repo and obsidian.d.ts 1.7.2 |
| Features | MEDIUM-HIGH | Cross-referenced across plugin READMEs and forum threads |
| Architecture | HIGH | Verified from obsidian.d.ts and real plugin source (Waypoint) |
| Pitfalls | HIGH | Official docs + multiple community reports |

**Overall: HIGH.** One MEDIUM area: `minAppVersion` floor — verify before shipping.
