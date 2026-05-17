/**
 * Parses per-folder MOC format rules from textarea text.
 * Format (D-09): one rule per line — `folder/path = dedicated` or `folder/path = inline`
 * Lines that don't match the pattern are silently ignored.
 */
export function parseFolderRules(
  text: string
): Record<string, 'dedicated' | 'inline'> {
  return parseFolderRulesWithDiagnostics(text).rules;
}

export interface FolderRuleParseResult {
  rules: Record<string, 'dedicated' | 'inline'>;
  /** Paths that appeared more than once with conflicting values; last wins. */
  collisions: string[];
}

/**
 * Diagnostic variant returning both the parsed rules and any duplicate-key
 * collisions so callers (e.g. settings UI) can surface them to the user
 * instead of silently dropping rules.
 */
export function parseFolderRulesWithDiagnostics(text: string): FolderRuleParseResult {
  const result: Record<string, 'dedicated' | 'inline'> = {};
  const collisions = new Set<string>();
  if (!text.trim()) return { rules: result, collisions: [] };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(.+?)\s*=\s*(dedicated|inline)$/);
    if (!match) continue;
    const rawPath = match[1];
    const rawValue = match[2];
    if (!rawPath || !rawValue) continue;
    const path = rawPath.trim();
    const value = rawValue as 'dedicated' | 'inline';
    if (!path) continue;
    if (path in result && result[path] !== value) {
      collisions.add(path);
    }
    result[path] = value;
  }
  return { rules: result, collisions: [...collisions] };
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
