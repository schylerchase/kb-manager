---
phase: 01-plugin-scaffold-settings-file-safety
reviewed: 2026-04-28T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/lib/exclusions.ts
  - src/lib/delimiter.ts
  - src/lib/settings-parser.ts
  - src/main.ts
  - src/settings.ts
  - src/lib/exclusions.test.ts
  - src/lib/delimiter.test.ts
  - src/lib/settings-parser.test.ts
status: issues_found
critical_count: 1
high_count: 2
medium_count: 3
low_count: 3
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-28
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Eight files reviewed covering pure-logic library modules, the plugin entry point, the settings UI, and their tests. No violations of the six critical Obsidian plugin rules (vault.process(), onLayoutReady, window.setInterval, normalizePath(), console.log prohibition) were found. The scaffold is structurally sound. Three substantive defects were found: one correctness bug in delimiter handling that will corrupt files containing duplicate delimiter pairs, one unsafe type cast that bypasses runtime validation on a user-controlled dropdown value, and one unguarded async error path in settings callbacks that silently discards save failures. The test suite also has meaningful gaps in the delimiter contract coverage.

---

## Critical Issues

### CR-01: `replaceDelimitedSection` silently corrupts files with duplicate delimiter pairs

**File:** `src/lib/delimiter.ts:35-39`
**Severity:** CRITICAL

`isWriteSafe` passes for any document where the first `start` delimiter precedes the first `end` delimiter. `replaceDelimitedSection` then uses `indexOf` for both markers, which always returns the first occurrence. If a file contains two delimiter pairs of the same type — a malformed but not impossible state — `isWriteSafe` returns `true`, the function proceeds, and it splices together the content before the first start and the content after the first end, silently discarding the entire second block along with anything between the two pairs. The CLAUDE.md delimiter contract says "skip files with absent/malformed delimiters, never guess" — duplicate pairs are a malformed state and must be rejected, not silently half-processed.

**Fix:** Add a duplicate-delimiter check to `isWriteSafe` (and expose it via `replaceDelimitedSection`):

```typescript
export function isWriteSafe(content: string, type: string): boolean {
  const start = buildDelimiter(type, 'start');
  const end = buildDelimiter(type, 'end');
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return false;
  // Reject duplicate delimiters — malformed per delimiter contract
  const hasSecondStart = content.indexOf(start, startIdx + start.length) !== -1;
  const hasSecondEnd = content.indexOf(end, endIdx + end.length) !== -1;
  return !hasSecondStart && !hasSecondEnd;
}
```

---

## Warnings

### WR-01: Unsafe type cast on dropdown value in settings UI

**File:** `src/settings.ts:106`
**Severity:** HIGH

The dropdown `onChange` callback casts the raw string `v` directly to `'dedicated' | 'inline'` without any runtime check:

```typescript
this.plugin.settings.defaultMocFormat = v as 'dedicated' | 'inline';
```

The Obsidian API types `onChange` as `(value: string) => any`. If a future contributor adds an option to the dropdown with a mismatched key, or the dropdown is manipulated programmatically, an invalid string gets stored in settings and silently persists to disk. This violates the project's "validate all external input server-side" rule since settings are user-controlled.

**Fix:** Guard with an explicit check before assignment:

```typescript
.onChange(async v => {
  if (v !== 'dedicated' && v !== 'inline') return;
  this.plugin.settings.defaultMocFormat = v;
  await this.plugin.saveSettings();
})
```

### WR-02: Async errors in `onChange` callbacks are silently swallowed

**File:** `src/settings.ts:52-55, 66-69, 85-88, 105-108, 124-127`
**Severity:** HIGH

All five `onChange` callbacks are `async` and call `this.plugin.saveSettings()` which can throw (e.g., disk full, Obsidian internal error). Because Obsidian's `onChange` callback type is `void`-returning, these async functions are fire-and-forget — the returned Promise is never awaited or handled. A thrown error disappears silently and the user receives no feedback that their settings change was not persisted.

This violates the project rule: "Handle errors at boundaries with context — never swallow silently."

**Fix:** Wrap the save in a try/catch with a user-visible notice:

```typescript
.onChange(async v => {
  this.plugin.settings.autoInject = v;
  try {
    await this.plugin.saveSettings();
  } catch (err) {
    console.error('KB Manager: failed to save settings', err);
    // Optionally: new Notice('KB Manager: failed to save settings');
  }
})
```

---

## Info

### IN-01: `buildDelimiter` accepts arbitrary strings as `type` — no input validation

**File:** `src/lib/delimiter.ts:6-8`
**Severity:** LOW

`buildDelimiter(type, position)` accepts any `string` for `type` and interpolates it directly into an HTML comment. A caller passing a type containing `-->` would produce a broken/malformed delimiter (e.g., `<!-- kb-manager:foo-->bar:start -->`). While all current callers use controlled literals, future callers using runtime values (e.g., a type stored in settings) would have no protection.

**Fix:** Either restrict `type` to a string literal union (`'moc' | 'toc'`) or add a validation guard:

```typescript
const VALID_TYPES = ['moc', 'toc'] as const;
export type DelimiterType = typeof VALID_TYPES[number];

export function buildDelimiter(type: DelimiterType, position: 'start' | 'end'): string {
  return `<!-- kb-manager:${type}:${position} -->`;
}
```

### IN-02: Test suite missing coverage for duplicate delimiter case

**File:** `src/lib/delimiter.test.ts`
**Severity:** LOW

The delimiter contract (CLAUDE.md rule 2) requires skipping files with malformed delimiters. Duplicate delimiter pairs are a malformed state (two `start` or two `end` of the same type), but there is no test asserting that `isWriteSafe` returns `false` for them. Once CR-01 is fixed, this test must be added.

**Recommended test to add:**

```typescript
it('returns false when duplicate start delimiters are present', () => {
  const content =
    '<!-- kb-manager:moc:start -->\nA\n<!-- kb-manager:moc:end -->\n' +
    '<!-- kb-manager:moc:start -->\nB\n<!-- kb-manager:moc:end -->';
  expect(isWriteSafe(content, 'moc')).toBe(false);
});
```

### IN-03: `isExcluded` does not document or guard against non-normalized paths

**File:** `src/lib/exclusions.ts:9`
**Severity:** LOW

`filePath.split('/')` assumes forward-slash separators. Obsidian normalizes all vault paths to forward slashes via `normalizePath()`, but `isExcluded` does not enforce or document this precondition. A caller passing a raw filesystem path on Windows (with backslashes) would get incorrect results — the entire path would be treated as a single segment and no pattern would match.

**Fix:** Document the precondition in the JSDoc, or add a guard:

```typescript
/**
 * ...
 * @param filePath - Must be a vault-relative path normalized via normalizePath()
 *                   (forward-slash separators required).
 */
```

---

_Reviewed: 2026-04-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
