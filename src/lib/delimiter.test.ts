import { describe, it, expect } from 'vitest';
import { buildDelimiter, isWriteSafe, replaceDelimitedSection } from './delimiter';

describe('buildDelimiter', () => {
  it('produces correct start delimiter format', () => {
    expect(buildDelimiter('moc', 'start')).toBe('<!-- kb-manager:moc:start -->');
  });

  it('produces correct end delimiter format', () => {
    expect(buildDelimiter('toc', 'end')).toBe('<!-- kb-manager:toc:end -->');
  });
});

describe('isWriteSafe', () => {
  it('returns false when no delimiters are present', () => {
    expect(isWriteSafe('no delimiters here', 'moc')).toBe(false);
  });

  it('returns false when only the start delimiter is present', () => {
    expect(isWriteSafe('<!-- kb-manager:moc:start -->', 'moc')).toBe(false);
  });

  it('returns false when only the end delimiter is present', () => {
    expect(isWriteSafe('<!-- kb-manager:moc:end -->', 'moc')).toBe(false);
  });

  it('returns false when end delimiter appears before start delimiter', () => {
    expect(isWriteSafe('<!-- kb-manager:moc:end -->\n<!-- kb-manager:moc:start -->', 'moc')).toBe(false);
  });

  it('returns true when both delimiters are present in correct order', () => {
    expect(isWriteSafe('<!-- kb-manager:moc:start -->\ncontent\n<!-- kb-manager:moc:end -->', 'moc')).toBe(true);
  });

  it('returns false when checking for a different type than what is present', () => {
    const mocContent = '<!-- kb-manager:moc:start -->\ncontent\n<!-- kb-manager:moc:end -->';
    expect(isWriteSafe(mocContent, 'toc')).toBe(false);
  });

  it('returns false when duplicate start delimiters are present', () => {
    const content =
      '<!-- kb-manager:moc:start -->\nA\n<!-- kb-manager:moc:end -->\n' +
      '<!-- kb-manager:moc:start -->\nB\n<!-- kb-manager:moc:end -->';
    expect(isWriteSafe(content, 'moc')).toBe(false);
  });
});

describe('replaceDelimitedSection', () => {
  const validContent = '<!-- kb-manager:moc:start -->\nOLD\n<!-- kb-manager:moc:end -->';

  it('returns content unchanged when no delimiters are present', () => {
    expect(replaceDelimitedSection('no delimiters', 'moc', 'new')).toBe('no delimiters');
  });

  it('preserves the start delimiter in the output', () => {
    const result = replaceDelimitedSection(validContent, 'moc', 'replacement');
    expect(result).toContain('<!-- kb-manager:moc:start -->');
  });

  it('preserves the end delimiter in the output', () => {
    const result = replaceDelimitedSection(validContent, 'moc', 'replacement');
    expect(result).toContain('<!-- kb-manager:moc:end -->');
  });

  it('inserts the new section content', () => {
    const result = replaceDelimitedSection(validContent, 'moc', 'replacement');
    expect(result).toContain('replacement');
  });

  it('preserves text before and after the delimited section', () => {
    const withSurroundings = 'BEFORE\n<!-- kb-manager:moc:start -->\nOLD\n<!-- kb-manager:moc:end -->\nAFTER';
    const result = replaceDelimitedSection(withSurroundings, 'moc', 'NEW');
    expect(result).toContain('BEFORE');
    expect(result).toContain('AFTER');
  });

  it('removes the old section content from the output', () => {
    const result = replaceDelimitedSection(validContent, 'moc', 'replacement');
    expect(result).not.toContain('OLD');
  });
});
