---
phase: 01-plugin-scaffold-settings-file-safety
plan: 04
type: tdd
wave: 3
depends_on:
  - 01-01-PLAN-pure-logic
  - 01-02-PLAN-scaffold-config
files_modified:
  - src/lib/exclusions.test.ts
  - src/lib/delimiter.test.ts
  - src/lib/settings-parser.test.ts
autonomous: true
requirements:
  - FOUND-03
  - FOUND-04
  - FOUND-05
must_haves:
  truths:
    - "npm test exits 0 with all tests passing"
    - "exclusions.test.ts covers path segment matching including false positives (archive-notes ≠ archive)"
    - "delimiter.test.ts covers absent delimiters, malformed order, and successful replacement"
    - "settings-parser.test.ts covers empty input, malformed lines, and valid parse for both parsers"
  artifacts:
    - path: "src/lib/exclusions.test.ts"
      provides: "Vitest unit tests for isExcluded"
      contains: "isExcluded"
    - path: "src/lib/delimiter.test.ts"
      provides: "Vitest unit tests for isWriteSafe, replaceDelimitedSection, buildDelimiter"
      contains: "isWriteSafe"
    - path: "src/lib/settings-parser.test.ts"
      provides: "Vitest unit tests for parseFolderRules, parseExclusionPatterns"
      contains: "parseFolderRules"
  key_links:
    - from: "src/lib/exclusions.test.ts"
      to: "src/lib/exclusions.ts"
      via: "import { isExcluded } from './exclusions'"
      pattern: "from.*exclusions"
    - from: "src/lib/delimiter.test.ts"
      to: "src/lib/delimiter.ts"
      via: "import { buildDelimiter, isWriteSafe, replaceDelimitedSection } from './delimiter'"
      pattern: "from.*delimiter"
    - from: "src/lib/settings-parser.test.ts"
      to: "src/lib/settings-parser.ts"
      via: "import { parseFolderRules, parseExclusionPatterns } from './settings-parser'"
      pattern: "from.*settings-parser"
---

<objective>
Create Vitest unit test suites for the three pure-logic modules from Wave 1. These tests
prove the write-safety and path-matching contracts are correct before any file-writing phase ships.

Purpose: Validate FOUND-03 (exclusion matching), FOUND-04 (no writes outside delimiters),
and FOUND-05 (absent/malformed delimiters = skip) via automated tests that run in CI.

Output: src/lib/exclusions.test.ts, src/lib/delimiter.test.ts, src/lib/settings-parser.test.ts
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/research/STACK.md

<interfaces>
<!-- Contracts from Wave 1 modules being tested -->

// src/lib/exclusions.ts
import { isExcluded } from './exclusions';
// isExcluded(filePath: string, patterns: string[]): boolean

// src/lib/delimiter.ts
import { buildDelimiter, isWriteSafe, replaceDelimitedSection } from './delimiter';
// buildDelimiter(type: string, position: 'start' | 'end'): string
// isWriteSafe(content: string, type: string): boolean
// replaceDelimitedSection(content: string, type: string, newSection: string): string

// src/lib/settings-parser.ts
import { parseFolderRules, parseExclusionPatterns } from './settings-parser';
// parseFolderRules(text: string): Record<string, 'dedicated' | 'inline'>
// parseExclusionPatterns(text: string): string[]
</interfaces>
</context>

<feature>
  <name>Pure-logic module test suite</name>
  <files>src/lib/exclusions.test.ts, src/lib/delimiter.test.ts, src/lib/settings-parser.test.ts</files>
  <behavior>
exclusions.ts — isExcluded:
- isExcluded('templates/foo.md', ['templates']) → true
- isExcluded('notes/templates/foo.md', ['templates']) → true (inner segment)
- isExcluded('notes/foo.md', ['templates']) → false
- isExcluded('archive-notes/foo.md', ['archive']) → false (substring != segment)
- isExcluded('notes/foo.md', []) → false (empty patterns)
- isExcluded('', ['templates']) → false (empty path)
- isExcluded('archive', ['archive']) → true (exact single segment)
- isExcluded('notes/archive/deep/foo.md', ['archive']) → true (segment at any depth)

delimiter.ts — buildDelimiter:
- buildDelimiter('moc', 'start') → '<!-- kb-manager:moc:start -->'
- buildDelimiter('toc', 'end') → '<!-- kb-manager:toc:end -->'

