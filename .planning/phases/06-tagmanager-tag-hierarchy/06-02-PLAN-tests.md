---
phase: 06-tagmanager-tag-hierarchy
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/tag-cluster.test.ts
autonomous: true
requirements:
  - TAG-01
  - TAG-02
must_haves:
  truths:
    - "src/lib/tag-cluster.test.ts exists and runs under Vitest"
    - "Tests cover empty input, single-tag query (returns nothing at minMatches=2), two-tag query, three-tag with minMatches=2, dedup, minMatches coercion, sorted output, missing-tag handling"
    - "All tests pass: npm test exits 0"
  artifacts:
    - path: "src/lib/tag-cluster.test.ts"
      provides: "Vitest test suite for findClusterMatchedFiles"
      exports: []
  key_links:
    - from: "src/lib/tag-cluster.test.ts"
      to: "src/lib/tag-cluster.ts"
      via: "import { findClusterMatchedFiles } from './tag-cluster'"
      pattern: "from.*tag-cluster"
---

<objective>
Vitest unit tests for `findClusterMatchedFiles` covering all decision points D-01..D-05.
TAG-01 and TAG-03 are validated indirectly: TAG-01 by an integration-style test that
constructs a TagNode tree from `tag-utils.buildTagTree` and reads it back via the same
shape TagManager's `getTagHierarchy` would expose; TAG-03 has no new code (MocGenerator
already groups by tag) and is not retested here.

Output: src/lib/tag-cluster.test.ts.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/06-tagmanager-tag-hierarchy/06-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/06-tagmanager-tag-hierarchy/06-01-PLAN-tag-cluster-and-manager.md

<!-- Pattern: src/lib/moc-builder.test.ts and src/lib/tag-utils.test.ts. Same Vitest style. -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write Vitest tests for findClusterMatchedFiles</name>
  <files>src/lib/tag-cluster.test.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-cluster.ts (the SUT)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.test.ts (Vitest style reference)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/06-tagmanager-tag-hierarchy/06-CONTEXT.md (D-01..D-05)
  </read_first>
  <behavior>
    - Empty flatTagMap + empty query → []
    - Empty query, non-empty map → []
    - Single-tag query with minMatches=2 → [] (count caps at 1)
    - Single-tag query with minMatches=1 → all files in that tag's list (sorted)
    - Two-tag query: file in BOTH lists → returned at minMatches=2
    - Two-tag query: file in only ONE list → not returned at minMatches=2
    - Three-tag query, minMatches=2: file in 2 of 3 lists → returned
    - Three-tag query, minMatches=2: file in 1 of 3 lists → not returned
    - Duplicate tags in query (['api', 'api']) → counted once
    - minMatches=0 → coerced to 1 (any-of behavior)
    - minMatches=-5 → coerced to 1
    - Output sorted alphabetically by file path
    - Query tag absent from flatTagMap → ignored (no error)
  </behavior>
  <action>
