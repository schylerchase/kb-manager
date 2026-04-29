---
phase: 05-toc-generator
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/toc-builder.ts
autonomous: true
requirements:
  - TOC-01
  - TOC-03
  - TOC-04
  - TOC-05
must_haves:
  truths:
    - "src/lib/toc-builder.ts exports buildPerNoteTocBody, buildIndexFile, INDEX_FRONTMATTER_KEYS, IndexBuildInput with no Obsidian imports"
    - "MAX_TOC_DEPTH = 3 constant exists in src/lib/toc-builder.ts"
    - "buildPerNoteTocBody with empty headings returns '<!-- no headings -->'"
    - "buildPerNoteTocBody filters out headings with level > 3"
    - "buildPerNoteTocBody with all-h4+ headings returns '<!-- no headings -->'"
    - "buildPerNoteTocBody indents h2 by 2 spaces and h3 by 4 spaces"
    - "buildPerNoteTocBody emits '- [[note-basename#heading-text]]' format"
    - "buildIndexFile produces frontmatter block then '# INDEX: <folder>' h1 then '## Notes' h2 then per-note '### basename' h3 sections"
    - "buildIndexFile uses '# INDEX: vault root' h1 when folder is empty string"
    - "buildIndexFile lists notes with h1 headings as bullet wikilinks; notes without h1 get '_(no h1 headings)_' placeholder"
    - "buildIndexFile sorts notes alphabetically by basename (case-insensitive)"
    - "INDEX_FRONTMATTER_KEYS deepEquals ['kb-managed', 'kb-type', 'kb-folder']"
  artifacts:
    - path: "src/lib/toc-builder.ts"
      provides: "Pure markdown generation: per-note TOC body and full INDEX.md content"
      exports: ["buildPerNoteTocBody", "buildIndexFile", "INDEX_FRONTMATTER_KEYS", "IndexBuildInput", "MAX_TOC_DEPTH"]
  key_links:
    - from: "src/TocGenerator.ts"
      to: "src/lib/toc-builder.ts"
      via: "import { buildPerNoteTocBody, buildIndexFile } from './lib/toc-builder'"
      pattern: "from.*toc-builder"
---

<objective>
Pure-logic markdown generation for TOC artifacts: the per-note TOC body (h1-h3 filtered,
indented) and the full INDEX.md file content (frontmatter + folder index of notes-with-h1).
Zero Obsidian imports — fully Vitest-testable. The Obsidian-coupled `TocGenerator` class
(Plan 05-02) imports and orchestrates these primitives.

Purpose: Same pattern as Phase 4 Plan 04-01 — separate markdown generation from vault I/O.
TOC-01 (per-note format), TOC-03 (heading anchor link format), TOC-04 (section index body),
TOC-05 (skip-empty-headings handling) are all expressible as pure functions over heading
data.

Output: src/lib/toc-builder.ts.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/04-moc-generator/04-01-PLAN-pure-logic-moc-builder.md

<interfaces>
// src/lib/toc-builder.ts — to be created (zero Obsidian imports)

import { HeadingRecord } from './vault-index-types';

export const MAX_TOC_DEPTH = 3;
export const INDEX_FRONTMATTER_KEYS: readonly ['kb-managed', 'kb-type', 'kb-folder'];

export interface IndexBuildInput {
  /** Folder path; '' for vault root. */
  folderPath: string;
  /** Notes in folder, with their full heading lists (h1+ included, filter happens here). */
  notes: Array<{ filePath: string; headings: HeadingRecord[] }>;
}

/** Per-note TOC body — D-01..D-06. */
export function buildPerNoteTocBody(filePath: string, headings: HeadingRecord[]): string;

/** Full INDEX.md content (frontmatter + h1 + body) — D-10..D-15. */
export function buildIndexFile(input: IndexBuildInput): string;
</interfaces>

<!-- Reuse pattern from src/lib/moc-builder.ts: same helper structure (basename, sorting),
     same const-block convention. Toc-builder is a sibling, not a successor. -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/lib/toc-builder.ts</name>
  <files>src/lib/toc-builder.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/moc-builder.ts (closest analog — same pure-logic shape)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts (HeadingRecord interface)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/05-toc-generator/05-CONTEXT.md (D-01..D-15 — exact format expectations)
  </read_first>
  <behavior>
    - buildPerNoteTocBody('foo.md', []) → '<!-- no headings -->'
    - buildPerNoteTocBody('foo.md', [{text: 'Top', level: 1}]) → '- [[foo#Top]]'
    - buildPerNoteTocBody('foo.md', [{text: 'Top', level: 1}, {text: 'Sub', level: 2}, {text: 'Detail', level: 3}]) → '- [[foo#Top]]\n  - [[foo#Sub]]\n    - [[foo#Detail]]'
    - buildPerNoteTocBody('foo.md', [{text: 'Skipped', level: 4}]) → '<!-- no headings -->' (filtered out)
    - buildPerNoteTocBody('foo.md', [{text: 'Top', level: 1}, {text: 'Skipped', level: 4}]) → '- [[foo#Top]]' (filter strips h4+)
    - buildPerNoteTocBody preserves heading text exactly (no escaping)
    - buildPerNoteTocBody emits 'note' (basename without .md) in wikilink, not full path
    - buildIndexFile with notes-having-h1 emits '### basename\n- [[basename#h1text]]' per note
    - buildIndexFile with notes-without-h1 emits '### basename\n_(no h1 headings)_' per note
    - buildIndexFile sorts notes alphabetically by basename (case-insensitive)
    - buildIndexFile with folderPath='' uses '# INDEX: vault root' h1 and 'kb-folder: \n' frontmatter line
    - buildIndexFile with folderPath='notes/projects' uses '# INDEX: notes/projects' h1 and 'kb-folder: notes/projects'
    - INDEX_FRONTMATTER_KEYS deepEquals ['kb-managed', 'kb-type', 'kb-folder']
  </behavior>
  <action>
