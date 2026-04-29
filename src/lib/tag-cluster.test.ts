import { describe, it, expect } from 'vitest';
import { findClusterMatchedFiles } from './tag-cluster';

function buildMap(entries: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(entries));
}

describe('findClusterMatchedFiles', () => {
  it('returns empty array for empty input', () => {
    expect(findClusterMatchedFiles(new Map(), [], 2)).toEqual([]);
  });

  it('returns empty array for empty query', () => {
    expect(findClusterMatchedFiles(buildMap({ api: ['a.md'] }), [], 2)).toEqual([]);
  });

  it('single-tag query with minMatches 2 returns nothing', () => {
    expect(findClusterMatchedFiles(buildMap({ api: ['a.md'] }), ['api'], 2)).toEqual([]);
  });

  it('single-tag query with minMatches 1 returns files for that tag', () => {
    expect(findClusterMatchedFiles(buildMap({ api: ['b.md', 'a.md'] }), ['api'], 1)).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('two-tag query returns files in both lists', () => {
    const map = buildMap({ api: ['a.md', 'b.md'], backend: ['b.md', 'c.md'] });
    expect(findClusterMatchedFiles(map, ['api', 'backend'], 2)).toEqual(['b.md']);
  });

  it('three-tag query with minMatches 2 includes partial cluster matches', () => {
    const map = buildMap({
      api: ['a.md', 'b.md'],
      backend: ['a.md', 'c.md'],
      frontend: ['b.md', 'c.md'],
    });
    expect(findClusterMatchedFiles(map, ['api', 'backend', 'frontend'], 2)).toEqual([
      'a.md',
      'b.md',
      'c.md',
    ]);
  });

  it('deduplicates query tags', () => {
    const map = buildMap({ api: ['a.md'] });
    expect(findClusterMatchedFiles(map, ['api', 'api'], 2)).toEqual([]);
  });

  it('coerces minMatches below 1 to 1', () => {
    const map = buildMap({ api: ['a.md'] });
    expect(findClusterMatchedFiles(map, ['api'], 0)).toEqual(['a.md']);
    expect(findClusterMatchedFiles(map, ['api'], -5)).toEqual(['a.md']);
  });

  it('ignores missing query tags', () => {
    const map = buildMap({ api: ['a.md'] });
    expect(findClusterMatchedFiles(map, ['api', 'missing'], 1)).toEqual(['a.md']);
  });
});
