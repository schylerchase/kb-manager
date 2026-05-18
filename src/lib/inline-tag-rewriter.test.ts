import { describe, expect, it } from 'vitest';
import { findInlineTags, rewriteInlineTags } from './inline-tag-rewriter';

describe('rewriteInlineTags', () => {
  it('returns unchanged content when no rewrites apply', () => {
    const result = rewriteInlineTags('hello world', [{ from: 'foo', to: 'bar' }]);
    expect(result.changed).toBe(false);
    expect(result.content).toBe('hello world');
    expect(result.matches).toBe(0);
  });

  it('rewrites a simple inline tag', () => {
    const result = rewriteInlineTags('alpha #foo beta', [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toBe('alpha #bar beta');
    expect(result.matches).toBe(1);
    expect(result.changed).toBe(true);
  });

  it('rewrites multiple occurrences of the same tag', () => {
    const result = rewriteInlineTags('#foo and #foo and not #other', [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toBe('#bar and #bar and not #other');
    expect(result.matches).toBe(2);
  });

  it('removes a tag when to is null', () => {
    const result = rewriteInlineTags('keep #drop me', [{ from: 'drop', to: null }]);
    expect(result.content).toBe('keep  me');
    expect(result.matches).toBe(1);
  });

  it('matches tags case-insensitively after normalization', () => {
    const result = rewriteInlineTags('hello #Foo there', [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toBe('hello #bar there');
    expect(result.matches).toBe(1);
  });

  it('rewrites hierarchical tags by exact match only', () => {
    const result = rewriteInlineTags('#a/b and #a', [{ from: 'a/b', to: 'x/y' }]);
    expect(result.content).toBe('#x/y and #a');
    expect(result.matches).toBe(1);
  });

  it('does not rewrite a parent when only a child is targeted', () => {
    const result = rewriteInlineTags('#a/b mention', [{ from: 'a', to: 'z' }]);
    expect(result.content).toBe('#a/b mention');
    expect(result.matches).toBe(0);
  });

  it('skips tags inside fenced code blocks', () => {
    const md = ['regular #foo here', '```', 'code #foo not rewritten', '```', 'after #foo again'].join('\n');
    const result = rewriteInlineTags(md, [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toContain('regular #bar here');
    expect(result.content).toContain('code #foo not rewritten');
    expect(result.content).toContain('after #bar again');
    expect(result.matches).toBe(2);
  });

  it('skips tags inside tilde fences', () => {
    const md = ['~~~', '#foo skip', '~~~', '#foo hit'].join('\n');
    const result = rewriteInlineTags(md, [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toContain('#foo skip');
    expect(result.content).toContain('#bar hit');
    expect(result.matches).toBe(1);
  });

  it('skips frontmatter block', () => {
    const md = ['---', 'tags:', '  - #foo', '---', 'body #foo'].join('\n');
    const result = rewriteInlineTags(md, [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toContain('  - #foo');
    expect(result.content).toContain('body #bar');
    expect(result.matches).toBe(1);
  });

  it('treats a lone --- without a closing partner as a horizontal rule', () => {
    const md = ['---', 'body #foo here'].join('\n');
    const result = rewriteInlineTags(md, [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toBe(['---', 'body #bar here'].join('\n'));
    expect(result.matches).toBe(1);
  });

  it('skips tags inside inline code spans', () => {
    const result = rewriteInlineTags('outer #foo `inline #foo` outer #foo', [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toBe('outer #bar `inline #foo` outer #bar');
    expect(result.matches).toBe(2);
  });

  it('skips tags inside wikilinks', () => {
    const result = rewriteInlineTags('use [[#foo]] and bare #foo', [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toBe('use [[#foo]] and bare #bar');
    expect(result.matches).toBe(1);
  });

  it('skips tags inside markdown link text and URL', () => {
    const result = rewriteInlineTags('see [#foo](https://example.com/#foo) and #foo', [
      { from: 'foo', to: 'bar' },
    ]);
    expect(result.content).toBe('see [#foo](https://example.com/#foo) and #bar');
    expect(result.matches).toBe(1);
  });

  it('skips tags inside bare URLs', () => {
    const result = rewriteInlineTags('check https://example.com/path#foo for info, also #foo', [
      { from: 'foo', to: 'bar' },
    ]);
    expect(result.content).toBe('check https://example.com/path#foo for info, also #bar');
    expect(result.matches).toBe(1);
  });

  it('does not match tags that start with a digit', () => {
    const result = rewriteInlineTags('color #123abc and #foo', [
      { from: '123abc', to: 'x' },
      { from: 'foo', to: 'bar' },
    ]);
    expect(result.content).toBe('color #123abc and #bar');
    expect(result.matches).toBe(1);
  });

  it('does not match tags embedded mid-word', () => {
    const result = rewriteInlineTags('email#foo not a tag, but #foo is', [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toBe('email#foo not a tag, but #bar is');
    expect(result.matches).toBe(1);
  });

  it('preserves CRLF line endings when the source uses them', () => {
    const md = 'line1 #foo\r\nline2 #foo\r\nline3';
    const result = rewriteInlineTags(md, [{ from: 'foo', to: 'bar' }]);
    expect(result.content).toBe('line1 #bar\r\nline2 #bar\r\nline3');
  });

  it('returns unchanged content when no occurrences exist', () => {
    const result = rewriteInlineTags('no tags here', [{ from: 'foo', to: 'bar' }]);
    expect(result.changed).toBe(false);
    expect(result.content).toBe('no tags here');
  });

  it('applies multiple distinct rewrites in one pass', () => {
    const result = rewriteInlineTags('#a #b #c #d', [
      { from: 'a', to: 'x' },
      { from: 'c', to: null },
    ]);
    expect(result.content).toBe('#x #b  #d');
    expect(result.matches).toBe(2);
  });
});

describe('findInlineTags', () => {
  it('returns an empty list when there are no tags', () => {
    expect(findInlineTags('plain text')).toEqual([]);
  });

  it('returns each inline tag with line and column', () => {
    const md = ['first #alpha here', '#beta on its own'].join('\n');
    expect(findInlineTags(md)).toEqual([
      { tag: 'alpha', line: 0, col: 6 },
      { tag: 'beta', line: 1, col: 0 },
    ]);
  });

  it('skips tags inside code fences', () => {
    const md = ['#a', '```', '#b', '```', '#c'].join('\n');
    expect(findInlineTags(md).map((t) => t.tag)).toEqual(['a', 'c']);
  });

  it('skips tags in frontmatter', () => {
    const md = ['---', 'tags: [foo]', '---', '#real'].join('\n');
    expect(findInlineTags(md).map((t) => t.tag)).toEqual(['real']);
  });

  it('skips tags inside inline code', () => {
    expect(findInlineTags('`#fake` #real').map((t) => t.tag)).toEqual(['real']);
  });
});
