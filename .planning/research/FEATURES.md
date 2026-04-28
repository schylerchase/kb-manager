# Features Research — Obsidian KB Manager Plugin

**Domain:** Obsidian knowledge base / MOC management plugin
**Researched:** 2026-04-28
**Confidence:** MEDIUM-HIGH (cross-referenced across plugin READMEs, GitHub issues, community forum threads)

---

## Table Stakes (must have or users leave)

Features that every competing plugin has in some form. Absence signals an incomplete product.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Auto-generate MOC from folder structure | Core value prop; Waypoint, Zoottelkeeper, Folder Index all do this | Medium | Must survive file renames, moves, deletes — event handling is the hard part |
| MOC stays current without manual trigger | Dataview queries do this dynamically; users expect structural docs to self-update | Medium | Periodic background update is acceptable; event-driven is faster but riskier on large vaults |
| Configurable exclusions (folders / files) | Every indexing plugin supports this; users always have archive/, templates/, .trash/ to skip | Low | Glob pattern or simple prefix matching; users expect `.gitignore`-style control |
| Settings page with sensible defaults | Non-negotiable for any plugin with configurable behavior | Low | Bad defaults = immediate uninstall; users shouldn't need to configure to get value day one |
| Ribbon command for manual rebuild | Users want a panic button when auto-update feels stale or breaks | Low | Single command is fine; "rebuild all" is table stakes |
| Non-destructive writes | Existing note body content must never be silently overwritten | Low-Medium | The highest trust barrier; Zoottelkeeper's data-loss disclaimer is a warning sign — users read this and hesitate |
| TOC from headings per note | Multiple dedicated TOC plugins (Automatic TOC, Dynamic TOC, Insta TOC) mean users expect this as baseline | Low | Insert/update a delimited block; do not re-parse entire file |
| Tag visibility in MOC sections | Dataview-based MOC workflows group by tag; users expect tags to determine MOC membership | Medium | Pull from MetadataCache — no raw parsing needed |

---

## Differentiators (competitive advantage)

Features existing tools either do not have or implement poorly. These create reasons to choose this plugin over combining three separate ones.

| Feature | Value Proposition | Complexity | Gap It Fills |
|---------|-------------------|------------|-------------|
| Unified MOC + TOC + tag hierarchy in one plugin | Current state: users run Dataview + Waypoint/Zoottelkeeper + Tag Wrangler + a TOC plugin — 4 plugins with no shared state | High | No single plugin combines all three concerns; fragmentation is the stated pain point |
| Per-folder MOC format config (dedicated file vs inline injection) | Some folders want a `MOC.md` file; others want an injected section in an existing note — existing plugins are all-or-nothing | High | Waypoint requires a folder note; Zoottelkeeper generates a new file; neither supports inline injection into an existing note |
| Tag hierarchy cross-reference (notes sharing a tag cluster) | TagFolder shows tags-as-folders but does not cross-reference cluster membership; Index Notes is tag-based but lacks cluster view | Medium | Users want to see "all notes tagged #project AND #active" without writing a Dataview query |
| Sidebar panel showing live MOC tree + tag hierarchy | Robin-Haupt's MOC plugin has a sidebar but it's link-traversal only; no plugin shows MOC tree + tag hierarchy together | Medium | Combines navigation and structural overview in one persistent pane |
| Section-level TOC (all notes in a topic area) | No existing plugin generates a cross-note TOC at the section/area level — only per-note TOC exists | High | Bridges the gap between per-note TOC (single file) and full MOC (folder); useful for topic clusters spread across files |
| Configurable background update interval | Most plugins update on file event (fragile on large vaults) or not at all; interval-based is rare | Medium | The Obsidian community explicitly discusses event-driven update lag on vaults with 1000+ notes |
| Inline MOC section injection into existing notes | Waypoint only works in dedicated folder notes; no plugin injects a maintained MOC section into an arbitrary existing note | High | Users with existing note structures don't want to restructure folders to get MOC benefits |

---

## Anti-Features (deliberately exclude)

