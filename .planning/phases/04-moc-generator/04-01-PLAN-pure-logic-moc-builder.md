---
phase: 04-moc-generator
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/moc-builder.ts
autonomous: true
requirements:
  - MOC-01
  - MOC-02
  - MOC-08
must_haves:
  truths:
    - "src/lib/moc-builder.ts exports buildMocBody, buildDedicatedMocFile, and DEDICATED_FRONTMATTER_KEYS with no Obsidian imports"
    - "buildMocBody({ tagTree: empty Map, untaggedFiles: [] }) returns empty string"
    - "buildMocBody with single tag 'api' and one file produces '## api\\n- [[note]]'"
    - "buildMocBody with nested tag 'project/alpha' produces '## project\\n### alpha\\n- [[note]]'"
    - "buildMocBody with file having tags ['a', 'b'] produces the file under both '## a' and '## b' sections"
    - "buildMocBody clamps tag depth at h6 — a tag 'a/b/c/d/e/f/g' produces '## a' through '###### f' with f-and-deeper flattened"
    - "buildMocBody with untagged files emits a final '## Untagged' section listing them"
    - "buildMocBody sorts files within each section alphabetically by basename, case-insensitive"
    - "buildDedicatedMocFile('notes/projects', body) returns a string with frontmatter block then '# MOC: notes/projects' h1 then body"
    - "buildDedicatedMocFile('', body) uses '# MOC: vault root' as the h1"
    - "buildDedicatedMocFile frontmatter contains exactly 'kb-managed: true', 'kb-type: moc', 'kb-folder: <folder>' lines"
    - "Wikilinks in any output use basename only — no path, no alias (matches MOC-08)"
  artifacts:
    - path: "src/lib/moc-builder.ts"
      provides: "Pure markdown generation: tag-tree body and full dedicated MOC.md content"
      exports: ["buildMocBody", "buildDedicatedMocFile", "DEDICATED_FRONTMATTER_KEYS", "MocBuildInput"]
  key_links:
    - from: "src/MocGenerator.ts"
      to: "src/lib/moc-builder.ts"
      via: "import { buildMocBody, buildDedicatedMocFile } from './lib/moc-builder'"
      pattern: "from.*moc-builder"
---

<objective>
Pure-logic markdown generation for MOC files: the tag-tree-hierarchy body (D-01..D-05) and
the full dedicated MOC.md content with frontmatter (D-08, D-09). Zero Obsidian imports —
fully Vitest-testable. The Obsidian-coupled `MocGenerator` class (Plan 04-02) imports and
orchestrates these primitives.

Purpose: Separating markdown generation from vault I/O keeps the body-format decisions
(D-01..D-09) testable in isolation. Same pattern as Phase 1 (`delimiter.ts`,
`exclusions.ts`) and Phase 2 (`tag-utils.ts`).

Output: src/lib/moc-builder.ts.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/ROADMAP.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-CONTEXT.md

<interfaces>
// src/lib/moc-builder.ts — to be created (zero Obsidian imports)

export interface MocBuildInput {
  /** TagNode tree from VaultIndex.getTagTree() — top-level tag segments → nested children */
  tagTree: Map<string, TagNode>;
  /** Files with zero tags, listed under '## Untagged' section */
  untaggedFiles: string[];
}

/**
 * Generate the tag-tree-hierarchy body markdown.
 * D-01..D-05 + D-22 (file paths in TagNode are vault-relative; basename extracted for display).
 * Returns empty string when tagTree is empty AND untaggedFiles is empty.
 */
export function buildMocBody(input: MocBuildInput): string;

/**
 * Generate the full dedicated MOC.md file content (frontmatter + h1 + body).
 * D-07..D-10. Body comes from buildMocBody internally.
 */
export function buildDedicatedMocFile(folderPath: string, body: string): string;

/**
 * Frontmatter keys checked by MocGenerator's overwrite-safety guard (D-10).
 */
export const DEDICATED_FRONTMATTER_KEYS: readonly ['kb-managed', 'kb-type', 'kb-folder'];
</interfaces>

<!-- TagNode is imported from existing './vault-index-types' -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/lib/moc-builder.ts with buildMocBody, buildDedicatedMocFile, frontmatter constants</name>
  <files>src/lib/moc-builder.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts (TagNode shape)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/tag-utils.ts (zero-import pattern reference)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-CONTEXT.md (D-01..D-09 body and file format specifics)
  </read_first>
  <behavior>
    - buildMocBody({ tagTree: new Map(), untaggedFiles: [] }) → ''
    - buildMocBody with one tag 'api' and one file 'note.md' → '## api\n- [[note]]\n'
    - buildMocBody with nested tag 'project/alpha' and file 'spec.md' → '## project\n### alpha\n- [[spec]]\n'
    - buildMocBody with file 'a.md' tagged ['x', 'y'] (built into tagTree) → file appears under both '## x' and '## y'
    - buildMocBody with depth-7 tag 'a/b/c/d/e/f/g' clamps at h6 — '## a\n### b\n#### c\n##### d\n###### e\n###### f\n###### g\n- [[file]]'  (segments e+ all use h6)
    - buildMocBody untagged files appear under '## Untagged\n- [[file1]]\n- [[file2]]\n' as a trailing section
    - buildMocBody when untagged is empty AND tagTree is non-empty → no '## Untagged' section emitted
    - buildMocBody sorts within each section alphabetically by basename (case-insensitive: 'Banana' before 'cherry')
    - buildDedicatedMocFile('notes/projects', '## api\n- [[a]]\n') → frontmatter block + blank line + '# MOC: notes/projects\n\n## api\n- [[a]]\n'
    - buildDedicatedMocFile('', '## api\n- [[a]]\n') uses '# MOC: vault root'
    - DEDICATED_FRONTMATTER_KEYS deepEquals ['kb-managed', 'kb-type', 'kb-folder']
  </behavior>
  <action>