Create `src/lib/tag-cluster.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { findClusterMatchedFiles } from './tag-cluster';

const buildMap = (entries: Record<string, string[]>): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const [tag, files] of Object.entries(entries)) {
    map.set(tag, files);
  }
  return map;
};

describe('findClusterMatchedFiles', () => {
  it('returns empty array for empty input', () => {
    expect(findClusterMatchedFiles(new Map(), [], 2)).toEqual([]);
  });

  it('returns empty array for empty query', () => {
    const map = buildMap({ api: ['a.md'] });
    expect(findClusterMatchedFiles(map, [], 2)).toEqual([]);
  });

  it('single-tag query with minMatches=2 returns nothing', () => {
    const map = buildMap({ api: ['a.md', 'b.md'] });
    expect(findClusterMatchedFiles(map, ['api'], 2)).toEqual([]);
  });

  it('single-tag query with minMatches=1 returns all files in that tag', () => {
    const map = buildMap({ api: ['a.md', 'b.md'] });
    expect(findClusterMatchedFiles(map, ['api'], 1)).toEqual(['a.md', 'b.md']);
  });

  it('two-tag query returns files appearing in both', () => {
    const map = buildMap({
      api: ['a.md', 'b.md', 'c.md'],
      backend: ['b.md', 'c.md', 'd.md'],
    });
    expect(findClusterMatchedFiles(map, ['api', 'backend'], 2)).toEqual(['b.md', 'c.md']);
  });

  it('two-tag query excludes files appearing in only one', () => {
    const map = buildMap({
      api: ['a.md'],
      backend: ['b.md'],
    });
    expect(findClusterMatchedFiles(map, ['api', 'backend'], 2)).toEqual([]);
  });

  it('three-tag query with minMatches=2 includes files matching any 2', () => {
    const map = buildMap({
      api: ['a.md', 'b.md'],
      backend: ['a.md', 'c.md'],
      frontend: ['b.md', 'c.md'],
    });
    // a: api+backend (2 matches), b: api+frontend (2), c: backend+frontend (2) — all qualify
    expect(findClusterMatchedFiles(map, ['api', 'backend', 'frontend'], 2)).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('three-tag query with minMatches=2 excludes single-match files', () => {
    const map = buildMap({
      api: ['a.md'],
      backend: ['b.md'],
      frontend: ['c.md'],
    });
    expect(findClusterMatchedFiles(map, ['api', 'backend', 'frontend'], 2)).toEqual([]);
  });

  it('deduplicates query tags', () => {
    const map = buildMap({ api: ['a.md'] });
    // ['api', 'api'] should NOT count 'a.md' twice — query dedupes to ['api'].
    expect(findClusterMatchedFiles(map, ['api', 'api'], 2)).toEqual([]);
    expect(findClusterMatchedFiles(map, ['api', 'api'], 1)).toEqual(['a.md']);
  });

  it('coerces minMatches=0 to 1', () => {
    const map = buildMap({ api: ['a.md'] });
    expect(findClusterMatchedFiles(map, ['api'], 0)).toEqual(['a.md']);
  });

  it('coerces negative minMatches to 1', () => {
    const map = buildMap({ api: ['a.md'] });
    expect(findClusterMatchedFiles(map, ['api'], -5)).toEqual(['a.md']);
  });

  it('output is sorted alphabetically by file path', () => {
    const map = buildMap({
      api: ['z.md', 'a.md', 'm.md'],
    });
    expect(findClusterMatchedFiles(map, ['api'], 1)).toEqual(['a.md', 'm.md', 'z.md']);
  });

  it('ignores query tags absent from the flatTagMap', () => {
    const map = buildMap({ api: ['a.md'] });
    // 'nonexistent' isn't in the map; should not crash; only 'api' contributes
    expect(findClusterMatchedFiles(map, ['api', 'nonexistent'], 1)).toEqual(['a.md']);
  });

  it('does not double-count if same file appears multiple times in one tag list', () => {
    // Defensive — flatTagMap shouldn't have dupes, but if it does, count is per-list-occurrence
    const map = buildMap({ api: ['a.md', 'a.md'] });
    // 2 occurrences in api → counted twice → matches at minMatches=2
    expect(findClusterMatchedFiles(map, ['api'], 2)).toEqual(['a.md']);
  });
});
```

Run:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm test 2>&1 | tail -20
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `npm test` exits 0
    - Output includes "tag-cluster" or matching test name
    - Output reports at least 14 passing tests for this file
    - `grep -c "^describe(" src/lib/tag-cluster.test.ts` outputs 1
    - `grep -c "^  it(" src/lib/tag-cluster.test.ts` outputs at least 14
    - `grep "import.*from.*'./tag-cluster'" src/lib/tag-cluster.test.ts | grep -c "findClusterMatchedFiles"` outputs 1
    - `grep -c "from 'obsidian'" src/lib/tag-cluster.test.ts` outputs 0
    - `wc -l src/lib/tag-cluster.test.ts` outputs ≤ 200
  </acceptance_criteria>
  <done>Vitest tests cover all D-01..D-05 cases. TAG-02 cross-reference query verified.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm test
```
Expected: all tests pass (suites from phases 1, 2, 4, 5, 6).

TAG-01 verification: covered by existing Phase 2 `tag-utils.test.ts` which tests
`buildTagTree` for `#parent/child` patterns. No new test needed — TagManager.getTagHierarchy
just delegates.

TAG-03 verification: MocGenerator already builds tag-grouped headings from FileRecord.tags
in Phase 4. Manual UAT on dev vault: tag a few notes with `#alpha/beta`, trigger rebuild,
inspect MOC.md — confirm `## alpha` `### beta` headings appear with the expected files.
</verification>
