---
phase: 01-plugin-scaffold-settings-file-safety
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/exclusions.ts
  - src/lib/delimiter.ts
  - src/lib/settings-parser.ts
autonomous: true
requirements:
  - FOUND-03
  - FOUND-04
  - FOUND-05
must_haves:
  truths:
    - "isExcluded('notes/templates/foo.md', ['templates']) returns true (per D-02: path segment match)"
    - "isExcluded('notes/foo.md', ['templates']) returns false"
    - "isWriteSafe(content, 'moc') returns false when start delimiter absent"
    - "isWriteSafe(content, 'moc') returns false when end delimiter absent"
    - "isWriteSafe(content, 'moc') returns false when end delimiter precedes start"
    - "replaceDelimitedSection returns original content unchanged when delimiters absent"
    - "replaceDelimitedSection replaces only the content between delimiters, not surrounding text"
    - "parseFolderRules ignores lines not matching 'path = dedicated|inline' pattern (per D-09)"
    - "parseFolderRules returns empty object for empty input"
    - "parseExclusionPatterns splits on newlines, trims, filters empty lines"
  artifacts:
    - path: "src/lib/exclusions.ts"
      provides: "isExcluded() path-segment matcher"
      exports: ["isExcluded"]
    - path: "src/lib/delimiter.ts"
      provides: "isWriteSafe() guard + replaceDelimitedSection() transform"
      exports: ["isWriteSafe", "replaceDelimitedSection", "buildDelimiter"]
    - path: "src/lib/settings-parser.ts"
      provides: "parseFolderRules() + parseExclusionPatterns() text parsers"
      exports: ["parseFolderRules", "parseExclusionPatterns"]
  key_links:
    - from: "src/settings.ts (Wave 2)"
      to: "src/lib/settings-parser.ts"
      via: "import parseFolderRules, parseExclusionPatterns"
      pattern: "from.*settings-parser"
    - from: "Phase 4 MOCGenerator"
      to: "src/lib/delimiter.ts"
      via: "import isWriteSafe, replaceDelimitedSection"
      pattern: "from.*delimiter"
    - from: "Phase 2+ VaultIndex"
      to: "src/lib/exclusions.ts"
      via: "import isExcluded"
      pattern: "from.*exclusions"
---

<objective>
Create three pure-logic TypeScript modules with zero Obsidian imports. These modules are the
write-safety and path-matching contracts that all downstream phases depend on. Being import-free,
they are fully testable via Vitest without any Obsidian API mocking.

Purpose: Establish the delimiter contract (D-13/D-14), exclusion matching (D-01/D-02/D-04),
and settings text parsing (D-08/D-09) before any file-writing feature exists.

Output: src/lib/exclusions.ts, src/lib/delimiter.ts, src/lib/settings-parser.ts
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/ROADMAP.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md

<interfaces>
<!-- These modules have NO imports. All signatures must be self-contained. -->
<!-- Wave 2 plans will import from these paths — establish exact export names. -->

// src/lib/exclusions.ts — to be created
export function isExcluded(filePath: string, patterns: string[]): boolean

// src/lib/delimiter.ts — to be created
// TYPE = 'moc' | 'toc' — expandable in future phases
export function buildDelimiter(type: string, position: 'start' | 'end'): string
// Returns: `<!-- kb-manager:moc:start -->` or `<!-- kb-manager:moc:end -->`
export function isWriteSafe(content: string, type: string): boolean
// Returns true ONLY when both start and end delimiters present AND start precedes end
export function replaceDelimitedSection(
  content: string,
  type: string,
  newSection: string
): string
// Returns original content unchanged if isWriteSafe() would return false

