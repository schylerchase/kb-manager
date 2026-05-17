import { describe, it, expect } from 'vitest';
import {
  INDEX_FRONTMATTER_KEYS,
  MAX_TOC_DEPTH,
  buildIndexFile,
  buildPerNoteTocBody,
} from './toc-builder';
import { HeadingRecord } from './vault-index-types';

const h = (text: string, level: number): HeadingRecord => ({ text, level });

describe('buildPerNoteTocBody', () => {
  it('returns placeholder for empty headings', () => {
    expect(buildPerNoteTocBody('foo.md', [])).toBe('_No H1-H3 headings found in this note._');
  });

  it('emits h1 with no indent', () => {
    expect(buildPerNoteTocBody('foo.md', [h('Top', 1)])).toBe(
      '_Links to headings in this note (H1-H3)._\n\n- [[foo#Top]]'
    );
  });

  it('indents h2 and h3', () => {
    const result = buildPerNoteTocBody('foo.md', [h('Top', 1), h('Sub', 2), h('Detail', 3)]);
    expect(result).toBe(
      '_Links to headings in this note (H1-H3)._\n\n- [[foo#Top]]\n  - [[foo#Sub]]\n    - [[foo#Detail]]'
    );
  });

  it('filters h4 and deeper headings', () => {
    const result = buildPerNoteTocBody('foo.md', [h('Keep', 1), h('Skip', 4)]);
    expect(result).toBe('_Links to headings in this note (H1-H3)._\n\n- [[foo#Keep]]');
  });

  it('returns placeholder when all headings are h4 or deeper', () => {
    expect(buildPerNoteTocBody('foo.md', [h('A', 4), h('B', 5)])).toBe(
      '_No H1-H3 headings found in this note._'
    );
  });

  it('extracts basename and preserves heading text', () => {
    const result = buildPerNoteTocBody('notes/projects/foo.md', [h('A/B: Test', 1)]);
    expect(result).toBe('_Links to headings in this note (H1-H3)._\n\n- [[foo#A/B: Test]]');
  });

  it('exports max toc depth', () => {
    expect(MAX_TOC_DEPTH).toBe(3);
  });

  it('sanitizes wikilink-breaking characters in heading text', () => {
    // Headings containing [, ], |, ^, # would break wiki-link parsing:
    // - `]` closes the link early
    // - `|` makes the rest an alias
    // - `^` would point at a block-ref
    // - `#` would chain another heading-ref
    const result = buildPerNoteTocBody('foo.md', [
      h('Foo ]] Bar', 1),
      h('Foo | Bar', 2),
      h('Foo #ref', 3),
    ]);
    expect(result).toContain('[[foo#Foo  Bar]]');
    expect(result).toContain('[[foo#Foo  Bar]]');
    expect(result).toContain('[[foo#Foo ref]]');
    expect(result).not.toContain('[[foo#Foo ]] Bar]]');
    expect(result).not.toContain('[[foo#Foo | Bar]]');
  });
});

describe('buildIndexFile', () => {
  it('exports expected frontmatter keys', () => {
    expect(INDEX_FRONTMATTER_KEYS).toEqual(['kb-managed', 'kb-type', 'kb-folder']);
  });

  it('emits frontmatter and non-root title', () => {
    const result = buildIndexFile({ folderPath: 'notes', notes: [] });
    expect(result).toContain('kb-managed: true\nkb-type: index\nkb-folder: notes');
    expect(result).toContain('# Folder Index: notes');
    expect(result).toContain('_Links to notes in this folder and their top-level headings._');
  });

  it('uses vault root label for root folder', () => {
    const result = buildIndexFile({ folderPath: '', notes: [] });
    expect(result).toContain('kb-folder: \n---');
    expect(result).toContain('# Folder Index: vault root');
  });

  it('omits notes section when notes array is empty', () => {
    expect(buildIndexFile({ folderPath: 'notes', notes: [] })).not.toContain('## Notes');
  });

  it('lists notes with h1 headings', () => {
    const result = buildIndexFile({
      folderPath: 'notes',
      notes: [{ filePath: 'notes/spec.md', headings: [h('Plan', 1)] }],
    });
    expect(result).toContain('### spec\n- [[spec#Plan]]');
  });

  it('emits placeholder for notes without h1 headings', () => {
    const result = buildIndexFile({
      folderPath: 'notes',
      notes: [{ filePath: 'notes/foo.md', headings: [h('Sub', 2)] }],
    });
    expect(result).toContain('### foo\n_(no h1 headings)_');
  });

  it('sorts notes by basename case-insensitively', () => {
    const result = buildIndexFile({
      folderPath: 'notes',
      notes: [
        { filePath: 'notes/cherry.md', headings: [h('C', 1)] },
        { filePath: 'notes/Banana.md', headings: [h('B', 1)] },
        { filePath: 'notes/apple.md', headings: [h('A', 1)] },
      ],
    });
    expect(result.indexOf('### apple')).toBeLessThan(result.indexOf('### Banana'));
    expect(result.indexOf('### Banana')).toBeLessThan(result.indexOf('### cherry'));
  });
});