Things that make KB plugins bloated, fragile, or untrustworthy. Exclusion is a product decision, not an oversight.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| AI-generated note content | Out of stated scope; adds LLM dependency, cost, privacy concerns, and non-determinism to what should be a deterministic structural tool | Manage structure only; content is the user's domain |
| Event-driven updates on every vault change | Causes UI lag on vaults with 1000+ notes; Tasks plugin is the canonical community example of this complaint; startup scans are slow | Configurable periodic background interval with debounce |
| Graph view manipulation | Nested Tags Graph, TagsRoutes, and others already own this space; adds visual complexity with marginal structural value | Focus on text-file MOC/TOC output, not graph visualization |
| Cloud sync / remote storage | Out of stated scope; adds auth, network, and privacy surface; Obsidian Sync already exists | Local vault only |
| Cross-vault operations | Massively increases complexity; vault paths are not stable; no Obsidian API surface for it | Single vault, single MetadataCache instance |
| Team / shared vault features | Merge conflicts on auto-generated files are a nightmare; lock/coordination logic doubles complexity | Personal-use focus; explicit out-of-scope in PROJECT.md |
| Note creation / authoring | Plugins that create notes (InsightA, LLM Wiki) occupy a different category and user expectation | Read and restructure existing notes only |
| Dataview-syntax output | Dataview queries are dynamic but not portable — they break if Dataview is removed; render as static links in the MOC file | Write real Markdown links (Waypoint's approach — explicitly called out as a differentiator in its README) |
| Canvas file generation | Canvas is a separate Obsidian format; one plugin already exists for this conversion; maintenance burden with low adoption | Stick to Markdown .md output |
| Per-note frontmatter mutation as primary state | Modifying frontmatter on every note to track MOC membership creates merge conflicts and surprises; Tag Wrangler already touches frontmatter cautiously | Use tags and links already in notes as source-of-truth; write only to dedicated MOC files and delimited injection blocks |

---

## Existing Plugin Gaps

What the current plugin landscape is missing that this plugin should fill.

**Gap 1: No unified plugin.**
Users currently assemble: Waypoint or Zoottelkeeper (folder MOC), a TOC plugin (per-note), Tag Wrangler (tag management), and Dataview (dynamic queries). These four tools have no shared state. A rename in Tag Wrangler doesn't trigger a Waypoint rebuild. A new note doesn't update the TOC plugin's index. Users manually reconcile the gaps.

**Gap 2: Inline injection into existing notes.**
Every folder-index plugin requires either a dedicated folder note (Waypoint) or generates a new index file (Zoottelkeeper, Folder Index). None support injecting a maintained MOC section into an existing note. Users with mature vaults where notes already exist don't want to restructure their folder layout to get MOC benefits.

**Gap 3: Tag-to-MOC pipeline.**
Index Notes is the closest — it generates index blocks from tag hierarchies — but it requires notes be tagged with a special `/idx` suffix convention. There is no plugin that maps the existing tag hierarchy (whatever tags the user already uses) directly to MOC sections without requiring a new tagging scheme.

**Gap 4: Per-folder format control.**
No plugin lets you say "folder A should get a dedicated MOC.md file, but folder B should get an inline section injected into its existing overview note." This level of granularity does not exist in any current tool.

**Gap 5: Background interval updates (not event-driven).**
The community explicitly identifies event-driven updates as the performance problem on large vaults. Auto Periodic Notes does background creation for periodic notes, but no MOC/index plugin uses a background interval model. All current MOC plugins are event-driven or manual.

**Gap 6: Section-level TOC across notes in a topic area.**
Existing TOC plugins are strictly per-note (generate a TOC for the open file's headings). No plugin generates a section-level TOC that says "here are all notes in the #project/alpha cluster, organized by their H2 sections." This would be novel.

---

## Feature Dependencies

Which features depend on others being built first.

```
MetadataCache integration (vault scan foundation)
  └── Tag hierarchy model (parse tags from cache)
  │     └── Tag cross-reference view (query tag clusters)
  │     └── Tag-to-MOC section mapping (group notes by tag in MOC)
  └── Folder structure model (enumerate folders and notes)
        └── Dedicated MOC file generation (write MOC.md per folder)
        │     └── Per-folder format config (decide: file vs inline per folder)
        └── Inline MOC section injection (inject into existing note)
              └── Per-folder format config (same config gate)

Background update scheduler (timer + debounce)
  └── All generation features above (scheduler triggers them)
  └── Configurable update interval (settings dependency)

Settings page
  └── All configurable behavior (exclusions, interval, format rules)
  └── Folder rules (per-folder format decisions)

Per-note TOC generation (heading extraction)
  └── Section-level TOC (extends per-note TOC to cross-note)

Sidebar panel (ItemView / WorkspaceLeaf)
  └── MOC tree model (must exist before it can display)
  └── Tag hierarchy model (must exist before it can display)
  └── All generation features above (panel reads from same model)

Ribbon commands (manual trigger)
  └── All generation features (commands call the same generation logic)
```

**Build order implication:** MetadataCache integration and the folder/tag models are the foundation everything else depends on. The sidebar and ribbon commands are thin UI layers over the same generation logic — build them last, after the generation core is stable.

---

## Sources

- [Waypoint Plugin README](https://github.com/IdreesInc/Waypoint) — dedicated folder note requirement, portable Markdown output rationale
- [Zoottelkeeper Plugin README](https://github.com/akosbalasko/zoottelkeeper-obsidian-plugin) — format options, data-loss disclaimer
- [Index Notes Plugin README](https://github.com/adanielnoel/obsidian-index-notes) — tag-based index generation with `/idx` convention
- [Robin-Haupt MOC Plugin](https://github.com/Robin-Haupt-1/Obsidian-Map-of-Content) — link-traversal sidebar, 63 open issues
- [TagFolder Plugin](https://github.com/vrtmrz/obsidian-tagfolder) — nested tag hierarchy, no cross-reference cluster view
- [Obsidian Forum: Making MOCs — deep frustration](https://forum.obsidian.md/t/making-mocs-deep-deep-frustration) — manual maintenance pain point
- [Obsidian Forum: Do Dataview queries replace your MOCs?](https://forum.obsidian.md/t/do-dataview-queries-replace-your-mocs) — Dataview query limits (unordered, no grouping beyond 6 items)
- [Obsidian Forum: On the process of making MOCs](https://forum.obsidian.md/t/on-the-process-of-making-mocs) — community workflow discussion
- [Breadcrumbs Plugin Docs](https://breadcrumbs-wiki.netlify.app/) — typed link hierarchy, graph-based
- [Tag Wrangler Plugin](https://github.com/pjeby/tag-wrangler) — rename/merge, frontmatter-aware, no MOC generation
- [Automatic Table of Contents Plugin](https://github.com/johansatge/obsidian-automatic-table-of-contents) — per-note only, code block trigger
- [Obsidian performance discussion: Call for plugin optimization](https://forum.obsidian.md/t/call-for-plugin-performance-optimization-especially-for-plugin-startup) — event-driven update lag evidence