// src/lib/settings-parser.ts — to be created
export function parseFolderRules(text: string): Record<string, 'dedicated' | 'inline'>
// Input: multi-line textarea value; format per D-09: "folder/path = inline"
// Silently ignores lines that don't match pattern
export function parseExclusionPatterns(text: string): string[]
// Input: multi-line textarea value; splits on newlines, trims, filters empty
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create exclusions.ts — path segment matcher</name>
  <files>src/lib/exclusions.ts</files>
  <read_first>
    - .planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md (D-01, D-02, D-03, D-04)
  </read_first>
  <behavior>
    - isExcluded('templates/foo.md', ['templates']) → true (direct segment match)
    - isExcluded('notes/templates/foo.md', ['templates']) → true (inner segment match)
    - isExcluded('notes/foo.md', ['templates']) → false (no segment match)
    - isExcluded('archive-notes/foo.md', ['archive']) → false ('archive' is NOT a segment of 'archive-notes')
    - isExcluded('notes/foo.md', []) → false (empty patterns always returns false)
    - isExcluded('', ['templates']) → false (empty path)
    - isExcluded('templates', ['templates']) → true (exact match on single segment)
  </behavior>
  <action>
Create `src/lib/` directory and write `src/lib/exclusions.ts`.

The file must have NO imports (pure TypeScript, no Node builtins, no obsidian).

Implementation rules (all from D-01/D-02/D-04):
- Pattern matching is against individual path SEGMENTS only, not substrings
- A segment is produced by splitting the path on '/' and filtering empty strings
- A pattern matches if it equals ANY segment in the path exactly (case-sensitive)
- No wildcard syntax — exact string equality per segment
- Function < 30 lines; file < 300 lines; nesting max 3 levels

```typescript
// src/lib/exclusions.ts

/**
 * Returns true if filePath contains any pattern as an exact path segment.
 * D-01: simple name/prefix matching on path segments — no wildcards.
 * D-02: 'templates' matches 'notes/templates/foo.md' AND 'templates/bar.md'.
 * D-04: excluded = fully off-limits (caller's responsibility to skip on true).
 */
export function isExcluded(filePath: string, patterns: string[]): boolean {
  if (!filePath || patterns.length === 0) return false;
  const segments = filePath.split('/').filter(s => s.length > 0);
  return patterns.some(pattern => segments.includes(pattern));
}
```

No default export. Named export only. No console.log — this is a pure utility.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "export function isExcluded" src/lib/exclusions.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function isExcluded" src/lib/exclusions.ts` outputs `1`
    - `grep -c "import" src/lib/exclusions.ts` outputs `0` (zero imports — pure module)
    - `grep -c "console.log" src/lib/exclusions.ts` outputs `0`
    - File is under 30 lines
  </acceptance_criteria>
  <done>src/lib/exclusions.ts exists, exports isExcluded, has zero imports, zero console.log calls</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create delimiter.ts — write-safety contract</name>
  <files>src/lib/delimiter.ts</files>
  <read_first>
    - .planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md (D-13, D-14)
    - .planning/research/ARCHITECTURE.md (section "Marker-based Section Replace Pattern")
  </read_first>
  <behavior>
    - buildDelimiter('moc', 'start') → '<!-- kb-manager:moc:start -->'
    - buildDelimiter('toc', 'end') → '<!-- kb-manager:toc:end -->'
    - isWriteSafe(content, 'moc') → false when '<!-- kb-manager:moc:start -->' absent
    - isWriteSafe(content, 'moc') → false when '<!-- kb-manager:moc:end -->' absent
    - isWriteSafe(content, 'moc') → false when end index <= start index (out-of-order)
    - isWriteSafe('<!-- kb-manager:moc:start -->\ncontent\n<!-- kb-manager:moc:end -->', 'moc') → true
    - replaceDelimitedSection(content, 'moc', newSection) → original content when isWriteSafe returns false
    - replaceDelimitedSection(safeContent, 'moc', 'new body') → preserves text before start delimiter
    - replaceDelimitedSection(safeContent, 'moc', 'new body') → preserves text after end delimiter
    - replaceDelimitedSection(safeContent, 'moc', 'new body') → new body appears between delimiters
  </behavior>
  <action>
Write `src/lib/delimiter.ts`.

The file must have NO imports (pure TypeScript, no Node builtins, no obsidian).

