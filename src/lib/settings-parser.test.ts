import { describe, it, expect } from 'vitest';
import { parseFolderRules, parseExclusionPatterns } from './settings-parser';

describe('parseFolderRules', () => {
  it('returns empty object for empty input', () => {
    expect(parseFolderRules('')).toStrictEqual({});
  });

  it('parses a single inline rule', () => {
    expect(parseFolderRules('notes/projects = inline')).toStrictEqual({ 'notes/projects': 'inline' });
  });

  it('parses a single dedicated rule', () => {
    expect(parseFolderRules('dailies = dedicated')).toStrictEqual({ 'dailies': 'dedicated' });
  });

  it('parses multiple rules on separate lines', () => {
    expect(parseFolderRules('notes/projects = inline\ndailies = dedicated')).toStrictEqual({
      'notes/projects': 'inline',
      'dailies': 'dedicated',
    });
  });

  it('skips malformed lines silently and parses the valid ones', () => {
    expect(parseFolderRules('BADLINE\nnotes/projects = inline')).toStrictEqual({
      'notes/projects': 'inline',
    });
  });

  it('skips lines with an invalid value', () => {
    expect(parseFolderRules('folder = unknown')).toStrictEqual({});
  });

  it('trims whitespace from folder paths and values', () => {
    expect(parseFolderRules('  folder = inline  ')).toStrictEqual({ 'folder': 'inline' });
  });

  it('returns empty object for whitespace-only input', () => {
    expect(parseFolderRules('\n\n')).toStrictEqual({});
  });
});

describe('parseExclusionPatterns', () => {
  it('returns empty array for empty input', () => {
    expect(parseExclusionPatterns('')).toEqual([]);
  });

  it('returns single pattern from single line', () => {
    expect(parseExclusionPatterns('templates')).toEqual(['templates']);
  });

  it('returns multiple patterns from multiple lines', () => {
    expect(parseExclusionPatterns('templates\narchive')).toEqual(['templates', 'archive']);
  });

  it('filters out empty lines between patterns', () => {
    expect(parseExclusionPatterns('templates\n\narchive')).toEqual(['templates', 'archive']);
  });

  it('trims whitespace from each pattern', () => {
    expect(parseExclusionPatterns('  templates  ')).toEqual(['templates']);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseExclusionPatterns('\n\n  \n')).toEqual([]);
  });
});
