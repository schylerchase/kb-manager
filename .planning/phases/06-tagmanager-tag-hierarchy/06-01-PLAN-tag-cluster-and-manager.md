---
phase: 06-tagmanager-tag-hierarchy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/tag-cluster.ts
  - src/TagManager.ts
  - src/main.ts
autonomous: true
requirements:
  - TAG-01
  - TAG-02
  - TAG-03
must_haves:
  truths:
    - "src/lib/tag-cluster.ts exports findClusterMatchedFiles with no Obsidian imports"
    - "findClusterMatchedFiles deduplicates input query tags before counting"
    - "findClusterMatchedFiles coerces minMatches < 1 to 1"
    - "findClusterMatchedFiles returns alphabetically sorted file paths"
    - "src/TagManager.ts exports default TagManager class"
    - "TagManager constructor takes (index: VaultIndex)"
    - "TagManager exposes getNotesWithTagCluster(tags: string[], minMatches?: number): string[]"
    - "TagManager exposes getFilesWithTag(tag: string): string[] which delegates to index.getFilesWithTag"
    - "TagManager exposes getTagHierarchy(): Map<string, TagNode> which delegates to index.getTagTree"
    - "TagManager exposes getAllTags(): string[] returning sorted top-level tag names"
    - "src/main.ts imports TagManager and instantiates this.tagManager = new TagManager(this.index) inside onload after VaultIndex creation"
  artifacts:
    - path: "src/lib/tag-cluster.ts"
      provides: "Pure cluster-match function over flatTagMap"
      exports: ["findClusterMatchedFiles"]
    - path: "src/TagManager.ts"
      provides: "Query facade for VaultIndex tag data; cross-reference cluster query"
      exports: ["default TagManager"]
    - path: "src/main.ts"
      provides: "Plugin instantiates TagManager"
      exports: ["default KBManagerPlugin"]
  key_links:
    - from: "src/TagManager.ts"
      to: "src/lib/tag-cluster.ts"
      via: "import { findClusterMatchedFiles } from './lib/tag-cluster'"
      pattern: "from.*tag-cluster"
    - from: "src/main.ts"
      to: "src/TagManager.ts"
      via: "import TagManager from './TagManager'"
      pattern: "from.*TagManager"
---

<objective>
Add the cluster cross-reference query (TAG-02) to the codebase. Pure-logic
`findClusterMatchedFiles` does the counting work; `TagManager` class wraps it and provides
pass-throughs to VaultIndex tag queries (`getFilesWithTag`, `getTagHierarchy`, `getAllTags`).
Plugin instantiates TagManager on `onload` so Phase 7 sidebar can consume it. TAG-01 and
TAG-03 are verified by acceptance checks here and Vitest tests in Plan 06-02.

Output: src/lib/tag-cluster.ts (pure function), src/TagManager.ts (class facade),
src/main.ts (TagManager wired on plugin).
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/06-tagmanager-tag-hierarchy/06-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md

<interfaces>
// src/lib/tag-cluster.ts (pure)

export function findClusterMatchedFiles(
  flatTagMap: Map<string, string[]>,
  queryTags: string[],
  minMatches: number,
): string[];

// src/TagManager.ts (Obsidian-adjacent — only imports VaultIndex types, no Obsidian API)

import VaultIndex from './VaultIndex';
import { TagNode } from './lib/vault-index-types';

export default class TagManager {
  constructor(private index: VaultIndex) {}
  getNotesWithTagCluster(tags: string[], minMatches?: number): string[];
  getFilesWithTag(tag: string): string[];
  getTagHierarchy(): Map<string, TagNode>;
  getAllTags(): string[];
}
</interfaces>

