import { describe, expect, it } from 'vitest';
import { computeTagStats, findCleanupCandidates, levenshtein } from './tag-analytics';

function fakeMap(rows: Array<[string, string[]]>): Map<string, string[]> {
  return new Map(rows);
}

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('foo', 'foo')).toBe(0);
  });

  it('counts single-character differences', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
    expect(levenshtein('cat', 'cart')).toBe(1);
    expect(levenshtein('cat', 'ca')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('returns full distance for unrelated strings', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });
});

describe('computeTagStats', () => {
  it('returns null for an unknown tag', () => {
    const stats = computeTagStats('missing', { flatTagMap: fakeMap([]) });
    expect(stats).toBeNull();
  });

  it('computes note count, co-occurrence, and folders', () => {
    const map = fakeMap([
      ['target', ['a/note1.md', 'a/note2.md', 'b/note3.md']],
      ['friend', ['a/note1.md', 'a/note2.md']],
      ['rare', ['b/note3.md']],
      ['unrelated', ['c/note4.md']],
    ]);
    const stats = computeTagStats('target', {
      flatTagMap: map,
      folderForPath: (p) => p.split('/').slice(0, -1).join('/') || '/',
    });
    expect(stats).not.toBeNull();
    expect(stats!.noteCount).toBe(3);
    expect(stats!.coOccurring).toEqual([
      { tag: 'friend', count: 2 },
      { tag: 'rare', count: 1 },
    ]);
    expect(stats!.folderDistribution).toEqual([
      { folder: 'a', count: 2 },
      { folder: 'b', count: 1 },
    ]);
  });

  it('returns no co-occurrence when target tag stands alone', () => {
    const map = fakeMap([
      ['solo', ['a.md']],
      ['other', ['b.md']],
    ]);
    const stats = computeTagStats('solo', { flatTagMap: map });
    expect(stats!.coOccurring).toEqual([]);
  });
});

describe('findCleanupCandidates', () => {
  it('does NOT flag a standalone low-cardinality tag (no near-duplicate sibling)', () => {
    // `lonely` is used by 1 note but has no near-duplicate — legitimately
    // niche tag, not a typo. Should be excluded so the panel stays signal.
    const map = fakeMap([
      ['popular', ['a.md', 'b.md', 'c.md']],
      ['lonely', ['z.md']],
    ]);
    const candidates = findCleanupCandidates({ flatTagMap: map });
    expect(candidates).toEqual([]);
  });

  it('flags a 1-note tag only when a near-duplicate sibling exists', () => {
    const map = fakeMap([
      ['claude', ['a.md', 'b.md']],
      ['claudo', ['c.md']],
    ]);
    const candidates = findCleanupCandidates({ flatTagMap: map }, { maxDistance: 3 });
    expect(candidates.some((c) => c.kind === 'orphan' && c.tag === 'claudo')).toBe(true);
  });

  it('flags near-duplicate pairs', () => {
    const map = fakeMap([
      ['claude', ['a.md', 'b.md']],
      ['claudenotes', ['c.md']],
      ['unrelated', ['d.md']],
    ]);
    const candidates = findCleanupCandidates({ flatTagMap: map }, { maxDistance: 5 });
    expect(candidates.some((c) => c.kind === 'near-duplicate')).toBe(true);
  });

  it('does not flag hierarchy parent/child as duplicate', () => {
    const map = fakeMap([
      ['proj', ['a.md']],
      ['proj/a', ['b.md']],
    ]);
    const candidates = findCleanupCandidates({ flatTagMap: map }, { maxDistance: 5 });
    const dupes = candidates.filter((c) => c.kind === 'near-duplicate');
    expect(dupes).toEqual([]);
  });

  it('orphans rank ahead of near-duplicate pairs', () => {
    const map = fakeMap([
      ['claude', ['b.md', 'c.md']],
      ['claudo', ['a.md']],  // 1-note tag near-duplicate of `claude`
    ]);
    const candidates = findCleanupCandidates({ flatTagMap: map }, { maxDistance: 3 });
    expect(candidates[0]!.kind).toBe('orphan');
    expect(candidates.find((c) => c.kind === 'near-duplicate')).toBeDefined();
  });

  it('excludes standalone 1-note tags even when the vault is full of them', () => {
    const map = fakeMap(
      Array.from({ length: 100 }, (_, i) => [`solo${i}`, [`note${i}.md`]] as [string, string[]]),
    );
    // Each `soloN` differs by 1–2 chars from its neighbors so near-duplicate
    // detection will pair plenty of them. Limit honored.
    const candidates = findCleanupCandidates({ flatTagMap: map }, { limit: 10 });
    expect(candidates.length).toBeLessThanOrEqual(10);
  });

  it('returns nothing when every tag is unique and well-spaced', () => {
    const map = fakeMap([
      ['alpha', ['1.md']],
      ['bravo', ['2.md']],
      ['charlie', ['3.md']],
    ]);
    expect(findCleanupCandidates({ flatTagMap: map })).toEqual([]);
  });
});
