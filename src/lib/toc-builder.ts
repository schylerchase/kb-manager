import { HeadingRecord } from './vault-index-types';

export const MAX_TOC_DEPTH = 3;
export const INDEX_FRONTMATTER_KEYS = ['kb-managed', 'kb-type', 'kb-folder'] as const;

const PLACEHOLDER_NO_HEADINGS = '_No H1-H3 headings found in this note._';
const PLACEHOLDER_NO_H1 = '_(no h1 headings)_';
const PER_NOTE_TOC_INTRO = '_Links to headings in this note (H1-H3)._';
const INDEX_INTRO = '_Links to notes in this folder and their top-level headings._';

export interface IndexBuildInput {
  folderPath: string;
  notes: Array<{ filePath: string; headings: HeadingRecord[] }>;
}

function basename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  const tail = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
  return tail.endsWith('.md') ? tail.slice(0, -3) : tail;
}

/**
 * Strip characters that have special meaning inside `[[wikilinks]]` so the
 * emitted link parses as `[[Note#heading]]`, not as a broken link with a
 * stray alias or premature `]]` close.
 *  - `[` and `]` close the link early
 *  - `|` makes the rest an alias
 *  - `^` would point at a block-ref the heading isn't
 *  - `#` would chain another heading-ref
 */
function sanitizeLinkText(text: string): string {
  return text.replace(/[\[\]|^#]/g, '').trim();
}

function sortByBasename<T extends { filePath: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    basename(a.filePath).toLowerCase().localeCompare(basename(b.filePath).toLowerCase())
  );
}

export function buildPerNoteTocBody(filePath: string, headings: HeadingRecord[]): string {
  const filtered = headings.filter(h => h.level <= MAX_TOC_DEPTH);
  if (filtered.length === 0) return PLACEHOLDER_NO_HEADINGS;
  const note = basename(filePath);
  const links = filtered
    .map(h => `${'  '.repeat(h.level - 1)}- [[${note}#${sanitizeLinkText(h.text)}]]`)
    .join('\n');
  return `${PER_NOTE_TOC_INTRO}\n\n${links}`;
}

export function buildIndexFile(input: IndexBuildInput): string {
  const folderLabel = input.folderPath === '' ? 'vault root' : input.folderPath;
  const frontmatter = [
    '---',
    'kb-managed: true',
    'kb-type: index',
    `kb-folder: ${input.folderPath}`,
    '---',
  ].join('\n');
  const noteSections = sortByBasename(input.notes).map(note => buildNoteSection(note));
  const notesBlock = noteSections.length === 0
    ? ''
    : `\n\n## Notes\n\n${noteSections.join('\n\n')}\n`;
  return `${frontmatter}\n\n# Folder Index: ${folderLabel}\n\n${INDEX_INTRO}${notesBlock}`;
}

function buildNoteSection(note: { filePath: string; headings: HeadingRecord[] }): string {
  const noteName = basename(note.filePath);
  const h1s = note.headings.filter(h => h.level === 1);
  const body = h1s.length === 0
    ? PLACEHOLDER_NO_H1
    : h1s.map(h => `- [[${noteName}#${sanitizeLinkText(h.text)}]]`).join('\n');
  return `### ${noteName}\n${body}`;
}
