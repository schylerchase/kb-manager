# KB Manager — Obsidian Knowledge Base Plugin

## What This Is

An Obsidian plugin that automatically maintains a MOC-first knowledge base. It generates and updates Map of Content files, injects per-note and section-level TOCs, and manages a tag hierarchy with cross-references — all in a single unified plugin. Built for personal vaults where the knowledge structure should maintain itself.

## Core Value

The vault structure stays accurate without manual work — MOC files, TOC sections, and tag relationships update themselves in the background.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Plugin auto-generates dedicated MOC.md files from vault folder/tag structure
- [ ] Plugin injects inline MOC sections into existing notes (configurable per-folder or per-area)
- [ ] Tags feed into MOC — tagged notes auto-grouped in relevant MOC sections
- [ ] Tag hierarchy: nested parent/child relationships
- [ ] Tag cross-reference: view all notes sharing a tag cluster
- [ ] Per-note TOC generated from headings
- [ ] Section-level TOC showing all notes in a topic area
- [ ] Sidebar panel showing KB structure (MOC tree + tag hierarchy)
- [ ] Ribbon commands for manual trigger: rebuild MOC, rebuild TOC, refresh tags
- [ ] Background periodic auto-update (configurable interval)
- [ ] Settings page: configure update interval, MOC format, folder rules, exclusions
- [ ] MOC format configurable: dedicated notes vs inline sections (per-folder basis)

### Out of Scope

- Team / shared vault features — personal-use focus first
- AI-generated note content — manages structure only, not content
- Note creation — manages existing notes, doesn't author them
- Cloud sync / remote storage — local vault only
- Cross-vault operations — single vault scope

## Context

- User has an existing MOC-first vault; already uses dedicated MOC notes as primary navigation
- Currently uses Dataview, Map of Content plugin, Tag Wrangler — friction is fragmentation and manual maintenance
- Obsidian Plugin API: TypeScript, `Plugin` class, Vault/MetadataCache APIs
- MetadataCache already indexes all frontmatter tags and wikilinks — plugin builds on top, not raw parsing
- Background periodic updates preferred over event-driven to avoid performance issues on large vaults

## Constraints

- **Tech Stack**: TypeScript + Obsidian Plugin API — no external dependencies except Obsidian internals
- **Performance**: Background updates must not block UI; use async/debounced workers
- **Compatibility**: Obsidian minimum version to be determined from API usage; target current stable
- **Scope**: Read/write to local vault files only; no network calls
- **File Safety**: Never destructively overwrite user content in non-MOC notes without explicit config

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Background periodic updates (not event-driven) | Event-driven on every save causes UI lag on large vaults | — Pending |
| Both MOC formats (dedicated files + inline injection) | User explicitly wants both, configurable per-folder | — Pending |
| Build on MetadataCache | Obsidian already parses all frontmatter/links; re-parsing is wasteful and fragile | — Pending |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-28 after initialization*
