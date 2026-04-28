import { describe, it, expect } from 'vitest';
import { isExcluded } from './exclusions';

describe('isExcluded', () => {
  it('returns true when pattern matches the first path segment', () => {
    expect(isExcluded('templates/foo.md', ['templates'])).toBe(true);
  });

  it('returns true when pattern matches an inner path segment', () => {
    expect(isExcluded('notes/templates/foo.md', ['templates'])).toBe(true);
  });

  it('returns false when path has no matching segment', () => {
    expect(isExcluded('notes/foo.md', ['templates'])).toBe(false);
  });

  it('returns false when pattern is a substring but not an exact segment (archive-notes != archive)', () => {
    expect(isExcluded('archive-notes/foo.md', ['archive'])).toBe(false);
  });

  it('returns false when patterns array is empty', () => {
    expect(isExcluded('notes/foo.md', [])).toBe(false);
  });

  it('returns false when file path is empty', () => {
    expect(isExcluded('', ['templates'])).toBe(false);
  });

  it('returns true when path is a single segment that exactly matches the pattern', () => {
    expect(isExcluded('archive', ['archive'])).toBe(true);
  });

  it('returns true when pattern matches a segment at any depth', () => {
    expect(isExcluded('notes/archive/deep/foo.md', ['archive'])).toBe(true);
  });
});
