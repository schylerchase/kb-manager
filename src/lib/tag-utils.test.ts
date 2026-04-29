import { describe, it, expect } from 'vitest';
import { normalizeTag, normalizeTags, buildTagTree, buildFlatTagMap, indexFolders } from './tag-utils';

describe('normalizeTag', () => {
  it('strips leading # and lowercases', () => {
    expect(normalizeTag('#Parent/Child')).toBe('parent/child');
  });

  it('handles tags without # prefix', () => {
    expect(normalizeTag('already')).toBe('already');
  });

  it('lowercases without # prefix', () => {
    expect(normalizeTag('#UPPER')).toBe('upper');
  });
});

describe('normalizeTags', () => {
  it('normalizes and deduplicates', () => {
    expect(normalizeTags(['#A', '#a', '#b'])).toEqual(['a', 'b']);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeTags([])).toEqual([]);
  });

  it('preserves first-occurrence order after dedup', () => {
    expect(normalizeTags(['#B', '#A', '#b'])).toEqual(['b', 'a']);
  });
});

describe('buildTagTree', () => {
  it('builds nested tree for parent/child tag', () => {
    const tree = buildTagTree([{ filePath: 'a.md', tags: ['parent/child'] }]);
    expect(tree.has('parent')).toBe(true);
    const parentNode = tree.get('parent')!;
    expect(parentNode.children.has('child')).toBe(true);
    const childNode = parentNode.children.get('child')!;
    expect(childNode.files).toContain('a.md');
  });

  it('accumulates files for same flat tag from multiple files', () => {
    const tree = buildTagTree([
      { filePath: 'a.md', tags: ['api'] },
      { filePath: 'b.md', tags: ['api'] },
    ]);
    expect(tree.get('api')!.files).toEqual(['a.md', 'b.md']);
  });

  it('does not add filePath to intermediate ancestor nodes', () => {
    const tree = buildTagTree([{ filePath: 'a.md', tags: ['parent/child'] }]);
    const parentNode = tree.get('parent')!;
    expect(parentNode.files).toHaveLength(0);
  });

  it('returns empty Map for empty input', () => {
    expect(buildTagTree([])).toEqual(new Map());
  });
});

describe('buildFlatTagMap', () => {
  it('maps tag to files from multiple files', () => {
    const map = buildFlatTagMap([
      { filePath: 'a.md', tags: ['api'] },
      { filePath: 'b.md', tags: ['api'] },
    ]);
    expect(map.get('api')).toEqual(['a.md', 'b.md']);
  });

  it('returns empty Map for empty input', () => {
    expect(buildFlatTagMap([])).toEqual(new Map());
  });

  it('handles multiple distinct tags', () => {
    const map = buildFlatTagMap([
      { filePath: 'a.md', tags: ['api', 'docs'] },
    ]);
    expect(map.get('api')).toEqual(['a.md']);
    expect(map.get('docs')).toEqual(['a.md']);
  });
});

describe('indexFolders', () => {
  it('indexes multiple files in the same folder', () => {
    const map = indexFolders(['notes/foo.md', 'notes/bar.md']);
    const record = map.get('notes')!;
    expect(record.path).toBe('notes');
    expect(record.name).toBe('notes');
    expect(record.files).toContain('notes/foo.md');
    expect(record.files).toContain('notes/bar.md');
  });

  it('indexes root-level files under empty key', () => {
    const map = indexFolders(['foo.md']);
    const record = map.get('')!;
    expect(record.path).toBe('');
    expect(record.name).toBe('');
    expect(record.files).toContain('foo.md');
  });

  it('returns empty Map for empty input', () => {
    expect(indexFolders([])).toEqual(new Map());
  });
});
