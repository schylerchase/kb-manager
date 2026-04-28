const VALID_TYPES = ['moc', 'toc'] as const;
export type DelimiterType = typeof VALID_TYPES[number];

/**
 * Builds a delimiter comment for the given type and position.
 * Format: <!-- kb-manager:TYPE:start --> or <!-- kb-manager:TYPE:end -->
 * D-13: delimiter contract used by all file-writing phases.
 */
export function buildDelimiter(type: DelimiterType, position: 'start' | 'end'): string {
  return `<!-- kb-manager:${type}:${position} -->`;
}

/**
 * Returns true only when both delimiters are present AND start precedes end.
 * D-14: must be called before any vault.process() write in Phase 4+.
 */
export function isWriteSafe(content: string, type: DelimiterType): boolean {
  const start = buildDelimiter(type, 'start');
  const end = buildDelimiter(type, 'end');
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return false;
  // Duplicate delimiters = malformed per delimiter contract — reject
  const hasSecondStart = content.indexOf(start, startIdx + start.length) !== -1;
  const hasSecondEnd = content.indexOf(end, endIdx + end.length) !== -1;
  return !hasSecondStart && !hasSecondEnd;
}

/**
 * Replaces the content between delimiters with newSection.
 * Returns content UNCHANGED if isWriteSafe() returns false (D-13/D-14).
 * The delimiter markers are preserved in the output.
 */
export function replaceDelimitedSection(
  content: string,
  type: DelimiterType,
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
