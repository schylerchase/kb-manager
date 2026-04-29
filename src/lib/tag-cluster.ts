/**
 * Find file paths that apply at least minMatches of queryTags.
 *
 * Callers must pass normalized tags: lowercase with no leading '#'.
 * Matching is exact; hierarchy expansion is intentionally not applied.
 */
export function findClusterMatchedFiles(
  flatTagMap: Map<string, string[]>,
  queryTags: string[],
  minMatches: number
): string[] {
  const dedupedQuery = [...new Set(queryTags)];
  const minRequired = Math.max(1, minMatches);
  const fileCounts = new Map<string, number>();
  for (const tag of dedupedQuery) {
    const files = flatTagMap.get(tag);
    if (!files) continue;
    for (const filePath of files) {
      fileCounts.set(filePath, (fileCounts.get(filePath) ?? 0) + 1);
    }
  }
  const matches: string[] = [];
  for (const [filePath, count] of fileCounts) {
    if (count >= minRequired) matches.push(filePath);
  }
  return matches.sort();
}