delimiter.ts — isWriteSafe:
- isWriteSafe('no delimiters here', 'moc') → false
- isWriteSafe('<!-- kb-manager:moc:start -->', 'moc') → false (end missing)
- isWriteSafe('<!-- kb-manager:moc:end -->', 'moc') → false (start missing)
- isWriteSafe('<!-- kb-manager:moc:end -->\n<!-- kb-manager:moc:start -->', 'moc') → false (end before start)
- isWriteSafe('<!-- kb-manager:moc:start -->\ncontent\n<!-- kb-manager:moc:end -->', 'moc') → true
- isWriteSafe(validContent, 'toc') → false (wrong type — moc delimiters don't satisfy toc check)

delimiter.ts — replaceDelimitedSection:
- replaceDelimitedSection('no delimiters', 'moc', 'new') → 'no delimiters' (unchanged)
- replaceDelimitedSection(validContent, 'moc', 'replacement') → contains '<!-- kb-manager:moc:start -->'
- replaceDelimitedSection(validContent, 'moc', 'replacement') → contains '<!-- kb-manager:moc:end -->'
- replaceDelimitedSection(validContent, 'moc', 'replacement') → contains 'replacement'
- replaceDelimitedSection('BEFORE\n<!-- kb-manager:moc:start -->\nOLD\n<!-- kb-manager:moc:end -->\nAFTER', 'moc', 'NEW') → result contains 'BEFORE' and 'AFTER'
- replaceDelimitedSection(validContent, 'moc', 'replacement') → does NOT contain 'OLD' (old section replaced)

settings-parser.ts — parseFolderRules:
- parseFolderRules('') → {}
- parseFolderRules('notes/projects = inline') → { 'notes/projects': 'inline' }
- parseFolderRules('dailies = dedicated') → { 'dailies': 'dedicated' }
- parseFolderRules('notes/projects = inline\ndailies = dedicated') → { 'notes/projects': 'inline', 'dailies': 'dedicated' }
- parseFolderRules('BADLINE\nnotes/projects = inline') → { 'notes/projects': 'inline' } (bad line skipped)
- parseFolderRules('folder = unknown') → {} (invalid value skipped)
- parseFolderRules('  folder = inline  ') → { 'folder': 'inline' } (whitespace trimmed)
- parseFolderRules('\n\n') → {} (whitespace-only input)

settings-parser.ts — parseExclusionPatterns:
- parseExclusionPatterns('') → []
- parseExclusionPatterns('templates') → ['templates']
- parseExclusionPatterns('templates\narchive') → ['templates', 'archive']
- parseExclusionPatterns('templates\n\narchive') → ['templates', 'archive'] (empty lines filtered)
- parseExclusionPatterns('  templates  ') → ['templates'] (trimmed)
- parseExclusionPatterns('\n\n  \n') → [] (all whitespace → empty array)
  </behavior>
  <implementation>
Write three test files using Vitest `describe`/`it`/`expect` syntax. No mocking required —
modules are pure functions.

Test file structure (same pattern for all three):
```typescript
import { describe, it, expect } from 'vitest';
import { functionUnderTest } from './module-name';

describe('functionUnderTest', () => {
  it('description of case', () => {
    expect(functionUnderTest(input)).toBe(expected);
  });
});
```

Rules:
- Use relative imports (`'./exclusions'`, not `'lib/exclusions'`) — test files live next to source
- No `console.log` in test files
- Each test file: one `describe` block per exported function
- Test names must be descriptive (not "test 1", "test 2")
- Use `toBe` for primitives, `toEqual` for objects/arrays, `toStrictEqual` for Records
- Every behavior listed above must have a corresponding `it()` test
  </implementation>
</feature>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test input → pure functions | All inputs are string literals controlled by the test author |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-09 | Repudiation | Test suite | accept | Tests are version-controlled; vitest output is deterministic; no external state |
</threat_model>

<verification>
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm test
```
Must exit 0 with output showing all test suites passing.

```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm test -- --reporter=verbose 2>&1 | grep -c "✓\|PASS\|passed"
```
Must show passing tests for exclusions, delimiter, and settings-parser.

```bash
grep -c "console\.log" /Users/schylerryan/Desktop/Github/kb-manager/src/lib/*.test.ts
```
Must output `0` for each file.
</verification>

<success_criteria>
- npm test exits 0
- src/lib/exclusions.test.ts: covers all isExcluded behaviors including false-positive guard (archive-notes != archive)
- src/lib/delimiter.test.ts: covers buildDelimiter format, isWriteSafe false cases, replaceDelimitedSection with BEFORE/AFTER preservation
- src/lib/settings-parser.test.ts: covers both parsers with empty, malformed, and valid inputs
- Zero console.log in test files
- All tests use relative imports (not tsconfig baseUrl paths)
</success_criteria>

<output>
After completion, create `.planning/phases/01-plugin-scaffold-settings-file-safety/01-04-SUMMARY.md`
using the summary template.
</output>