Delimiter format (D-13): `<!-- kb-manager:TYPE:start -->` and `<!-- kb-manager:TYPE:end -->`
TYPE is the string argument (e.g., 'moc', 'toc').

Implementation rules:
- replaceDelimitedSection must call isWriteSafe first; return content unchanged if not safe
- The replacement must include the delimiter markers themselves in the output
- The fn param to vault.process() will be synchronous — replaceDelimitedSection must be pure sync
- No mutation of input strings
- Each function < 30 lines; file < 300 lines; nesting max 3 levels

```typescript
// src/lib/delimiter.ts

/**
 * Builds a delimiter comment for the given type and position.
 * Format: <!-- kb-manager:TYPE:start --> or <!-- kb-manager:TYPE:end -->
 * D-13: delimiter contract used by all file-writing phases.
 */
export function buildDelimiter(type: string, position: 'start' | 'end'): string {
  return `<!-- kb-manager:${type}:${position} -->`;
}

/**
 * Returns true only when both delimiters are present AND start precedes end.
 * D-14: must be called before any vault.process() write in Phase 4+.
 */
export function isWriteSafe(content: string, type: string): boolean {
  const start = buildDelimiter(type, 'start');
  const end = buildDelimiter(type, 'end');
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  return startIdx !== -1 && endIdx !== -1 && endIdx > startIdx;
}

/**
 * Replaces the content between delimiters with newSection.
 * Returns content UNCHANGED if isWriteSafe() returns false (D-13/D-14).
 * The delimiter markers are preserved in the output.
 */
export function replaceDelimitedSection(
  content: string,
  type: string,
  newSection: string
): string {
  if (!isWriteSafe(content, type)) return content;
  const start = buildDelimiter(type, 'start');
  const end = buildDelimiter(type, 'end');
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + end.length);
  return `${before}${start}\n${newSection}\n${end}${after}`;
}
```

No default export. Named exports only. No console.log.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "export function" src/lib/delimiter.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function" src/lib/delimiter.ts` outputs `3` (buildDelimiter, isWriteSafe, replaceDelimitedSection)
    - `grep -c "import" src/lib/delimiter.ts` outputs `0` (zero imports)
    - `grep -c "console.log" src/lib/delimiter.ts` outputs `0`
    - `grep "kb-manager:${" src/lib/delimiter.ts` matches a line (confirms delimiter format uses template literal with type variable)
    - File is under 50 lines
  </acceptance_criteria>
  <done>src/lib/delimiter.ts exists, exports buildDelimiter + isWriteSafe + replaceDelimitedSection, has zero imports, produces correct delimiter strings</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create settings-parser.ts — textarea value parsers</name>
  <files>src/lib/settings-parser.ts</files>
  <read_first>
    - .planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md (D-08, D-09)
    - .planning/phases/01-plugin-scaffold-settings-file-safety/01-UI-SPEC.md (Section 2 Exclusions, Section 3 MOC Format)
  </read_first>
  <behavior>
    - parseFolderRules('notes/projects = inline\ndailies = dedicated') → { 'notes/projects': 'inline', 'dailies': 'dedicated' }
    - parseFolderRules('notes/projects = inline\nBAD LINE\ndailies = dedicated') → { 'notes/projects': 'inline', 'dailies': 'dedicated' } (BAD LINE silently skipped)
    - parseFolderRules('') → {} (empty input → empty object)
    - parseFolderRules('folder = unknown') → {} (invalid value silently ignored)
    - parseFolderRules('  notes/projects = inline  ') → { 'notes/projects': 'inline' } (trims whitespace)
    - parseExclusionPatterns('templates\narchive\ndaily-notes') → ['templates', 'archive', 'daily-notes']
    - parseExclusionPatterns('templates\n\n  \narchive') → ['templates', 'archive'] (empty/whitespace-only lines filtered)
    - parseExclusionPatterns('') → []
    - parseExclusionPatterns('  templates  ') → ['templates'] (trims each line)
  </behavior>
  <action>
Write `src/lib/settings-parser.ts`.

