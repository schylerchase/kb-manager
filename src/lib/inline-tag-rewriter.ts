import { normalizeNoteTag } from './note-metadata';

// Tag chars per Obsidian: alphanumerics, underscore, dash, slash (for nesting).
// Must start with a non-digit so floats like `#3.14` and hex like `#fff` in CSS
// aren't matched. The leading boundary `(?<![\w/])` ensures we don't treat
// `email#tag` mid-word as a tag.
const TAG_RE = /(?<![\w/])#([A-Za-z_][\w-]*(?:\/[A-Za-z_][\w-]*)*)/g;
const FENCE_RE = /^\s*(?:```|~~~)/;

export type TagRewrite = {
  /** Normalized source tag — no leading '#'. */
  from: string;
  /** Normalized destination tag, or null to remove. */
  to: string | null;
};

export type RewriteResult = {
  changed: boolean;
  content: string;
  matches: number;
};

/**
 * Find inline `#tag` occurrences in a markdown body and apply rewrites,
 * skipping anything inside code fences, inline code spans, frontmatter,
 * markdown links / wikilinks, or URLs.
 *
 * Tags are matched case-insensitively after normalization (`#Foo` matches
 * a rewrite from `foo`). The output preserves the original markdown
 * surrounding whitespace and newlines.
 */
export function rewriteInlineTags(content: string, rewrites: ReadonlyArray<TagRewrite>): RewriteResult {
  if (rewrites.length === 0) return { changed: false, content, matches: 0 };

  const map = new Map<string, string | null>();
  for (const r of rewrites) {
    const from = normalizeNoteTag(r.from);
    if (from === '') continue;
    map.set(from, r.to === null ? null : normalizeNoteTag(r.to));
  }
  if (map.size === 0) return { changed: false, content, matches: 0 };

  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let inFrontmatter = false;
  let matches = 0;
  let changed = false;

  if (lines[0]?.trim() === '---' && hasClosingFrontmatterMarker(lines)) {
    inFrontmatter = true;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (inFrontmatter) {
      if (i > 0 && line.trim() === '---') inFrontmatter = false;
      continue;
    }

    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const rewritten = rewriteLine(line, map, (count) => {
      matches += count;
    });
    if (rewritten !== line) {
      lines[i] = rewritten;
      changed = true;
    }
  }

  return { changed, content: changed ? lines.join(newline) : content, matches };
}

function rewriteLine(line: string, map: Map<string, string | null>, addMatch: (n: number) => void): string {
  // Build skip ranges so we don't rewrite tags inside inline code spans,
  // wikilinks, markdown links, or URLs. Ranges are [start, end) half-open.
  const skip = collectSkipRanges(line);

  return line.replace(TAG_RE, (full, captured: string, offset: number) => {
    if (inRange(offset, skip)) return full;
    const normalized = normalizeNoteTag(captured);
    if (!map.has(normalized)) return full;
    const replacement = map.get(normalized) ?? null;
    addMatch(1);
    return replacement === null ? '' : `#${replacement}`;
  });
}

function collectSkipRanges(line: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  // Inline code spans: backtick-delimited.
  for (const m of line.matchAll(/`[^`\n]*`/g)) {
    if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
  }

  // Wikilinks: [[...]]
  for (const m of line.matchAll(/\[\[[^\]\n]*\]\]/g)) {
    if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
  }

  // Markdown links: [text](url). The URL often includes `#anchor`. The link
  // text could contain a tag, but rewriting it inside link syntax would be
  // surprising — skip the whole link.
  for (const m of line.matchAll(/\[[^\]\n]*\]\([^)\n]*\)/g)) {
    if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
  }

  // Bare URLs: http(s):// up to whitespace.
  for (const m of line.matchAll(/\bhttps?:\/\/\S+/g)) {
    if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
  }

  return ranges;
}

function inRange(offset: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  for (const [start, end] of ranges) {
    if (offset >= start && offset < end) return true;
  }
  return false;
}

function hasClosingFrontmatterMarker(lines: ReadonlyArray<string>): boolean {
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') return true;
  }
  return false;
}

/**
 * Find all inline tags in a markdown body. Used by tag-stats and
 * inline↔frontmatter converters that need to enumerate the tag positions.
 */
export function findInlineTags(content: string): Array<{ tag: string; line: number; col: number }> {
  const out: Array<{ tag: string; line: number; col: number }> = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let inFrontmatter = false;

  if (lines[0]?.trim() === '---' && hasClosingFrontmatterMarker(lines)) {
    inFrontmatter = true;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (inFrontmatter) {
      if (i > 0 && line.trim() === '---') inFrontmatter = false;
      continue;
    }
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const skip = collectSkipRanges(line);
    for (const match of line.matchAll(TAG_RE)) {
      if (match.index === undefined) continue;
      if (inRange(match.index, skip)) continue;
      out.push({ tag: normalizeNoteTag(match[1]!), line: i, col: match.index });
    }
  }
  return out;
}
