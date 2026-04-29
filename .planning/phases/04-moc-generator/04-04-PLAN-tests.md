---
phase: 04-moc-generator
plan: 04
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/moc-builder.test.ts
autonomous: true
requirements:
  - MOC-01
  - MOC-02
  - MOC-08
must_haves:
  truths:
    - "src/lib/moc-builder.test.ts exists and runs under Vitest"
    - "Test suite covers: empty input, single-tag, nested-tag, multi-tag-file, untagged section, h6 clamp, basename extraction, alphabetical sort"
    - "Test suite for buildDedicatedMocFile covers: frontmatter format, h1 with folder path, h1 with vault root, integration with buildMocBody output"
    - "All tests pass: npm test exits 0"
    - "DEDICATED_FRONTMATTER_KEYS is asserted to equal ['kb-managed', 'kb-type', 'kb-folder']"
  artifacts:
    - path: "src/lib/moc-builder.test.ts"
      provides: "Vitest test suite for moc-builder.ts"
      exports: []
  key_links:
    - from: "src/lib/moc-builder.test.ts"
      to: "src/lib/moc-builder.ts"
      via: "import { buildMocBody, buildDedicatedMocFile, DEDICATED_FRONTMATTER_KEYS } from './moc-builder'"
      pattern: "from.*moc-builder"
---

<objective>
Vitest test suite covering the pure-logic markdown generation in `src/lib/moc-builder.ts`
(Plan 04-01). Validates D-01..D-09 behaviors at the unit level so MocGenerator (Plan 04-02)
can rely on stable output. No Obsidian mocks needed — pure functions, deterministic input/output.

Output: src/lib/moc-builder.test.ts.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-01-PLAN-pure-logic-moc-builder.md

<!-- Pattern reference: src/lib/tag-utils.test.ts and src/lib/delimiter.test.ts already exist
     and follow the project's Vitest conventions. -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write Vitest tests for moc-builder.ts</name>
  <files>src/lib/moc-builder.test.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.test.ts (closest analog — Vitest style for pure-logic in src/lib/)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/delimiter.test.ts (Vitest style reference)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/moc-builder.ts (the SUT — buildMocBody, buildDedicatedMocFile)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts (TagNode interface for fixture construction)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-CONTEXT.md (D-01..D-09 — exact format expectations)
  </read_first>
  <behavior>
    - Empty input → empty string
    - Single tag, single file → '## tag\n- [[file]]\n'
    - Nested tag → headings increment by depth
    - Multi-tag file (file under both 'a' and 'b' in tagTree) → file appears under both sections
    - h6 clamp at depth 5+ slash segments
    - Untagged-only input → '## Untagged\n- [[file]]\n'
    - Mixed tagged + untagged → tag sections first, untagged last
    - Sort within each section alphabetical case-insensitive ('Banana' before 'cherry')
    - Files at deeper folder paths show as basename only (no path in wikilink)
    - buildDedicatedMocFile with non-empty folder → '# MOC: notes/projects'
    - buildDedicatedMocFile with '' (root) → '# MOC: vault root'
    - buildDedicatedMocFile frontmatter is exactly the 4 lines: ---\nkb-managed: true\nkb-type: moc\nkb-folder: <folder>\n---
    - DEDICATED_FRONTMATTER_KEYS deepEquals ['kb-managed', 'kb-type', 'kb-folder']
  </behavior>
  <action>
Create `src/lib/moc-builder.test.ts` mirroring the style of `tag-utils.test.ts`. Use
Vitest `describe`/`it`/`expect`. Each test focuses on one specific behavior.

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildMocBody,
  buildDedicatedMocFile,
  DEDICATED_FRONTMATTER_KEYS,
  MocBuildInput,
} from './moc-builder';
import { TagNode } from './vault-index-types';

