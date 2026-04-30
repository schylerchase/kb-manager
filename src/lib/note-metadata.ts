const INVALID_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]+/g;

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

export function normalizeNoteTag(rawTag: string): string {
  return rawTag
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
    .toLowerCase();
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
  const folder = folderPath.trim().replace(/^\/+|\/+$/g, '');
  const baseName = sanitizeNoteTitle(title);
  let suffix = 1;
  let path = buildNotePath(folder, baseName);
  while (pathExists(path)) {
    suffix += 1;
    path = buildNotePath(folder, `${baseName} ${suffix}`);
  }
  return path;
}

export function buildNewNoteContent(title: string, tags: string[], date: Date): string {
  const normalizedTags = normalizeNoteTags(tags);
  const lines = ['---'];
  if (normalizedTags.length === 0) lines.push('tags: []');
  else lines.push('tags:', ...normalizedTags.map(tag => `  - ${tag}`));
  lines.push('status: inbox', `created: ${formatDate(date)}`, '---', '', `# ${sanitizeNoteTitle(title)}`, '');
  return lines.join('\n');
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