The file must have NO imports (pure TypeScript).

Parsing rules from D-09:
- parseFolderRules: split on newlines; for each line: trim; skip empty; match pattern
  `^(.+?)\s*=\s*(dedicated|inline)$`; on match extract path (group 1 trimmed) and value
  (group 2); silently skip lines that don't match; silently skip lines where value is
  neither 'dedicated' nor 'inline'
- parseExclusionPatterns: split on newlines; trim each; filter empty; return string[]

```typescript
// src/lib/settings-parser.ts

/**
 * Parses per-folder MOC format rules from textarea text.
 * Format (D-09): one rule per line — `folder/path = dedicated` or `folder/path = inline`
 * Lines that don't match the pattern are silently ignored.
 */
export function parseFolderRules(
  text: string
): Record<string, 'dedicated' | 'inline'> {
  const result: Record<string, 'dedicated' | 'inline'> = {};
  if (!text.trim()) return result;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(.+?)\s*=\s*(dedicated|inline)$/);
    if (!match) continue;
    const path = match[1].trim();
    const value = match[2] as 'dedicated' | 'inline';
    if (path) result[path] = value;
  }
  return result;
}

/**
 * Parses exclusion patterns from textarea text.
 * Splits on newlines, trims each line, filters empty lines.
 * D-01: patterns are plain folder/file names — no wildcard syntax.
 */
export function parseExclusionPatterns(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}
```

No default export. Named exports only. No console.log.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "export function" src/lib/settings-parser.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function" src/lib/settings-parser.ts` outputs `2` (parseFolderRules, parseExclusionPatterns)
    - `grep -c "import" src/lib/settings-parser.ts` outputs `0` (zero imports)
    - `grep -c "console.log" src/lib/settings-parser.ts` outputs `0`
    - `grep "dedicated|inline" src/lib/settings-parser.ts` matches at least one line (confirms valid value guard)
    - File is under 50 lines
  </acceptance_criteria>
  <done>src/lib/settings-parser.ts exists, exports parseFolderRules + parseExclusionPatterns, has zero imports, silently ignores malformed lines</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User textarea → parseFolderRules/parseExclusionPatterns | User-supplied text enters parsing functions |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | parseFolderRules | accept | Input is user's own vault config; no external data; worst case is a misconfigured rule that is silently ignored |
| T-01-02 | Tampering | isExcluded | accept | Path segments are compared with exact equality; no regex injection possible; input comes from Obsidian's TFile.path (vault-internal) |
| T-01-03 | Denial of Service | replaceDelimitedSection | accept | All operations are O(n) string search on file content; no loops over unbounded collections; Obsidian already limits file size via vault.process() |
</threat_model>

<verification>
After all three tasks complete, verify no cross-contamination:

```bash
grep -r "import.*obsidian" /Users/schylerryan/Desktop/Github/kb-manager/src/lib/
```
Must return zero results. Any obsidian import in src/lib/ breaks Vitest testability.

```bash
grep -r "console\.log" /Users/schylerryan/Desktop/Github/kb-manager/src/lib/
```
Must return zero results.

```bash
ls /Users/schylerryan/Desktop/Github/kb-manager/src/lib/
```
Must list: exclusions.ts, delimiter.ts, settings-parser.ts (exactly three files, no test files — tests are Wave 3).
</verification>

<success_criteria>
- src/lib/exclusions.ts: exports isExcluded; zero imports; path segment matching (exact equality)
- src/lib/delimiter.ts: exports buildDelimiter, isWriteSafe, replaceDelimitedSection; zero imports; delimiter format is `<!-- kb-manager:TYPE:start -->`
- src/lib/settings-parser.ts: exports parseFolderRules, parseExclusionPatterns; zero imports; silently ignores malformed lines
- All three files have zero console.log calls
- All three files have zero Obsidian imports
</success_criteria>

<output>
After completion, create `.planning/phases/01-plugin-scaffold-settings-file-safety/01-01-SUMMARY.md`
using the summary template.
</output>