/** Helper: build a TagNode tree from a flat list of {file, tags}. */
function buildTree(pairs: Array<{ file: string; tags: string[] }>): Map<string, TagNode> {
  const root = new Map<string, TagNode>();
  for (const { file, tags } of pairs) {
    for (const tag of tags) {
      const segments = tag.split('/');
      let current = root;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!current.has(seg)) current.set(seg, { files: [], children: new Map() });
        const node = current.get(seg)!;
        if (i === segments.length - 1) node.files.push(file);
        current = node.children;
      }
    }
  }
  return root;
}

describe('buildMocBody', () => {
  it('returns empty string for empty input', () => {
    const input: MocBuildInput = { tagTree: new Map(), untaggedFiles: [] };
    expect(buildMocBody(input)).toBe('');
  });

  it('renders single tag with single file', () => {
    const tagTree = buildTree([{ file: 'note.md', tags: ['api'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result).toBe('## api\n- [[note]]\n');
  });

  it('renders nested tag with incremented heading levels', () => {
    const tagTree = buildTree([{ file: 'spec.md', tags: ['project/alpha'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result).toBe('## project\n### alpha\n- [[spec]]\n');
  });

  it('lists multi-tag file under each tag section', () => {
    const tagTree = buildTree([{ file: 'note.md', tags: ['x', 'y'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    // tag order: alphabetical (x before y)
    expect(result).toContain('## x\n- [[note]]');
    expect(result).toContain('## y\n- [[note]]');
  });

  it('clamps heading depth at h6 for tags 5+ slashes deep', () => {
    const tagTree = buildTree([{ file: 'deep.md', tags: ['a/b/c/d/e/f/g'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    // Levels: a=h2, b=h3, c=h4, d=h5, e=h6, f=h6 (clamped), g=h6 (clamped)
    expect(result).toContain('## a');
    expect(result).toContain('### b');
    expect(result).toContain('#### c');
    expect(result).toContain('##### d');
    expect(result).toContain('###### e');
    // Multiple ###### entries for clamped levels
    const h6Count = (result.match(/^###### /gm) || []).length;
    expect(h6Count).toBeGreaterThanOrEqual(3); // e, f, g
  });

  it('renders Untagged section after tag sections', () => {
    const tagTree = buildTree([{ file: 'tagged.md', tags: ['api'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: ['untagged.md'] });
    expect(result).toContain('## api');
    expect(result).toContain('## Untagged');
    expect(result.indexOf('## api')).toBeLessThan(result.indexOf('## Untagged'));
    expect(result).toContain('- [[untagged]]');
  });

  it('omits Untagged section when no untagged files', () => {
    const tagTree = buildTree([{ file: 'note.md', tags: ['api'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result).not.toContain('## Untagged');
  });

  it('renders Untagged-only input', () => {
    const result = buildMocBody({ tagTree: new Map(), untaggedFiles: ['note.md'] });
    expect(result).toBe('## Untagged\n- [[note]]\n');
  });

  it('extracts basename only — no path in wikilink', () => {
    const tagTree = buildTree([{ file: 'notes/projects/spec.md', tags: ['api'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result).toContain('- [[spec]]');
    expect(result).not.toContain('notes/projects');
  });

  it('strips .md extension in basename', () => {
    const tagTree = buildTree([{ file: 'foo.md', tags: ['api'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result).toContain('- [[foo]]');
    expect(result).not.toContain('foo.md');
  });

  it('handles file without .md extension (defensive — leaves filename as-is)', () => {
    // Edge case — VaultIndex always provides .md paths, but builder shouldn't crash on others.
    const tagTree = buildTree([{ file: 'README', tags: ['docs'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result).toContain('- [[README]]');
  });

  it('sorts files within a section alphabetically case-insensitive', () => {
    const tagTree = buildTree([
      { file: 'cherry.md', tags: ['fruit'] },
      { file: 'Banana.md', tags: ['fruit'] },
      { file: 'apple.md', tags: ['fruit'] },
    ]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    const lines = result.split('\n').filter(l => l.startsWith('- '));
    expect(lines).toEqual(['- [[apple]]', '- [[Banana]]', '- [[cherry]]']);
  });

  it('sorts top-level tags alphabetically', () => {
    const tagTree = buildTree([
      { file: 'a.md', tags: ['zebra'] },
      { file: 'b.md', tags: ['apple'] },
    ]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result.indexOf('## apple')).toBeLessThan(result.indexOf('## zebra'));
  });
});

describe('buildDedicatedMocFile', () => {
  it('emits exact frontmatter block', () => {
    const result = buildDedicatedMocFile('notes/projects', '## api\n- [[a]]\n');
    expect(result.startsWith('---\nkb-managed: true\nkb-type: moc\nkb-folder: notes/projects\n---')).toBe(true);
  });

  it('emits "# MOC: <folder>" h1 for non-root folder', () => {
    const result = buildDedicatedMocFile('notes/projects', '');
    expect(result).toContain('# MOC: notes/projects');
  });

  it('emits "# MOC: vault root" h1 for empty folder path', () => {
    const result = buildDedicatedMocFile('', '');
    expect(result).toContain('# MOC: vault root');
    expect(result).toContain('kb-folder: \n'); // empty folder path serialized as empty string
  });

  it('appends body after the h1 with one blank line separator', () => {
    const body = '## api\n- [[a]]\n';
    const result = buildDedicatedMocFile('notes', body);
    expect(result).toContain('# MOC: notes\n\n## api');
  });

  it('round-trips with buildMocBody output', () => {
    const tagTree = buildTree([{ file: 'spec.md', tags: ['api'] }]);
    const body = buildMocBody({ tagTree, untaggedFiles: [] });
    const file = buildDedicatedMocFile('notes', body);
    expect(file).toContain('## api');
    expect(file).toContain('- [[spec]]');
  });
});

describe('DEDICATED_FRONTMATTER_KEYS', () => {
  it('is exactly the three expected keys in order', () => {
    expect([...DEDICATED_FRONTMATTER_KEYS]).toEqual(['kb-managed', 'kb-type', 'kb-folder']);
  });
});
```

Run tests:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm test 2>&1 | tail -20
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `npm test` exits 0
    - Output contains "moc-builder" or the test file name
    - Output contains at least 18 passing tests for this file (≥ 13 for buildMocBody, ≥ 5 for buildDedicatedMocFile, 1 for keys)
    - `grep -c "^describe(" src/lib/moc-builder.test.ts` outputs at least 3
    - `grep -c "^  it(" src/lib/moc-builder.test.ts` outputs at least 18
    - `grep "import.*from.*'./moc-builder'" src/lib/moc-builder.test.ts | grep -c "buildMocBody"` outputs 1
    - `grep "import.*from.*'./moc-builder'" src/lib/moc-builder.test.ts | grep -c "buildDedicatedMocFile"` outputs 1
    - `grep "import.*from.*'./moc-builder'" src/lib/moc-builder.test.ts | grep -c "DEDICATED_FRONTMATTER_KEYS"` outputs 1
    - `grep -c "from 'obsidian'" src/lib/moc-builder.test.ts` outputs 0 (no Obsidian dependency)
    - `wc -l src/lib/moc-builder.test.ts` outputs ≤ 220
  </acceptance_criteria>
  <done>Vitest tests pass. Coverage spans empty case, single tag, nested tag, multi-tag file, h6 clamp, untagged section, basename extraction, alphabetical sort within and across sections, dedicated file frontmatter format, vault-root edge case, frontmatter keys constant.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm test
```
Expected: all tests pass (Phase 1 + Phase 2 + Phase 4 unit suites). The moc-builder
suite covers MOC body and dedicated-file generation. Inline injection (MOC-04, MOC-06)
and write safety (MOC-03 overwrite policy) are not covered here — they require Obsidian
vault mocks and are validated via Phase 4 manual UAT (Plan 04-03 verification block).
</verification>
