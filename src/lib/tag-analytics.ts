/**
 * Pure analytics over the vault's tag/file index. Used by the orphan-tag
 * cleanup view (Unit 7) and the per-tag stats panel (Unit 8). No Obsidian
 * runtime imports — easy to unit test.
 */

export type TagStats = {
  tag: string;
  noteCount: number;
  /** Other tags that appear on the same notes, ranked by co-occurrence count. */
  coOccurring: Array<{ tag: string; count: number }>;
  /** Folder paths that hold notes with this tag, ranked by count. */
  folderDistribution: Array<{ folder: string; count: number }>;
};

export type CleanupCandidate =
  | { kind: 'orphan'; tag: string; noteCount: number }
  | { kind: 'near-duplicate'; tags: string[]; noteCounts: number[]; distance: number };

export type AnalyticsInput = {
  /** Map of normalized tag → list of file paths that contain that tag. */
  flatTagMap: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Optional folder lookup for stats. Path → folder portion (e.g. "kb/foo/note.md" → "kb/foo"). */
  folderForPath?: (path: string) => string;
};

/**
 * Compute stats for one tag. Returns null when the tag has no entries in
 * the index — caller should treat as "tag does not exist".
 */
export function computeTagStats(tag: string, input: AnalyticsInput): TagStats | null {
  const paths = input.flatTagMap.get(tag);
  if (!paths || paths.length === 0) return null;

  const pathSet = new Set(paths);
  const coCounts = new Map<string, number>();
  for (const [otherTag, otherPaths] of input.flatTagMap) {
    if (otherTag === tag) continue;
    let shared = 0;
    for (const p of otherPaths) if (pathSet.has(p)) shared += 1;
    if (shared > 0) coCounts.set(otherTag, shared);
  }

  const folderCounts = new Map<string, number>();
  if (input.folderForPath) {
    for (const p of paths) {
      const folder = input.folderForPath(p) || '/';
      folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
    }
  }

  return {
    tag,
    noteCount: paths.length,
    coOccurring: [...coCounts.entries()]
      .map(([t, count]) => ({ tag: t, count }))
      .sort((a, b) => b.count - a.count),
    folderDistribution: [...folderCounts.entries()]
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Surface low-cardinality tags (1 note) and near-duplicate name pairs.
 * Returns at most {@link options.limit} candidates ordered by signal
 * strength (orphans first, then near-duplicates ordered by edit distance).
 */
export function findCleanupCandidates(
  input: AnalyticsInput,
  options: { maxDistance?: number; limit?: number } = {},
): CleanupCandidate[] {
  const maxDistance = options.maxDistance ?? 2;
  const limit = options.limit ?? 50;

  const tagsWithCounts = [...input.flatTagMap.entries()].map(([tag, paths]) => ({ tag, count: paths.length }));

  // Near-duplicate pairs first. We compare every pair once; for vaults with
  // thousands of tags this is O(n^2) — acceptable for kb-manager's scale
  // (typical vaults < 200 tags). Skip pairs whose lengths differ by more
  // than maxDistance as a quick prune.
  const duplicates: CleanupCandidate[] = [];
  const seen = new Set<string>();
  const involvedInDuplicate = new Set<string>();
  for (let i = 0; i < tagsWithCounts.length; i++) {
    for (let j = i + 1; j < tagsWithCounts.length; j++) {
      const a = tagsWithCounts[i]!;
      const b = tagsWithCounts[j]!;
      if (Math.abs(a.tag.length - b.tag.length) > maxDistance) continue;
      // Skip when one is a strict prefix-with-slash of the other (hierarchy).
      if (a.tag.startsWith(`${b.tag}/`) || b.tag.startsWith(`${a.tag}/`)) continue;
      const distance = levenshtein(a.tag, b.tag);
      if (distance === 0 || distance > maxDistance) continue;
      const key = [a.tag, b.tag].sort().join('::');
      if (seen.has(key)) continue;
      seen.add(key);
      duplicates.push({
        kind: 'near-duplicate',
        tags: [a.tag, b.tag],
        noteCounts: [a.count, b.count],
        distance,
      });
      involvedInDuplicate.add(a.tag);
      involvedInDuplicate.add(b.tag);
    }
  }

  // Low-cardinality (1 note) tags are only flagged if they ALSO have a
  // near-duplicate sibling. Standalone single-use tags like `#sow` are
  // almost always legitimate (new or specialized) and produce noise; tags
  // that are 1-note AND look like a typo of another tag are the high-
  // signal cleanup targets.
  const orphans: CleanupCandidate[] = [];
  for (const { tag, count } of tagsWithCounts) {
    if (count !== 1) continue;
    if (!involvedInDuplicate.has(tag)) continue;
    orphans.push({ kind: 'orphan', tag, noteCount: 1 });
  }

  // Orphans first (per-tag actions are quick wins), then merge-able pairs.
  const candidates = [...orphans, ...duplicates];
  return candidates.slice(0, limit);
}

function candidateRank(c: CleanupCandidate): number {
  if (c.kind === 'orphan') return 0;
  return c.distance;
}

/**
 * Iterative Levenshtein distance with O(min(a,b)) space. Used by the
 * near-duplicate detector — fast enough for hundreds-of-tags scale.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
