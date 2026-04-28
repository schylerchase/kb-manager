/**
 * Returns true if filePath contains any pattern as an exact path segment.
 * D-01: simple name/prefix matching on path segments — no wildcards.
 * D-02: 'templates' matches 'notes/templates/foo.md' AND 'templates/bar.md'.
 * D-04: excluded = fully off-limits (caller's responsibility to skip on true).
 * @param filePath - Must be a vault-relative path normalized via normalizePath()
 *                   (forward-slash separators required; backslashes will not match).
 */
export function isExcluded(filePath: string, patterns: string[]): boolean {
  if (!filePath || patterns.length === 0) return false;
  const segments = filePath.split('/').filter(s => s.length > 0);
  return patterns.some(pattern => segments.includes(pattern));
}
