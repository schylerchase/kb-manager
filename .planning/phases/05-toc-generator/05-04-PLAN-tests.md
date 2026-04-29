---
phase: 05-toc-generator
plan: 04
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/toc-builder.test.ts
autonomous: true
requirements:
  - TOC-01
  - TOC-03
  - TOC-04
  - TOC-05
must_haves:
  truths:
    - "src/lib/toc-builder.test.ts exists and runs under Vitest"
    - "Tests cover buildPerNoteTocBody for empty, h1-only, h1+h2+h3 nested, h4+ filter, all-h4-or-deeper placeholder, basename extraction, indentation"
    - "Tests cover buildIndexFile for notes-with-h1, notes-without-h1, mixed, vault-root edge case, frontmatter format, alphabetical sort"
    - "Tests assert INDEX_FRONTMATTER_KEYS deepEquals ['kb-managed', 'kb-type', 'kb-folder']"
    - "Tests assert MAX_TOC_DEPTH constant equals 3"
    - "All tests pass: npm test exits 0"
  artifacts:
    - path: "src/lib/toc-builder.test.ts"
      provides: "Vitest test suite for toc-builder.ts pure logic"
      exports: []
  key_links:
    - from: "src/lib/toc-builder.test.ts"
      to: "src/lib/toc-builder.ts"
      via: "import { buildPerNoteTocBody, buildIndexFile, MAX_TOC_DEPTH, INDEX_FRONTMATTER_KEYS } from './toc-builder'"
      pattern: "from.*toc-builder"
---

<objective>
Vitest test suite for `src/lib/toc-builder.ts`. Validates D-01..D-06 (per-note TOC body)
and D-10..D-15 (INDEX.md content) at the unit level.

Output: src/lib/toc-builder.test.ts.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-01-PLAN-pure-logic-toc-builder.md

<!-- Pattern: src/lib/moc-builder.test.ts (Phase 4 Plan 04-04) is the closest analog —
     same Vitest style, same describe/it shape, same pure-logic-only approach. -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write Vitest tests for toc-builder.ts</name>
  <files>src/lib/toc-builder.test.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/moc-builder.test.ts (closest analog — Vitest style for pure-logic in src/lib/) — note: this file is created by Phase 4 Plan 04-04; if absent, follow tag-utils.test.ts style instead
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.test.ts (fallback Vitest style reference)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/toc-builder.ts (the SUT)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts (HeadingRecord shape)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-CONTEXT.md (D-01..D-06 + D-10..D-15)
  </read_first>
  <behavior>
    - buildPerNoteTocBody: empty → '<!-- no headings -->'
    - buildPerNoteTocBody h1-only single → '- [[note#Top]]'
    - buildPerNoteTocBody h1+h2+h3 → indented hierarchy
    - buildPerNoteTocBody filters h4+
    - buildPerNoteTocBody all-h4 → '<!-- no headings -->' placeholder
    - buildPerNoteTocBody basename extraction (path stripped, .md stripped)
    - buildPerNoteTocBody preserves heading text exactly (no escape)
    - buildIndexFile notes-with-h1 → '### basename\n- [[basename#h1]]'
    - buildIndexFile notes-without-h1 → '### basename\n_(no h1 headings)_'
    - buildIndexFile mixed → both shapes present
    - buildIndexFile sort alphabetical case-insensitive
    - buildIndexFile folderPath='' → '# INDEX: vault root'
    - buildIndexFile folderPath='notes' → '# INDEX: notes'
    - buildIndexFile frontmatter is exactly: ---\nkb-managed: true\nkb-type: index\nkb-folder: <folder>\n---
    - buildIndexFile with empty notes array → frontmatter + h1 + (no '## Notes' section)
    - INDEX_FRONTMATTER_KEYS deepEquals expected
    - MAX_TOC_DEPTH equals 3
  </behavior>
  <action>
