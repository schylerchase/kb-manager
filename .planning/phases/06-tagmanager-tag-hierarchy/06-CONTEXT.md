# Phase 6: TagManager + Tag Hierarchy - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a query layer on top of VaultIndex tag data: a `TagManager` class exposing a
cross-reference query `getNotesWithTagCluster(tags, minMatches)` that returns notes
sharing 2 or more of the input tags. TAG-01 (visual tag hierarchy in memory) and
TAG-03 (tag hierarchy feeds MOC groupings) are ALREADY satisfied by Phase 2 D-04
(`VaultIndex.tagTree`) and Phase 4 MocGenerator (which builds folder-scoped TagNode
trees from FileRecord data); this phase verifies and adds TAG-02.

Requirements in scope: TAG-01 (verify), TAG-02 (new), TAG-03 (verify)

</domain>

<decisions>
## Implementation Decisions

### Cluster Query Semantics (TAG-02)
- **D-01:** `getNotesWithTagCluster(tags: string[], minMatches = 2): string[]` returns the
  vault-relative file paths of notes that apply at least `minMatches` of the input `tags`.
  Default `minMatches` is 2 — matches TAG-02 wording ("2 or more of the same tags in that
  cluster").
- **D-02:** Exact-string tag match. `#project` is a different tag from `#project/alpha` —
  the hierarchy is for navigation/display only, NOT for query expansion. user who wants
  both pasees both: `getNotesWithTagCluster(['project', 'project/alpha'])`.
- **D-03:** Input tags MUST be normalized by the caller — leading `#` stripped, lowercased
  (Phase 2 D-02 normalized form). TagManager does NOT call `normalizeTag` internally —
  it would mask caller bugs. Document this contract on the method JSDoc.
- **D-04:** Output is sorted alphabetically by file path for stable comparisons. Empty input
  array → empty output. `minMatches` of 0 or negative coerces to 1 internally (defensive
  — matches "any of these tags" semantics rather than throwing).
- **D-05:** Duplicate tags in the input array are deduplicated before counting. Caller passing
  `['api', 'api']` is the same as passing `['api']`.

### TagManager API
- **D-06:** TagManager exposes the following public surface:
  - `getNotesWithTagCluster(tags: string[], minMatches?: number): string[]` — TAG-02 query
  - `getFilesWithTag(tag: string): string[]` — pass-through to `VaultIndex.getFilesWithTag(tag)`
  - `getTagHierarchy(): Map<string, TagNode>` — pass-through to `VaultIndex.getTagTree()`
  - `getAllTags(): string[]` — convenience: returns all top-level normalized tag strings
    encountered in the index (sorted, deduplicated). Helpful for the Phase 7 sidebar.
- **D-07:** Internal data: TagManager DOES NOT cache or shadow VaultIndex data. Every query
  hits the underlying VaultIndex at call time. Memory: zero (just an object reference).
  Why: tag data invalidates on every rebuild; caching here would just duplicate VaultIndex's
  source-of-truth role. Keep TagManager a pure query facade.

### Lifecycle
- **D-08:** TagManager is instantiated on the plugin (`this.tagManager`) inside `onload()`
  AFTER `this.index = new VaultIndex(...)`. No rebuild hook — TagManager is a stateless
  facade, not a generator.
- **D-09:** Phase 7 sidebar consumes TagManager directly: it calls
  `this.tagManager.getTagHierarchy()` to render the tree and could call
  `getNotesWithTagCluster` for cluster-filter views (out of scope for v1; deferred).
- **D-10:** TagManager is NOT consumed by MocGenerator or TocGenerator in this phase —
  the existing data flow (Phase 4 MocGenerator builds its OWN folder-scoped tag tree from
  FileRecords) stays the same. TAG-03 satisfaction depends on the underlying tag data being
  accurate, which it already is.

### TAG-01 & TAG-03 Verification (no new code, audit only)
- **D-11:** TAG-01 verification: `VaultIndex.getTagTree()` already returns a `Map<string, TagNode>`
  built by `tag-utils.buildTagTree` (Phase 2 D-04). `#parent/child` tags split on `/` and
  populate nested TagNode children. Add a Vitest test in Plan 06-02 that verifies a complete
  hierarchy round-trip from raw input through TagManager.getTagHierarchy() output.
- **D-12:** TAG-03 verification: MocGenerator already builds tag-grouped section headings
  via `buildMocBody` (Phase 4 D-01). The grouping data comes from FileRecord.tags. As long
  as VaultIndex tag data is correct, TAG-03 is satisfied. Add an explicit acceptance check
  in this phase's plan that confirms MocGenerator's tag groupings match
  `VaultIndex.getTagTree()` for any folder.

### Claude's Discretion
- File location: `src/lib/tag-cluster.ts` for the pure-logic cluster matcher vs inlining into
  the existing `tag-utils.ts`. Inlining is acceptable if `tag-utils.ts` stays under 150 lines
  after the addition. Currently 69 lines per `wc -l`; ample room.
- TagManager class location: `src/TagManager.ts` (own file) vs methods on VaultIndex itself.
  Separate file is preferred — keeps VaultIndex as a pure data layer (Phase 2 D-06 explicitly
  separates data layer from query layer).
- Whether `getAllTags` returns top-level tags only or every tag including nested. Top-level
  is the default; nested tags are visible via the tree. Phase 7 will tell us which is more
  useful for sidebar rendering.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` §Tag Management — TAG-01..03 full requirement text
- `.planning/ROADMAP.md` §Phase 6 — Success criteria (3 criteria)

### Project Rules
- `CLAUDE.md` §File Size Limits — Functions <30, Files <300, Nesting <3
- `CLAUDE.md` §Stack — Vitest for pure-logic tests

### Prior Phase Decisions
- `.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md` §VaultIndex API (D-04, D-05, D-06):
  tag tree built from `#parent/child` patterns; flat tag→files map maintained alongside;
  VaultIndex exposes raw tag data, Phase 6 adds query logic
- `.planning/phases/04-moc-generator/04-CONTEXT.md` §MOC Body Format (D-01, D-02):
  MocGenerator already builds tag-grouped MOC sections from FileRecord.tags — verifies TAG-03

### Existing Code (consumed)
- `src/lib/tag-utils.ts` — `buildTagTree`, `buildFlatTagMap`, `normalizeTag` (the latter
  documented for caller use, not called by TagManager internals)
- `src/lib/vault-index-types.ts` — `TagNode` interface
- `src/VaultIndex.ts` — `getTagTree()`, `getFilesWithTag(tag)` query methods consumed by
  TagManager pass-throughs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tag-utils.buildFlatTagMap` produces the exact `Map<string, string[]>` (tag → file paths)
  shape that the cluster matcher inverts: tag-set per file. The cluster query needs
  the inverse view (file → tags) — could be derived in O(N*T) per query OR maintained
  by VaultIndex. For v1, derive per-query from `getFilesWithTag` calls. If query latency
  becomes a problem, consider adding a `getFileToTagsMap` to VaultIndex in v2.
- `VaultIndex.flatTagMap` (private) is the same data; could expose a public getter to
  avoid the per-query derivation, but that breaks D-06 separation. Keep it private;
  TagManager iterates input tags and unions results.

### Established Patterns
- Pure-logic + Obsidian-coupled split. `findClusterMatchedFiles` (or similar) is pure;
  `TagManager` is a class facade holding the `VaultIndex` reference.
- Class lives at `src/TagManager.ts` alongside `src/MocGenerator.ts` and
  `src/TocGenerator.ts`. Same constructor injection pattern.

### Integration Points
- `main.ts onload()`: `this.tagManager = new TagManager(this.index);` AFTER
  `this.index = new VaultIndex(...)` and BEFORE `this.mocGenerator`/`this.tocGenerator`
  if those needed it (they don't this phase). Order doesn't matter functionally;
  group with other generator instantiations for readability.
- Phase 7 sidebar will consume `this.tagManager.getTagHierarchy()` directly.

</code_context>

<specifics>
## Specific Details

### Cluster matcher algorithm (pseudo)
```
function findClusterMatchedFiles(
  flatTagMap: Map<string, string[]>, // tag → file paths
  queryTags: string[],
  minMatches: number
): string[] {
  const dedupedQuery = [...new Set(queryTags)];
  const minRequired = Math.max(1, minMatches);
  const fileCounts = new Map<string, number>();
  for (const tag of dedupedQuery) {
    const files = flatTagMap.get(tag) ?? [];
    for (const filePath of files) {
      fileCounts.set(filePath, (fileCounts.get(filePath) ?? 0) + 1);
    }
  }
  const matches: string[] = [];
  for (const [filePath, count] of fileCounts) {
    if (count >= minRequired) matches.push(filePath);
  }
  return matches.sort();
}
```

### TagManager constructor
```typescript
class TagManager {
  constructor(private index: VaultIndex) {}
  // queries delegate to this.index
}
```

### Vitest coverage planned for Plan 06-02
- findClusterMatchedFiles: empty input, single tag (matches 0 since min=2 by default),
  two-tag query with note matching both, two-tag query with note matching only one,
  three-tag query with minMatches=2 (note matching 2 qualifies), duplicate tag in query,
  minMatches=0 coerced to 1, sorted output stability
- TagManager pass-throughs: getFilesWithTag delegates correctly, getTagHierarchy returns
  the same Map ref VaultIndex returns
- TAG-01 round-trip: build a small in-memory tag tree from `['#parent/child', '#parent/sibling']`
  and verify TagManager.getTagHierarchy() returns the expected nested structure

### TagManager file size target
- `src/TagManager.ts`: ~50 lines (mostly delegation + the cluster query)
- `src/lib/tag-cluster.ts`: ~40 lines (single pure function + small types)
- `src/lib/tag-cluster.test.ts`: ~150 lines

</specifics>

<deferred>
## Deferred Ideas

- Hierarchy-aware cluster matching (`#project` matches `#project/alpha`). v2 — would require
  an explicit `expand: boolean` flag and prefix-matching logic. Defer until a user reports the
  pain.
- VaultIndex maintains a public `getFileToTagsMap` for O(1) reverse lookup. Deferred until
  query latency on large vaults proves to be a problem.
- TagManager subscribes to `onRebuildComplete` to invalidate per-query caches. v2; not needed
  for the stateless v1 facade.
- Sidebar cluster-filter view (user picks N tags from sidebar, sees cluster-matched notes).
  Phase 7 sidebar in v1 only renders the hierarchy + MOC tree; cluster filter is a v2 feature.

</deferred>

---

*Phase: 6-TagManager + Tag Hierarchy*
*Context gathered: 2026-04-29*
