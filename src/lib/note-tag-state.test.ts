import { describe, expect, it } from 'vitest';
import { buildNoteTagState, locateTag, noteHasTag } from './note-tag-state';

describe('buildNoteTagState', () => {
  it('returns an empty state for an empty note', () => {
    const state = buildNoteTagState('a.md', '', undefined);
    expect(state.frontmatter).toEqual([]);
    expect(state.inline).toEqual([]);
    expect(state.combined.size).toBe(0);
  });

  it('collects frontmatter tags from an array', () => {
    const state = buildNoteTagState('a.md', 'body', ['foo', 'bar']);
    expect(state.frontmatter).toEqual(['foo', 'bar']);
    expect([...state.combined].sort()).toEqual(['bar', 'foo']);
  });

  it('coerces frontmatter tags from a string list', () => {
    const state = buildNoteTagState('a.md', 'body', '#foo, #bar');
    expect(state.frontmatter).toEqual(['foo', 'bar']);
  });

  it('collects inline tags from body and merges with frontmatter', () => {
    const md = ['---', 'tags:', '  - foo', '---', 'body #bar and #baz'].join('\n');
    const state = buildNoteTagState('a.md', md, ['foo']);
    expect(state.frontmatter).toEqual(['foo']);
    expect(state.inline.map((o) => o.tag)).toEqual(['bar', 'baz']);
    expect([...state.combined].sort()).toEqual(['bar', 'baz', 'foo']);
  });

  it('does not double-count a tag that appears in both frontmatter and inline', () => {
    const md = ['body has #foo inline'].join('\n');
    const state = buildNoteTagState('a.md', md, ['foo']);
    expect(state.frontmatter).toEqual(['foo']);
    expect(state.inline.map((o) => o.tag)).toEqual(['foo']);
    expect(state.combined.size).toBe(1);
  });

  it('ignores tags inside code fences when building inline list', () => {
    const md = ['#a', '```', '#b', '```'].join('\n');
    const state = buildNoteTagState('a.md', md, undefined);
    expect(state.inline.map((o) => o.tag)).toEqual(['a']);
  });

  it('records line and column for inline tags', () => {
    const state = buildNoteTagState('a.md', 'hello #world there', undefined);
    expect(state.inline).toEqual([{ tag: 'world', line: 0, col: 6 }]);
  });
});

describe('noteHasTag', () => {
  it('returns true for frontmatter tags', () => {
    const state = buildNoteTagState('a.md', '', ['foo']);
    expect(noteHasTag(state, 'foo')).toBe(true);
  });

  it('returns true for inline-only tags', () => {
    const state = buildNoteTagState('a.md', '#bar', undefined);
    expect(noteHasTag(state, 'bar')).toBe(true);
  });

  it('returns false for absent tags', () => {
    const state = buildNoteTagState('a.md', '#bar', ['foo']);
    expect(noteHasTag(state, 'baz')).toBe(false);
  });
});

describe('locateTag', () => {
  it('reports presence in frontmatter only', () => {
    const state = buildNoteTagState('a.md', 'body', ['foo']);
    expect(locateTag(state, 'foo')).toEqual({ inFrontmatter: true, inlineCount: 0 });
  });

  it('reports inline count when only inline', () => {
    const state = buildNoteTagState('a.md', '#foo and #foo again', undefined);
    expect(locateTag(state, 'foo')).toEqual({ inFrontmatter: false, inlineCount: 2 });
  });

  it('reports both locations when tag is in frontmatter and inline', () => {
    const state = buildNoteTagState('a.md', 'body #foo', ['foo']);
    expect(locateTag(state, 'foo')).toEqual({ inFrontmatter: true, inlineCount: 1 });
  });

  it('returns zero counts for absent tags', () => {
    const state = buildNoteTagState('a.md', '#bar', ['baz']);
    expect(locateTag(state, 'missing')).toEqual({ inFrontmatter: false, inlineCount: 0 });
  });
});
