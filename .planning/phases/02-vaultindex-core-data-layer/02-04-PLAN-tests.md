---
phase: 02-vaultindex-core-data-layer
plan: 04
type: tdd
wave: 2
depends_on:
  - 02-01
files_modified:
  - src/lib/tag-utils.test.ts
autonomous: true
requirements:
  - INDX-02
  - INDX-03
must_haves:
  truths:
    - "npm test exits 0 with all tag-utils tests passing"
    - "normalizeTag('#Parent/Child') returns 'parent/child' (verified by test)"
    - "normalizeTags(['#A', '#a', '#b']) returns ['a', 'b'] — deduplication confirmed by test"
    - "buildTagTree with a file tagged #parent/child has a root 'parent' node with children Map containing 'child' key"
    - "buildTagTree with two files sharing tag 'api' has node.files length of 2"
    - "buildFlatTagMap with two files on same tag maps that tag to array of both file paths"
    - "indexFolders(['notes/foo.md', 'notes/bar.md']) produces FolderRecord at 'notes' with files.length === 2"
    - "indexFolders(['root.md']) produces FolderRecord at '' with files containing 'root.md'"
    - "indexFolders([]) returns a Map with size 0"
  artifacts:
    - path: "src/lib/tag-utils.test.ts"
      provides: "Vitest unit tests for all 5 tag-utils functions"
      exports: []
  key_links:
    - from: "src/lib/tag-utils.test.ts"
      to: "src/lib/tag-utils.ts"
      via: "import { normalizeTag, normalizeTags, buildTagTree, buildFlatTagMap, indexFolders } from './tag-utils'"
      pattern: "from.*tag-utils"
---

<objective>
Write the Vitest unit test suite for all five pure-logic functions in tag-utils.ts. These tests
exercise the tag normalization, hierarchy building, and folder indexing logic without any Obsidian
mocking — pure TypeScript in, pure TypeScript out.

Purpose: Confirm the core data-layer logic is correct before VaultIndex (Plan 02-02) calls it
against a live vault. Tests also document the exact behavior contracts downstream generators depend on.

Output: src/lib/tag-utils.test.ts (Vitest suite)

Note: This plan is wave 2 (parallel with Plan 02-02) because it depends only on the pure-logic
modules from Plan 02-01, not on the Obsidian-coupled VaultIndex class.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md

<interfaces>
<!-- Existing test pattern from Phase 1: -->
// src/lib/exclusions.test.ts:
import { describe, it, expect } from 'vitest';
import { isExcluded } from './exclusions';
describe('isExcluded', () => {
  it('returns true when pattern matches the first path segment', () => {
    expect(isExcluded('templates/foo.md', ['templates'])).toBe(true);
  });
  // ... more it() blocks
});

<!-- Functions under test (from src/lib/tag-utils.ts): -->
export function normalizeTag(rawTag: string): string
export function normalizeTags(rawTags: string[]): string[]
export function buildTagTree(fileTagPairs: Array<{ filePath: string; tags: string[] }>): Map<string, TagNode>
export function buildFlatTagMap(fileTagPairs: Array<{ filePath: string; tags: string[] }>): Map<string, string[]>
export function indexFolders(filePaths: string[]): Map<string, FolderRecord>

<!-- TagNode shape (for assertions): -->
interface TagNode { files: string[]; children: Map<string, TagNode>; }
<!-- FolderRecord shape (for assertions): -->
interface FolderRecord { path: string; name: string; files: string[]; }
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write tag-utils.test.ts — full Vitest coverage for all 5 functions</name>
  <files>src/lib/tag-utils.test.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.ts (MUST read — confirm exact function signatures and behavior before writing tests against them)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/exclusions.test.ts (test file pattern: describe/it/expect structure, import style)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts (TagNode and FolderRecord shapes for typed assertions)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/02-vaultindex-core-data-layer/02-CONTEXT.md (D-02: normalization rules; D-04: tree shape; D-05: flat map semantics)
  </read_first>
  <action>