Create `src/lib/toc-builder.ts`. Import only `HeadingRecord` from `'./vault-index-types'`.
No Obsidian imports.

```typescript
import { HeadingRecord } from './vault-index-types';

export const MAX_TOC_DEPTH = 3;
export const INDEX_FRONTMATTER_KEYS = ['kb-managed', 'kb-type', 'kb-folder'] as const;
const PLACEHOLDER_NO_HEADINGS = '<!-- no headings -->';
const PLACEHOLDER_NO_H1 = '_(no h1 headings)_';

export interface IndexBuildInput {
  folderPath: string;
  notes: Array<{ filePath: string; headings: HeadingRecord[] }>;
}

/** Extract basename without .md extension. 'notes/projects/foo.md' -> 'foo'. */
function basename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  const tail = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
  return tail.endsWith('.md') ? tail.slice(0, -3) : tail;
}

/** Sort by basename, case-insensitive. */
function sortByBasename<T extends { filePath: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    basename(a.filePath).toLowerCase().localeCompare(basename(b.filePath).toLowerCase())
  );
}

export function buildPerNoteTocBody(filePath: string, headings: HeadingRecord[]): string {
  const filtered = headings.filter(h => h.level <= MAX_TOC_DEPTH);
  if (filtered.length === 0) return PLACEHOLDER_NO_HEADINGS;
  const note = basename(filePath);
  const lines = filtered.map(h => {
    const indent = '  '.repeat(h.level - 1); // h1 = 0 spaces, h2 = 2, h3 = 4
    return `${indent}- [[${note}#${h.text}]]`;
  });
  return lines.join('\n');
}

export function buildIndexFile(input: IndexBuildInput): string {
  const folderLabel = input.folderPath === '' ? 'vault root' : input.folderPath;
  const frontmatter = [
    '---',
    'kb-managed: true',
    'kb-type: index',
    `kb-folder: ${input.folderPath}`,
    '---',
  ].join('\n');
  const sorted = sortByBasename(input.notes);
  const noteSections = sorted.map(({ filePath, headings }) => {
    const note = basename(filePath);
    const h1s = headings.filter(h => h.level === 1);
    const body = h1s.length === 0
      ? PLACEHOLDER_NO_H1
      : h1s.map(h => `- [[${note}#${h.text}]]`).join('\n');
    return `### ${note}\n${body}`;
  });
  const notesBlock = noteSections.length === 0 ? '' : `\n\n## Notes\n\n${noteSections.join('\n\n')}\n`;
  return `${frontmatter}\n\n# INDEX: ${folderLabel}${notesBlock}`;
}
```

Constraints:
- Zero Obsidian imports
- No console.log
- File ≤ 150 lines (target ~80)
- Functions ≤ 30 lines
- Named exports only
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "from 'obsidian'" src/lib/toc-builder.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "from 'obsidian'" src/lib/toc-builder.ts` outputs 0
    - `grep -c "^import" src/lib/toc-builder.ts` outputs 1
    - `grep "from './vault-index-types'" src/lib/toc-builder.ts | grep -c "HeadingRecord"` outputs 1
    - `grep -c "^export function" src/lib/toc-builder.ts` outputs 2 (buildPerNoteTocBody + buildIndexFile)
    - `grep "^export const MAX_TOC_DEPTH = 3" src/lib/toc-builder.ts` matches 1 line
    - `grep "INDEX_FRONTMATTER_KEYS" src/lib/toc-builder.ts | grep -c "kb-managed.*kb-type.*kb-folder"` outputs at least 1
    - `grep -c "<!-- no headings -->" src/lib/toc-builder.ts` outputs 1
    - `grep -c "_(no h1 headings)_" src/lib/toc-builder.ts` outputs 1
    - `grep -c "console.log" src/lib/toc-builder.ts` outputs 0
    - `wc -l src/lib/toc-builder.ts` outputs ≤ 150
    - `grep "vault root" src/lib/toc-builder.ts` matches 1 line
    - `grep "kb-type: index" src/lib/toc-builder.ts` matches 1 line
  </acceptance_criteria>
  <done>src/lib/toc-builder.ts exports buildPerNoteTocBody, buildIndexFile, MAX_TOC_DEPTH, INDEX_FRONTMATTER_KEYS, IndexBuildInput. Per-note body filters to h1-h3 with indentation. INDEX.md emits frontmatter + h1 + sorted note sections with placeholder for notes-without-h1.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build
```
Expected: exit 0. Vitest unit tests covering all D-01..D-06 + D-12..D-15 cases live in Plan 05-04.
</verification>