Create `src/lib/toc-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildPerNoteTocBody,
  buildIndexFile,
  INDEX_FRONTMATTER_KEYS,
  MAX_TOC_DEPTH,
  IndexBuildInput,
} from './toc-builder';
import { HeadingRecord } from './vault-index-types';

const h = (text: string, level: number): HeadingRecord => ({ text, level });

describe('buildPerNoteTocBody', () => {
  it('returns placeholder for empty headings', () => {
    expect(buildPerNoteTocBody('foo.md', [])).toBe('<!-- no headings -->');
  });

  it('emits single h1 with no indent', () => {
    expect(buildPerNoteTocBody('foo.md', [h('Top', 1)])).toBe('- [[foo#Top]]');
  });

  it('indents h2 by 2 spaces and h3 by 4 spaces', () => {
    const result = buildPerNoteTocBody('foo.md', [h('Top', 1), h('Sub', 2), h('Detail', 3)]);
    expect(result).toBe('- [[foo#Top]]\n  - [[foo#Sub]]\n    - [[foo#Detail]]');
  });

  it('filters out h4+ headings', () => {
    const result = buildPerNoteTocBody('foo.md', [h('Keep', 1), h('Skip', 4)]);
    expect(result).toBe('- [[foo#Keep]]');
    expect(result).not.toContain('Skip');
  });

  it('returns placeholder when all headings are h4 or deeper', () => {
    const result = buildPerNoteTocBody('foo.md', [h('A', 4), h('B', 5), h('C', 6)]);
    expect(result).toBe('<!-- no headings -->');
  });

  it('extracts basename from full path', () => {
    expect(buildPerNoteTocBody('notes/projects/foo.md', [h('X', 1)])).toBe('- [[foo#X]]');
  });

  it('strips .md extension', () => {
    const result = buildPerNoteTocBody('foo.md', [h('X', 1)]);
    expect(result).not.toContain('foo.md');
    expect(result).toContain('foo#X');
  });

  it('preserves heading text exactly (no escaping)', () => {
    const result = buildPerNoteTocBody('foo.md', [h('Heading with: special / chars', 1)]);
    expect(result).toContain('Heading with: special / chars');
  });

  it('handles file without .md extension', () => {
    expect(buildPerNoteTocBody('README', [h('X', 1)])).toBe('- [[README#X]]');
  });
});

describe('buildIndexFile', () => {
  it('emits frontmatter with kb-managed/kb-type/kb-folder', () => {
    const result = buildIndexFile({ folderPath: 'notes', notes: [] });
    expect(result).toContain('---\nkb-managed: true\nkb-type: index\nkb-folder: notes\n---');
  });

  it('uses "vault root" for empty folderPath h1', () => {
    const result = buildIndexFile({ folderPath: '', notes: [] });
    expect(result).toContain('# INDEX: vault root');
    expect(result).toContain('kb-folder: \n'); // empty value preserved
  });

  it('uses folderPath as-is for non-root folder h1', () => {
    const result = buildIndexFile({ folderPath: 'notes/projects', notes: [] });
    expect(result).toContain('# INDEX: notes/projects');
  });

  it('omits "## Notes" section when notes array is empty', () => {
    const result = buildIndexFile({ folderPath: 'notes', notes: [] });
    expect(result).not.toContain('## Notes');
  });

  it('lists notes-with-h1 as bullet wikilinks', () => {
    const result = buildIndexFile({
      folderPath: 'notes',
      notes: [{ filePath: 'notes/spec.md', headings: [h('Plan', 1)] }],
    });
    expect(result).toContain('### spec\n- [[spec#Plan]]');
  });

  it('emits placeholder for notes without h1', () => {
    const result = buildIndexFile({
      folderPath: 'notes',
      notes: [{ filePath: 'notes/foo.md', headings: [h('Sub', 2)] }],
    });
    expect(result).toContain('### foo\n_(no h1 headings)_');
  });

  it('handles mixed notes (with-h1 and without-h1)', () => {
    const result = buildIndexFile({
      folderPath: 'notes',
      notes: [
        { filePath: 'notes/with.md', headings: [h('Title', 1)] },
        { filePath: 'notes/without.md', headings: [h('Sub', 2)] },
      ],
    });
    expect(result).toContain('### with\n- [[with#Title]]');
    expect(result).toContain('### without\n_(no h1 headings)_');
  });

  it('sorts notes alphabetically by basename, case-insensitive', () => {
    const result = buildIndexFile({
      folderPath: 'notes',
      notes: [
        { filePath: 'notes/cherry.md', headings: [h('C', 1)] },
        { filePath: 'notes/Banana.md', headings: [h('B', 1)] },
        { filePath: 'notes/apple.md', headings: [h('A', 1)] },
      ],
    });
    const idxApple = result.indexOf('### apple');
    const idxBanana = result.indexOf('### Banana');
    const idxCherry = result.indexOf('### cherry');
    expect(idxApple).toBeLessThan(idxBanana);
    expect(idxBanana).toBeLessThan(idxCherry);
  });

  it('emits multiple h1 bullets when a note has multiple h1 headings', () => {
    const result = buildIndexFile({
      folderPath: 'notes',
      notes: [{ filePath: 'notes/multi.md', headings: [h('First', 1), h('Second', 1)] }],
    });
    expect(result).toContain('- [[multi#First]]\n- [[multi#Second]]');
  });

  it('keeps "## Notes" h2 separator before per-note h3 entries', () => {
    const result = buildIndexFile({
      folderPath: 'notes',
      notes: [{ filePath: 'notes/foo.md', headings: [h('X', 1)] }],
    });
    expect(result).toMatch(/## Notes\n\n### foo/);
  });
});

describe('constants', () => {
  it('MAX_TOC_DEPTH equals 3', () => {
    expect(MAX_TOC_DEPTH).toBe(3);
  });

  it('INDEX_FRONTMATTER_KEYS has the expected three keys in order', () => {
    expect([...INDEX_FRONTMATTER_KEYS]).toEqual(['kb-managed', 'kb-type', 'kb-folder']);
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
    - Output contains "toc-builder" in pass list
    - Output contains at least 19 passing tests for this file (≥ 9 buildPerNoteTocBody, ≥ 8 buildIndexFile, 2 constants)
    - `grep -c "^describe(" src/lib/toc-builder.test.ts` outputs at least 3
    - `grep -c "^  it(" src/lib/toc-builder.test.ts` outputs at least 19
    - `grep "import.*from.*'./toc-builder'" src/lib/toc-builder.test.ts | grep -c "buildPerNoteTocBody"` outputs 1
    - `grep "import.*from.*'./toc-builder'" src/lib/toc-builder.test.ts | grep -c "buildIndexFile"` outputs 1
    - `grep "import.*from.*'./toc-builder'" src/lib/toc-builder.test.ts | grep -c "MAX_TOC_DEPTH"` outputs 1
    - `grep "import.*from.*'./toc-builder'" src/lib/toc-builder.test.ts | grep -c "INDEX_FRONTMATTER_KEYS"` outputs 1
    - `grep -c "from 'obsidian'" src/lib/toc-builder.test.ts` outputs 0 (no Obsidian dep)
    - `wc -l src/lib/toc-builder.test.ts` outputs ≤ 220
  </acceptance_criteria>
  <done>Vitest tests pass. Coverage spans all D-01..D-06 per-note TOC behaviors and D-10..D-15 INDEX.md behaviors.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm test
```
Expected: all tests pass (Phases 1, 2, 4, 5 unit suites combined). Per-note TOC injection
inside delimited sections (TOC-01) and INDEX.md write/skip semantics (D-16) require Obsidian
and are validated via Phase 5 manual UAT (Plan 05-03 verification).
</verification>