Create `src/lib/tag-utils.test.ts`. Follow the exact test pattern from exclusions.test.ts:
`import { describe, it, expect } from 'vitest'` at top; one `describe` block per function;
2–5 `it()` cases per function.

Write the following test cases:

**normalizeTag (4 cases):**
```typescript
describe('normalizeTag', () => {
  it('strips # prefix and lowercases', () => {
    expect(normalizeTag('#Parent/Child')).toBe('parent/child');
  });
  it('lowercases without # prefix', () => {
    expect(normalizeTag('UPPER')).toBe('upper');
  });
  it('returns already-normalized tag unchanged', () => {
    expect(normalizeTag('already')).toBe('already');
  });
  it('handles single-segment tag with #', () => {
    expect(normalizeTag('#api')).toBe('api');
  });
});
```

**normalizeTags (4 cases):**
```typescript
describe('normalizeTags', () => {
  it('deduplicates after normalization', () => {
    expect(normalizeTags(['#A', '#a', '#b'])).toEqual(['a', 'b']);
  });
  it('returns empty array for empty input', () => {
    expect(normalizeTags([])).toEqual([]);
  });
  it('preserves first-occurrence order during deduplication', () => {
    expect(normalizeTags(['#b', '#a', '#b'])).toEqual(['b', 'a']);
  });
  it('normalizes mixed # and no-# input', () => {
    expect(normalizeTags(['#Tag', 'tag'])).toEqual(['tag']);
  });
});
```

**buildTagTree (5 cases):**
```typescript
describe('buildTagTree', () => {
  it('creates root node for single-segment tag', () => {
    const tree = buildTagTree([{ filePath: 'a.md', tags: ['api'] }]);
    expect(tree.has('api')).toBe(true);
    expect(tree.get('api')!.files).toEqual(['a.md']);
    expect(tree.get('api')!.children.size).toBe(0);
  });
  it('creates nested child for parent/child tag', () => {
    const tree = buildTagTree([{ filePath: 'a.md', tags: ['parent/child'] }]);
    expect(tree.has('parent')).toBe(true);
    expect(tree.get('parent')!.files).toEqual([]);
    expect(tree.get('parent')!.children.has('child')).toBe(true);
    expect(tree.get('parent')!.children.get('child')!.files).toEqual(['a.md']);
  });
  it('accumulates multiple files on same tag', () => {
    const tree = buildTagTree([
      { filePath: 'a.md', tags: ['api'] },
      { filePath: 'b.md', tags: ['api'] },
    ]);
    expect(tree.get('api')!.files).toHaveLength(2);
    expect(tree.get('api')!.files).toContain('a.md');
    expect(tree.get('api')!.files).toContain('b.md');
  });
  it('returns empty map for empty input', () => {
    expect(buildTagTree([])).toEqual(new Map());
  });
  it('handles a file with multiple tags', () => {
    const tree = buildTagTree([{ filePath: 'a.md', tags: ['api', 'backend'] }]);
    expect(tree.has('api')).toBe(true);
    expect(tree.has('backend')).toBe(true);
  });
});
```

**buildFlatTagMap (4 cases):**
```typescript
describe('buildFlatTagMap', () => {
  it('maps tag to single file', () => {
    const map = buildFlatTagMap([{ filePath: 'a.md', tags: ['api'] }]);
    expect(map.get('api')).toEqual(['a.md']);
  });
  it('accumulates multiple files for same tag', () => {
    const map = buildFlatTagMap([
      { filePath: 'a.md', tags: ['api'] },
      { filePath: 'b.md', tags: ['api'] },
    ]);
    expect(map.get('api')).toHaveLength(2);
    expect(map.get('api')).toContain('a.md');
    expect(map.get('api')).toContain('b.md');
  });
  it('returns empty map for empty input', () => {
    expect(buildFlatTagMap([])).toEqual(new Map());
  });
  it('keeps separate entries for distinct tags', () => {
    const map = buildFlatTagMap([{ filePath: 'a.md', tags: ['api', 'backend'] }]);
    expect(map.has('api')).toBe(true);
    expect(map.has('backend')).toBe(true);
    expect(map.get('api')).toEqual(['a.md']);
  });
});
```

