import { buildDelimiter } from './delimiter';

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]+/g;

export type NewNoteKind = 'kb' | 'moc' | 'toc';

export function sanitizeNoteTitle(input: string): string {
  const collapsed = input.trim().replace(/\s+/g, ' ');
  const title = collapsed === '' ? 'Untitled' : collapsed;
  return title.replace(INVALID_FILENAME_CHARS, '-').replace(/\s+/g, ' ').trim();
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = twoDigit(date.getMonth() + 1);
  const day = twoDigit(date.getDate());
  return `${year}-${month}-${day}`;
}

/**
 * Normalize and cleanse a tag for storage. Returns '' for tags that cannot
 * be made valid — callers already treat empty as "skip this tag".
 *
 * Cleansing rules:
 * - Strip leading `#`, trim, lowercase.
 * - Replace whitespace with `-`.
 * - Replace any other invalid character with `-` (Obsidian only accepts
 *   letters, digits, `_`, `-`, and `/` for nesting — a period like
 *   `#802.1x` is otherwise rendered as invalid in the properties pane).
 * - Collapse consecutive `-` and `/`.
 * - Strip leading/trailing `-` per hierarchy segment and leading/trailing `/`.
 *
 * Validation:
 * - Every hierarchy segment must contain at least one non-digit character
 *   (Obsidian rule: tags must have at least one alphabetical character).
 *   Pure-numeric segments like `#123` or `#proj/2024` would silently render
 *   as broken pills; we reject the whole tag so the caller can prompt.
 */
export function normalizeNoteTag(rawTag: string): string {
  const cleansed = rawTag
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    // Anything outside the allowed alphabet becomes a dash, then dashes get
    // collapsed below. This keeps the cleansed tag visually close to the
    // original (e.g. `802.1x` → `802-1x`) instead of mangling it.
    .replace(/[^a-z0-9_/-]/g, '-')
    .replace(/\/+/g, '/')
    .replace(/-+/g, '-')
    .replace(/^\/|\/$/g, '')
    .split('/')
    .map((seg) => seg.replace(/^-+|-+$/g, ''))
    .join('/');

  if (cleansed === '') return '';

  for (const segment of cleansed.split('/')) {
    if (segment === '') return '';
    if (!/[a-z_]/.test(segment)) return '';
  }

  return cleansed;
}

export function normalizeNoteTags(rawTags: string[]): string[] {
  const tags: string[] = [];
  for (const rawTag of rawTags) {
    const tag = normalizeNoteTag(rawTag);
    if (tag !== '' && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function parseNoteTags(input: string): string[] {
  const separator = input.includes(',') ? /,+/ : /\s+/;
  return normalizeNoteTags(input.split(separator));
}

export function coerceFrontmatterTags(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeNoteTags(value.filter(isString));
  if (typeof value === 'string') return parseNoteTags(value);
  return [];
}

export function mergeTags(existing: unknown, additions: string[]): string[] {
  return normalizeNoteTags([...coerceFrontmatterTags(existing), ...additions]);
}

export function initializeFrontmatter(frontmatter: Record<string, unknown>, date: Date): void {
  if (frontmatter.tags === undefined) frontmatter.tags = [];
  if (frontmatter.status === undefined) frontmatter.status = 'inbox';
  if (frontmatter.created === undefined) frontmatter.created = formatDate(date);
}

export function getAvailableNotePath(
  folderPath: string,
  title: string,
  pathExists: (path: string) => boolean
): string {
  const folder = normalizeNoteFolderPath(folderPath);
  const baseName = sanitizeNoteTitle(title);
  let suffix = 1;
  let path = buildNotePath(folder, baseName);
  while (pathExists(path)) {
    suffix += 1;
    path = buildNotePath(folder, `${baseName} ${suffix}`);
  }
  return path;
}

export function normalizeNoteFolderPath(folderPath: string): string {
  return folderPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export function buildNewNoteContent(title: string, tags: string[], date: Date, kind: NewNoteKind = 'kb'): string {
  const normalizedTags = normalizeNoteTags(tags);
  const lines = ['---'];
  if (normalizedTags.length === 0) lines.push('tags: []');
  else lines.push('tags:', ...normalizedTags.map(tag => `  - ${tag}`));
  lines.push('status: inbox', `created: ${formatDate(date)}`, `kb-type: ${kind}`, '---', '', `# ${sanitizeNoteTitle(title)}`, '');
  lines.push(...buildInitialSection(kind));
  return lines.join('\n');
}

function buildInitialSection(kind: NewNoteKind): string[] {
  if (kind === 'moc') {
    return [
      buildDelimiter('moc', 'start'),
      '<!-- pending rebuild -->',
      buildDelimiter('moc', 'end'),
      '',
    ];
  }
  if (kind === 'toc') {
    return [
      buildDelimiter('toc', 'start'),
      '_KB Manager will replace this with links to headings in this note after rebuild._',
      buildDelimiter('toc', 'end'),
      '',
    ];
  }
  return [''];
}

function buildNotePath(folderPath: string, baseName: string): string {
  return folderPath === '' ? `${baseName}.md` : `${folderPath}/${baseName}.md`;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function twoDigit(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