<!-- TagManager doesn't import 'obsidian' — it only consumes VaultIndex public API.
     This keeps it ALMOST pure-logic, but it imports VaultIndex which has Obsidian deps,
     so we keep it in src/ root rather than src/lib/. -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/lib/tag-cluster.ts with findClusterMatchedFiles</name>
  <files>src/lib/tag-cluster.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.ts (sibling pure-logic style)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/06-tagmanager-tag-hierarchy/06-CONTEXT.md (D-01..D-05 — query semantics)
  </read_first>
  <behavior>
    - findClusterMatchedFiles(empty Map, [], 2) → []
    - findClusterMatchedFiles with single query tag returns no matches when minMatches=2 (count caps at 1)
    - findClusterMatchedFiles with two query tags → returns files whose count is ≥ 2 (i.e. files in BOTH tag's lists)
    - findClusterMatchedFiles minMatches=0 coerces to 1 (any-of behavior)
    - findClusterMatchedFiles minMatches=-5 coerces to 1
    - findClusterMatchedFiles deduplicates query tag list (['api', 'api'] === ['api'])
    - findClusterMatchedFiles output sorted alphabetically by file path
    - findClusterMatchedFiles ignores query tags absent from the flatTagMap
  </behavior>
  <action>
Create `src/lib/tag-cluster.ts`:

```typescript
/**
 * Find file paths that apply at least `minMatches` of `queryTags`.
 *
 * Phase 6 D-01..D-05:
 * - Exact tag string matching (no hierarchy expansion)
 * - Caller MUST normalize query tags (lowercase, no leading '#')
 * - Duplicate query tags are deduplicated
 * - minMatches < 1 coerces to 1
 * - Output sorted alphabetically by file path
 */
export function findClusterMatchedFiles(
  flatTagMap: Map<string, string[]>,
  queryTags: string[],
  minMatches: number,
): string[] {
  const dedupedQuery = [...new Set(queryTags)];
  const minRequired = Math.max(1, minMatches);
  const fileCounts = new Map<string, number>();
  for (const tag of dedupedQuery) {
    const files = flatTagMap.get(tag);
    if (!files) continue;
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

Constraints:
- Zero imports
- No console calls
- File ≤ 60 lines
- Single named export
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "^import" src/lib/tag-cluster.ts` outputs 0
    - `grep -c "^export function findClusterMatchedFiles" src/lib/tag-cluster.ts` outputs 1
    - `grep -c "from 'obsidian'" src/lib/tag-cluster.ts` outputs 0
    - `grep -c "console" src/lib/tag-cluster.ts` outputs 0
    - `grep "Math.max(1" src/lib/tag-cluster.ts` matches 1 line (minMatches coercion)
    - `grep "new Set(queryTags)" src/lib/tag-cluster.ts` matches 1 line (dedup)
    - `grep ".sort()" src/lib/tag-cluster.ts` matches 1 line (sorted output)
    - `wc -l src/lib/tag-cluster.ts` outputs ≤ 60
  </acceptance_criteria>
  <done>findClusterMatchedFiles is a pure function: dedupes input, coerces minMatches, counts matches per file, returns alphabetically sorted paths.</done>
</task>

<task type="auto">
  <name>Task 2: Create src/TagManager.ts</name>
  <files>src/TagManager.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts (getTagTree, getFilesWithTag — public methods consumed)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-cluster.ts (Plan 06-01 Task 1 — findClusterMatchedFiles signature)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/06-tagmanager-tag-hierarchy/06-CONTEXT.md (D-06, D-07: API + no caching)
  </read_first>
  <action>
Create `src/TagManager.ts`:

```typescript
import VaultIndex from './VaultIndex';
import { TagNode } from './lib/vault-index-types';
import { findClusterMatchedFiles } from './lib/tag-cluster';

/**
 * Query facade for VaultIndex tag data.
 *
 * Phase 6 D-07: stateless — every query hits VaultIndex at call time. No caching.
 * D-03: callers MUST normalize tags before calling getNotesWithTagCluster /
 * getFilesWithTag (lowercase, no leading '#').
 */
export default class TagManager {
  constructor(private index: VaultIndex) {}

  /**
   * TAG-02. Returns notes that apply at least minMatches of the input tags.
   * Default minMatches = 2 (per the requirement wording).
   */
  getNotesWithTagCluster(tags: string[], minMatches: number = 2): string[] {
    // VaultIndex doesn't expose its private flatTagMap directly. Build a
    // local mini-map by querying each input tag. This keeps VaultIndex's
    // encapsulation intact (Phase 2 D-10) at the cost of N extra Map lookups.
    const flatTagMap = new Map<string, string[]>();
    for (const tag of tags) {
      flatTagMap.set(tag, this.index.getFilesWithTag(tag));
    }
    return findClusterMatchedFiles(flatTagMap, tags, minMatches);
  }

  /** Pass-through to VaultIndex.getFilesWithTag (Phase 2 D-05). */
  getFilesWithTag(tag: string): string[] {
    return this.index.getFilesWithTag(tag);
  }

  /** Pass-through to VaultIndex.getTagTree (Phase 2 D-04). */
  getTagHierarchy(): Map<string, TagNode> {
    return this.index.getTagTree();
  }

  /**
   * Top-level tag names sorted alphabetically. Convenience for sidebar (Phase 7).
   */
  getAllTags(): string[] {
    return [...this.index.getTagTree().keys()].sort();
  }
}
```

Constraints:
- File ≤ 80 lines (target ~55)
- Functions ≤ 30 lines
- No Obsidian imports (only VaultIndex + types)
- No console calls
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "^export default class TagManager" src/TagManager.ts` outputs 1
    - `grep -c "from 'obsidian'" src/TagManager.ts` outputs 0
    - `grep "import VaultIndex from './VaultIndex'" src/TagManager.ts` matches 1 line
    - `grep "from './lib/tag-cluster'" src/TagManager.ts | grep -c "findClusterMatchedFiles"` outputs 1
    - `grep "from './lib/vault-index-types'" src/TagManager.ts | grep -c "TagNode"` outputs 1
    - `grep -c "getNotesWithTagCluster" src/TagManager.ts` outputs at least 1
    - `grep -c "getFilesWithTag" src/TagManager.ts` outputs at least 2 (declaration + delegation call)
    - `grep -c "getTagHierarchy" src/TagManager.ts` outputs at least 1
    - `grep -c "getAllTags" src/TagManager.ts` outputs at least 1
    - `grep -c "console" src/TagManager.ts` outputs 0
    - `wc -l src/TagManager.ts` outputs ≤ 80
  </acceptance_criteria>
  <done>TagManager exposes 4 methods: cluster query + 3 pass-throughs. Stateless. No Obsidian dependency.</done>
</task>

<task type="auto">
  <name>Task 3: Wire TagManager into main.ts</name>
  <files>src/main.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (current state — output of Phase 5 Plan 05-03)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/TagManager.ts (Task 2 — public surface)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/06-tagmanager-tag-hierarchy/06-CONTEXT.md (D-08, D-09)
  </read_first>
  <action>
Edit `src/main.ts`:

1. Add import after the existing TocGenerator import:
```typescript
import TagManager from './TagManager';
```

2. Add field on KBManagerPlugin (after `tocGenerator!: TocGenerator;`):
```typescript
tagManager!: TagManager;
```

3. Inside `onload()`, AFTER `this.index = new VaultIndex(...)` and BEFORE the generator
   instantiations (or wherever fits naturally — TagManager has no dependencies on the
   generators, just on VaultIndex):
```typescript
this.tagManager = new TagManager(this.index);
```

The TagManager has no `onLayoutReady` work or rebuild hooks — it's a stateless facade. No
other changes to main.ts.

Build:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "TagManager" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "import TagManager from './TagManager'" src/main.ts` outputs 1
    - `grep -c "tagManager!: TagManager" src/main.ts` outputs 1
    - `grep -c "new TagManager(this.index)" src/main.ts` outputs 1
    - `grep -B5 "new TagManager(this.index)" src/main.ts | grep -c "this.index = new VaultIndex"` outputs 1 (TagManager instantiated AFTER VaultIndex)
    - `grep -c "TagManager" src/main.ts` outputs at least 4 (import + field declaration + instantiation + type usage)
    - `wc -l src/main.ts` outputs ≤ 295
  </acceptance_criteria>
  <done>TagManager instantiated in onload after VaultIndex. No rebuild hook (D-08 stateless facade). Phase 7 sidebar will consume this.tagManager directly.</done>
</task>

</tasks>

<verification>
After all tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build
```
Expected: exit 0.

Functional verification (TAG-01, TAG-02, TAG-03) is performed by Plan 06-02 Vitest tests
plus a manual UAT on a dev vault with notes tagged like `#api`, `#backend`, `#frontend`,
`#api/v2`, `#backend/auth`. Cluster query for `['api', 'backend']` should return notes
that apply BOTH tags exactly. Tag tree at `tagManager.getTagHierarchy()` should match
the structure printed by `tagManager.getAllTags()` for top-level names.
</verification>