**indexFolders (5 cases):**
```typescript
describe('indexFolders', () => {
  it('groups files under their parent folder', () => {
    const map = indexFolders(['notes/foo.md', 'notes/bar.md']);
    expect(map.has('notes')).toBe(true);
    const folder = map.get('notes')!;
    expect(folder.path).toBe('notes');
    expect(folder.name).toBe('notes');
    expect(folder.files).toHaveLength(2);
    expect(folder.files).toContain('notes/foo.md');
    expect(folder.files).toContain('notes/bar.md');
  });
  it('places root-level files under empty-string key', () => {
    const map = indexFolders(['root.md']);
    expect(map.has('')).toBe(true);
    expect(map.get('')!.path).toBe('');
    expect(map.get('')!.name).toBe('');
    expect(map.get('')!.files).toContain('root.md');
  });
  it('returns empty Map for empty input', () => {
    expect(indexFolders([])).toEqual(new Map());
  });
  it('creates separate entries for different folders', () => {
    const map = indexFolders(['notes/a.md', 'archive/b.md']);
    expect(map.size).toBe(2);
    expect(map.has('notes')).toBe(true);
    expect(map.has('archive')).toBe(true);
  });
  it('handles deeply nested paths', () => {
    const map = indexFolders(['a/b/c/file.md']);
    expect(map.has('a/b/c')).toBe(true);
    expect(map.get('a/b/c')!.name).toBe('c');
  });
});
```

Import block at top of file:
```typescript
import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeTags,
  buildTagTree,
  buildFlatTagMap,
  indexFolders,
} from './tag-utils';
```

No other imports needed. File must stay under 200 lines. No console.log.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm test -- --reporter=verbose src/lib/tag-utils.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm test -- --reporter=verbose src/lib/tag-utils.test.ts` exits 0
    - Test output shows 5 describe blocks: normalizeTag, normalizeTags, buildTagTree, buildFlatTagMap, indexFolders
    - Test output shows at least 22 passing tests (4 + 4 + 5 + 4 + 5)
    - Zero failing tests
    - Zero skipped tests
    - `grep -c "^import" src/lib/tag-utils.test.ts` outputs `1` (single import block from vitest) OR `2` (vitest + tag-utils) — both acceptable
    - `grep "from './tag-utils'" src/lib/tag-utils.test.ts` matches exactly 1 line
    - `grep -c "console" src/lib/tag-utils.test.ts` outputs `0`
  </acceptance_criteria>
  <done>src/lib/tag-utils.test.ts passes all 22+ Vitest tests, covering normalizeTag, normalizeTags, buildTagTree, buildFlatTagMap, and indexFolders with edge cases (empty inputs, deduplication, nesting, root-level files)</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none) | Test file has no trust boundaries — pure in-process unit tests with no I/O, no external calls |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-11 | (none) | tag-utils.test.ts | accept | Unit test file; no production code paths; no threat surface |
</threat_model>

<verification>
After task completes:

```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm test
```
Full test suite must exit 0. Phase 1 tests (exclusions, delimiter, settings-parser) must continue
to pass alongside the new tag-utils tests.

```bash
grep -r "from 'obsidian'" /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.test.ts
```
Must return zero results (test file has no Obsidian imports).
</verification>

<success_criteria>
- src/lib/tag-utils.test.ts exists with 5 describe blocks and 22+ total it() cases
- All tests pass: npm test exits 0
- Previously passing Phase 1 tests remain green (no regression)
- Test file has zero Obsidian imports — pure Vitest
</success_criteria>

<output>
After completion, create `.planning/phases/02-vaultindex-core-data-layer/02-04-SUMMARY.md`
using the summary template.
</output>
