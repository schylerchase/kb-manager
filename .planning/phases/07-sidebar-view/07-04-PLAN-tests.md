---
phase: 07-sidebar-view
plan: 04
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/sidebar-data.test.ts
autonomous: true
requirements:
  - SIDE-01
  - SIDE-02
must_haves:
  truths:
    - "src/lib/sidebar-data.test.ts exists and runs under Vitest"
    - "Tests cover buildFolderTree empty input, single folder + file, nested folders, exclusion filter, kb-managed file filter, dedicated/inline hasMoc"
    - "Tests cover buildTagViewTree empty hierarchy, single tag with count, nested tag fullPath construction, sort order"
    - "All tests pass: npm test exits 0"
  artifacts:
    - path: "src/lib/sidebar-data.test.ts"
      provides: "Vitest test suite for sidebar-data.ts pure logic"
      exports: []
  key_links:
    - from: "src/lib/sidebar-data.test.ts"
      to: "src/lib/sidebar-data.ts"
      via: "import { buildFolderTree, buildTagViewTree, ... } from './sidebar-data'"
      pattern: "from.*sidebar-data"
---

<objective>
Vitest tests for `src/lib/sidebar-data.ts` covering folder tree assembly + filtering and
tag view tree mirroring + counting. No DOM, no Obsidian — tests the data prep layer.

Output: src/lib/sidebar-data.test.ts.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-01-PLAN-pure-logic-sidebar-data.md

<!-- Pattern: src/lib/moc-builder.test.ts and src/lib/toc-builder.test.ts. Same Vitest style. -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write Vitest tests for sidebar-data.ts</name>
  <files>src/lib/sidebar-data.test.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/sidebar-data.ts (the SUT)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/moc-builder.test.ts (Vitest style reference)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/exclusions.ts (provides the isExcluded fn passed to buildFolderTree)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-CONTEXT.md (D-08..D-13, D-15..D-19 — expected behavior)
  </read_first>
  <behavior>
    - buildFolderTree minimal: only root, no files → root node with empty childFolders/childFiles
    - buildFolderTree adds non-excluded child folders
    - buildFolderTree filters excluded folder paths
    - buildFolderTree filters kbManaged files
    - buildFolderTree sets hasMoc=true for dedicated folders, false for inline
    - buildFolderTree sorts childFolders alphabetically case-insensitive
    - buildFolderTree sorts childFiles alphabetically by basename case-insensitive
    - buildTagViewTree empty → []
    - buildTagViewTree single top-level tag with count
    - buildTagViewTree nested tag fullPath = 'parent/child'
    - buildTagViewTree count delegated to countForTag(fullPath)
    - buildTagViewTree children sorted alphabetically
  </behavior>
  <action>