Create `src/lib/moc-builder.ts`. Import `TagNode` from `'./vault-index-types'` only.
No Obsidian imports.

Required exports and behavior:

```typescript
import { TagNode } from './vault-index-types';

export const DEDICATED_FRONTMATTER_KEYS = ['kb-managed', 'kb-type', 'kb-folder'] as const;

const MAX_HEADING_LEVEL = 6;
const UNTAGGED_HEADING = '## Untagged';

export interface MocBuildInput {
  tagTree: Map<string, TagNode>;
  untaggedFiles: string[];
}

/** Extract basename without .md extension. 'notes/projects/foo.md' -> 'foo'. */
function basename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  const tail = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
  return tail.endsWith('.md') ? tail.slice(0, -3) : tail;
}

/** Sort by basename, case-insensitive. */
function sortByBasename(paths: string[]): string[] {
  return [...paths].sort((a, b) =>
    basename(a).toLowerCase().localeCompare(basename(b).toLowerCase())
  );
}

/** Render a single tag node and its children at the given heading depth. */
function renderTagNode(name: string, node: TagNode, depth: number, lines: string[]): void {
  const level = Math.min(depth, MAX_HEADING_LEVEL);
  lines.push(`${'#'.repeat(level)} ${name}`);
  for (const filePath of sortByBasename(node.files)) {
    lines.push(`- [[${basename(filePath)}]]`);
  }
  // Children always emit at depth+1, but renderTagNode clamps to MAX.
  const childNames = [...node.children.keys()].sort();
  for (const childName of childNames) {
    renderTagNode(childName, node.children.get(childName)!, depth + 1, lines);
  }
}

export function buildMocBody(input: MocBuildInput): string {
  const lines: string[] = [];
  const topLevelNames = [...input.tagTree.keys()].sort();
  for (const name of topLevelNames) {
    renderTagNode(name, input.tagTree.get(name)!, 2, lines);
  }
  if (input.untaggedFiles.length > 0) {
    lines.push(UNTAGGED_HEADING);
    for (const filePath of sortByBasename(input.untaggedFiles)) {
      lines.push(`- [[${basename(filePath)}]]`);
    }
  }
  return lines.length === 0 ? '' : lines.join('\n') + '\n';
}

export function buildDedicatedMocFile(folderPath: string, body: string): string {
  const folderLabel = folderPath === '' ? 'vault root' : folderPath;
  const frontmatter = [
    '---',
    'kb-managed: true',
    'kb-type: moc',
    `kb-folder: ${folderPath}`,
    '---',
  ].join('\n');
  return `${frontmatter}\n\n# MOC: ${folderLabel}\n\n${body}`;
}
```

Constraints:
- Zero Obsidian imports
- No console.log
- Functions <= 30 lines each (renderTagNode is recursive — kept short)
- File <= 150 lines target
- Named exports only — no default export
- Strict equality, no any-typing

After writing, type-check:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3
```
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "^export" src/lib/moc-builder.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "from 'obsidian'" src/lib/moc-builder.ts` outputs 0
    - `grep -c "^import" src/lib/moc-builder.ts` outputs exactly 1 (just the TagNode import)
    - `grep "from './vault-index-types'" src/lib/moc-builder.ts | grep -c "TagNode"` outputs 1
    - `grep -c "^export function" src/lib/moc-builder.ts` outputs at least 2 (buildMocBody, buildDedicatedMocFile)
    - `grep "^export interface MocBuildInput" src/lib/moc-builder.ts` matches exactly 1 line
    - `grep "DEDICATED_FRONTMATTER_KEYS" src/lib/moc-builder.ts | grep -c "kb-managed.*kb-type.*kb-folder"` outputs at least 1
    - `grep -c "console.log" src/lib/moc-builder.ts` outputs 0
    - `wc -l src/lib/moc-builder.ts` outputs ≤ 150
    - `grep "MAX_HEADING_LEVEL = 6" src/lib/moc-builder.ts` matches 1 line
    - `grep "kb-managed: true" src/lib/moc-builder.ts` matches 1 line
    - `grep "kb-type: moc" src/lib/moc-builder.ts` matches 1 line
    - `grep "vault root" src/lib/moc-builder.ts` matches 1 line
  </acceptance_criteria>
  <done>src/lib/moc-builder.ts exports buildMocBody, buildDedicatedMocFile, MocBuildInput, DEDICATED_FRONTMATTER_KEYS. Zero Obsidian imports. Tag tree renders as nested headings clamped at h6. Untagged section emitted only when present. Frontmatter has exactly the three keys.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build
```
Expected: exit 0. Vitest unit tests covering all D-01..D-09 cases live in Plan 04-04.
</verification>
