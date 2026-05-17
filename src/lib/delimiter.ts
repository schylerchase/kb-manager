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
 *
 * Delimiters inside fenced code blocks are ignored so user documentation
 * about KB Manager (e.g. example MOC snippets in a code fence) is never
 * mistaken for a live managed section.
 */
export function isWriteSafe(content: string, type: DelimiterType): boolean {
  const start = buildDelimiter(type, 'start');
  const end = buildDelimiter(type, 'end');
  // Compute fence ranges once — the previous shape recomputed them inside
  // every indexOf hit, yielding O(N*M) work on big notes with many in-fence
  // delimiter occurrences (e.g. KB Manager docs).
  const ranges = computePairedFenceRanges(content);
  const startIdx = findFirstOutsideCodeFence(content, start, 0, ranges);
  if (startIdx === -1) return false;
  const endIdx = findFirstOutsideCodeFence(content, end, startIdx + start.length, ranges);
  if (endIdx === -1 || endIdx <= startIdx) return false;
  const hasSecondStart = findFirstOutsideCodeFence(content, start, startIdx + start.length, ranges) !== -1;
  const hasSecondEnd = findFirstOutsideCodeFence(content, end, endIdx + end.length, ranges) !== -1;
  return !hasSecondStart && !hasSecondEnd;
}

function findFirstOutsideCodeFence(
  content: string,
  needle: string,
  fromIndex: number,
  ranges: Array<[number, number]>,
): number {
  let searchFrom = fromIndex;
  while (true) {
    const found = content.indexOf(needle, searchFrom);
    if (found === -1) return -1;
    if (!isIndexInRanges(found, ranges)) return found;
    searchFrom = found + needle.length;
  }
}

function isIndexInRanges(index: number, ranges: Array<[number, number]>): boolean {
  for (const [start, end] of ranges) {
    if (index >= start && index <= end) return true;
  }
  return false;
}

/**
 * Returns [start, end] character ranges for every PAIRED fenced code block.
 * Markdown spec: opener is 3+ backticks or tildes at column 0 (or up to 3
 * leading spaces) and must close with the same marker character. Unclosed
 * fences are excluded so an in-progress edit can't permanently disable
 * delimiter writes.
 */
function computePairedFenceRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const lines = content.split('\n');
  let cursor = 0;
  let openChar: '`' | '~' | null = null;
  let openLen = 0;
  let openStart = 0;
  for (const line of lines) {
    const lineEnd = cursor + line.length;
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch && fenceMatch[1]) {
      const char = fenceMatch[1].charAt(0) === '`' ? '`' : '~';
      const len = fenceMatch[1].length;
      if (openChar === null) {
        openChar = char;
        openLen = len;
        openStart = cursor;
      } else if (openChar === char && len >= openLen) {
        // CommonMark: closer must be the same char AND at least as long as
        // the opener. A 3-backtick line inside a 4-backtick fence is
        // content, not a close — without this check we'd close early and
        // leave the rest of the wrapper unprotected.
        ranges.push([openStart, lineEnd]);
        openChar = null;
        openLen = 0;
      }
    }
    cursor = lineEnd + 1;
  }
  return ranges;
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
  // Must mirror isWriteSafe's fence-aware lookup. Using raw indexOf would
  // splice the new body between a user's fenced example pair when one
  // exists before the real managed pair, destroying their documentation.
  const ranges = computePairedFenceRanges(content);
  const startIdx = findFirstOutsideCodeFence(content, start, 0, ranges);
  const endIdx = findFirstOutsideCodeFence(content, end, startIdx + start.length, ranges);
  if (startIdx === -1 || endIdx === -1) return content;
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + end.length);
  return `${before}${start}\n${newSection}\n${end}${after}`;
}
