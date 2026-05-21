import { describe, expect, it } from 'vitest';
import {
  buildNewNoteContent,
  coerceFrontmatterTags,
  getAvailableNotePath,
  initializeFrontmatter,
  mergeTags,
  normalizeNoteFolderPath,
  normalizeNoteTag,
  normalizeProjectTagInput,
  parseNoteTags,
  sanitizeNoteTitle,
} from './note-metadata';

describe('note metadata helpers', () => {
  it('sanitizes note titles for filenames and headings', () => {
    expect(sanitizeNoteTitle('  MCP/Goals?  ')).toBe('MCP-Goals-');
    expect(sanitizeNoteTitle('')).toBe('Untitled');
  });

  it('parses and normalizes tag input', () => {
    expect(parseNoteTags('#Internal Projects/HaloMCP, mcp, MCP')).toEqual([
      'internal-projects/halomcp',
      'mcp',
    ]);
    expect(parseNoteTags('mcp MCP')).toEqual(['mcp']);
  });

  it('normalizes project shorthand for note creation', () => {
    expect(normalizeProjectTagInput('Halo MCP')).toBe('project/halo-mcp');
    expect(normalizeProjectTagInput('#project/HaloMCP')).toBe('project/halomcp');
    expect(normalizeProjectTagInput('#project')).toBe('project');
    expect(normalizeProjectTagInput('')).toBe('');
  });

  it('coerces frontmatter tags from common YAML shapes', () => {
    expect(coerceFrontmatterTags(['#Foo', 'bar/baz'])).toEqual(['foo', 'bar/baz']);
    expect(coerceFrontmatterTags('foo, #bar')).toEqual(['foo', 'bar']);
    expect(coerceFrontmatterTags({ nope: true })).toEqual([]);
  });

  it('merges tags without duplicates', () => {
    expect(mergeTags(['foo'], ['#foo', 'bar'])).toEqual(['foo', 'bar']);
  });

  it('dedupes note paths inside the selected folder', () => {
    const existing = new Set(['Projects/MCP Goals.md', 'Projects/MCP Goals 2.md']);
    expect(getAvailableNotePath('Projects', 'MCP Goals', path => existing.has(path))).toBe(
      'Projects/MCP Goals 3.md'
    );
  });

  it('normalizes note folder paths for project-local wiki creation', () => {
    expect(normalizeNoteFolderPath(' /Projects//MCP\\Wiki/ ')).toBe('Projects/MCP/Wiki');
  });

  it('builds frontmatter for new notes', () => {
    expect(buildNewNoteContent('MCP Goals', ['mcp'], new Date(2026, 3, 30))).toContain(
      'tags:\n  - mcp\nstatus: inbox\ncreated: 2026-04-30\nkb-type: kb'
    );
  });

  it('instantiates MOC notes with editable managed section delimiters', () => {
    const content = buildNewNoteContent('Project Wiki', [], new Date(2026, 3, 30), 'moc');
    expect(content).toContain('kb-type: moc');
    expect(content).toContain('<!-- kb-manager:moc:start -->\n<!-- pending rebuild -->\n<!-- kb-manager:moc:end -->');
  });

  it('instantiates TOC notes with editable managed section delimiters', () => {
    const content = buildNewNoteContent('Project Index', [], new Date(2026, 3, 30), 'toc');
    expect(content).toContain('kb-type: toc');
    expect(content).toContain('<!-- kb-manager:toc:start -->');
    expect(content).toContain('<!-- kb-manager:toc:end -->');
  });

  it('initializes missing frontmatter without overwriting existing fields', () => {
    const frontmatter: Record<string, unknown> = { status: 'active', topic: 'mcp' };
    initializeFrontmatter(frontmatter, new Date(2026, 3, 30));
    expect(frontmatter).toEqual({
      tags: [],
      status: 'active',
      created: '2026-04-30',
      topic: 'mcp',
    });
  });
});

describe('normalizeNoteTag cleansing', () => {
  it('keeps already-valid tags unchanged', () => {
    expect(normalizeNoteTag('mcp')).toBe('mcp');
    expect(normalizeNoteTag('active-directory')).toBe('active-directory');
    expect(normalizeNoteTag('a/b/c')).toBe('a/b/c');
  });

  it('strips the leading hash and lowercases', () => {
    expect(normalizeNoteTag('#Foo')).toBe('foo');
    expect(normalizeNoteTag('  #MCP/Goals  ')).toBe('mcp/goals');
  });

  it('replaces invalid characters (period, dot, special) with dashes', () => {
    expect(normalizeNoteTag('802.1x')).toBe('802-1x');
    expect(normalizeNoteTag('hello.world')).toBe('hello-world');
    expect(normalizeNoteTag('a@b')).toBe('a-b');
  });

  it('collapses consecutive dashes and slashes', () => {
    expect(normalizeNoteTag('foo--bar')).toBe('foo-bar');
    expect(normalizeNoteTag('foo///bar')).toBe('foo/bar');
    expect(normalizeNoteTag('foo...bar')).toBe('foo-bar');
  });

  it('strips leading/trailing dashes per segment', () => {
    expect(normalizeNoteTag('-foo-')).toBe('foo');
    expect(normalizeNoteTag('a/-b-/c')).toBe('a/b/c');
  });

  it('strips leading/trailing slashes', () => {
    expect(normalizeNoteTag('/foo/')).toBe('foo');
  });

  it('rejects tags where any segment is purely numeric', () => {
    expect(normalizeNoteTag('123')).toBe('');
    expect(normalizeNoteTag('802')).toBe('');
    expect(normalizeNoteTag('mcp/2024')).toBe('');
  });

  it('keeps tags where every segment has at least one letter', () => {
    expect(normalizeNoteTag('mcp1')).toBe('mcp1');
    expect(normalizeNoteTag('2024-q1')).toBe('2024-q1');
  });

  it('returns empty for inputs that cleanse to empty', () => {
    expect(normalizeNoteTag('')).toBe('');
    expect(normalizeNoteTag('   ')).toBe('');
    expect(normalizeNoteTag('#')).toBe('');
    expect(normalizeNoteTag('...')).toBe('');
    expect(normalizeNoteTag('---')).toBe('');
  });

  it('mergeTags drops invalid tags so they never reach storage', () => {
    expect(mergeTags(['gzw', 'active-directory'], ['#802.1x'])).toEqual([
      'gzw',
      'active-directory',
      '802-1x',
    ]);
    expect(mergeTags([], ['#123', '#valid'])).toEqual(['valid']);
  });
});