Create `src/lib/sidebar-data.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildFolderTree, buildTagViewTree, FileEntry, FolderTreeNode } from './sidebar-data';
import { TagNode } from './vault-index-types';
import { isExcluded } from './exclusions';

const dedicated = () => 'dedicated' as const;
const inline = () => 'inline' as const;

const fileEntry = (path: string, kbManaged = false): FileEntry => ({
  path,
  basename: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''),
  kbManaged,
});

const tagNode = (children: Map<string, TagNode> = new Map()): TagNode => ({
  files: [],
  children,
});

describe('buildFolderTree', () => {
  it('returns root node with empty children for empty inputs', () => {
    const root = buildFolderTree([], new Map(), [], dedicated, isExcluded);
    expect(root.path).toBe('');
    expect(root.childFolders).toEqual([]);
    expect(root.childFiles).toEqual([]);
    expect(root.hasMoc).toBe(true);
  });

  it('attaches a child folder under root', () => {
    const root = buildFolderTree(['', 'notes'], new Map(), [], dedicated, isExcluded);
    expect(root.childFolders.map(f => f.path)).toEqual(['notes']);
  });

  it('attaches files at the right folder', () => {
    const filesByFolder = new Map([
      ['notes', [fileEntry('notes/foo.md'), fileEntry('notes/bar.md')]],
    ]);
    const root = buildFolderTree(['', 'notes'], filesByFolder, [], dedicated, isExcluded);
    const notes = root.childFolders.find(f => f.path === 'notes')!;
    expect(notes.childFiles.map(f => f.basename)).toEqual(['bar', 'foo']);
  });

  it('filters excluded folder paths', () => {
    const root = buildFolderTree(['', 'notes', 'archive'], new Map(), ['archive'], dedicated, isExcluded);
    expect(root.childFolders.map(f => f.path).includes('archive')).toBe(false);
    expect(root.childFolders.map(f => f.path).includes('notes')).toBe(true);
  });

  it('filters kbManaged files (MOC.md / INDEX.md)', () => {
    const filesByFolder = new Map([
      ['notes', [
        fileEntry('notes/foo.md', false),
        fileEntry('notes/MOC.md', true),
        fileEntry('notes/INDEX.md', true),
      ]],
    ]);
    const root = buildFolderTree(['', 'notes'], filesByFolder, [], dedicated, isExcluded);
    const notes = root.childFolders.find(f => f.path === 'notes')!;
    expect(notes.childFiles.map(f => f.basename)).toEqual(['foo']);
  });

  it('hasMoc=false when resolveFormat returns inline', () => {
    const root = buildFolderTree(['', 'notes'], new Map(), [], inline, isExcluded);
    const notes = root.childFolders.find(f => f.path === 'notes')!;
    expect(notes.hasMoc).toBe(false);
    expect(root.hasMoc).toBe(false);
  });

  it('sorts childFolders alphabetically case-insensitive', () => {
    const root = buildFolderTree(['', 'Zeta', 'alpha', 'Beta'], new Map(), [], dedicated, isExcluded);
    expect(root.childFolders.map(f => f.name)).toEqual(['alpha', 'Beta', 'Zeta']);
  });

  it('sorts childFiles alphabetically case-insensitive by basename', () => {
    const filesByFolder = new Map([
      ['notes', [
        fileEntry('notes/Banana.md'),
        fileEntry('notes/apple.md'),
        fileEntry('notes/cherry.md'),
      ]],
    ]);
    const root = buildFolderTree(['', 'notes'], filesByFolder, [], dedicated, isExcluded);
    const notes = root.childFolders.find(f => f.path === 'notes')!;
    expect(notes.childFiles.map(f => f.basename)).toEqual(['apple', 'Banana', 'cherry']);
  });

  it('handles nested folders', () => {
    const root = buildFolderTree(['', 'notes', 'notes/projects', 'notes/projects/alpha'], new Map(), [], dedicated, isExcluded);
    const notes = root.childFolders.find(f => f.path === 'notes')!;
    const projects = notes.childFolders.find(f => f.path === 'notes/projects')!;
    expect(projects.childFolders.map(f => f.path)).toEqual(['notes/projects/alpha']);
  });
});

describe('buildTagViewTree', () => {
  it('returns empty array for empty hierarchy', () => {
    expect(buildTagViewTree(new Map(), () => 0)).toEqual([]);
  });

  it('renders single top-level tag with count', () => {
    const hierarchy = new Map([['api', tagNode()]]);
    const result = buildTagViewTree(hierarchy, () => 5);
    expect(result).toEqual([
      { name: 'api', fullPath: 'api', count: 5, children: [] },
    ]);
  });

  it('builds nested fullPath as "parent/child"', () => {
    const child = tagNode();
    const parent = tagNode(new Map([['child', child]]));
    const hierarchy = new Map([['parent', parent]]);
    const result = buildTagViewTree(hierarchy, () => 1);
    expect(result[0].fullPath).toBe('parent');
    expect(result[0].children[0].fullPath).toBe('parent/child');
  });

  it('delegates count via countForTag(fullPath)', () => {
    const hierarchy = new Map([
      ['a', tagNode()],
      ['b', tagNode()],
    ]);
    const counts: Record<string, number> = { a: 7, b: 2 };
    const result = buildTagViewTree(hierarchy, (fp) => counts[fp] ?? 0);
    expect(result.find(n => n.name === 'a')?.count).toBe(7);
    expect(result.find(n => n.name === 'b')?.count).toBe(2);
  });

  it('sorts children alphabetically case-insensitive at every level', () => {
    const hierarchy = new Map([
      ['Zeta', tagNode()],
      ['alpha', tagNode()],
      ['Beta', tagNode()],
    ]);
    const result = buildTagViewTree(hierarchy, () => 0);
    expect(result.map(n => n.name)).toEqual(['alpha', 'Beta', 'Zeta']);
  });

  it('sorts nested children alphabetically', () => {
    const parent = tagNode(new Map([
      ['z', tagNode()],
      ['a', tagNode()],
    ]));
    const hierarchy = new Map([['top', parent]]);
    const result = buildTagViewTree(hierarchy, () => 0);
    expect(result[0].children.map(n => n.name)).toEqual(['a', 'z']);
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
    - Output includes "sidebar-data" or matching test file name
    - Output reports at least 15 passing tests for this file
    - `grep -c "^describe(" src/lib/sidebar-data.test.ts` outputs at least 2
    - `grep -c "^  it(" src/lib/sidebar-data.test.ts` outputs at least 15
    - `grep "import.*from.*'./sidebar-data'" src/lib/sidebar-data.test.ts | grep -c "buildFolderTree"` outputs 1
    - `grep "import.*from.*'./sidebar-data'" src/lib/sidebar-data.test.ts | grep -c "buildTagViewTree"` outputs 1
    - `grep -c "from 'obsidian'" src/lib/sidebar-data.test.ts` outputs 0
    - `wc -l src/lib/sidebar-data.test.ts` outputs ≤ 250
  </acceptance_criteria>
  <done>Vitest tests cover folder tree assembly + filtering + sort, and tag view tree mirroring + count delegation + sort.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm test
```
Expected: all tests pass (suites from phases 1, 2, 4, 5, 6, 7).

ItemView rendering and click handlers (SIDE-01, SIDE-03 refresh subscription, SIDE-04
restart persistence) require Obsidian and are validated via Phase 7 manual UAT
(Plan 07-03 verification block).
</verification>
