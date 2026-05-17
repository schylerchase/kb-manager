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

  it('ignores delimiters inside a fenced code block (user documentation)', () => {
    const content =
      'See docs:\n```\n<!-- kb-manager:moc:start -->\n<!-- kb-manager:moc:end -->\n```\nEnd.';
    expect(isWriteSafe(content, 'moc')).toBe(false);
  });

  it('still detects real delimiters when example delimiters exist in a fence', () => {
    const content =
      '```\n<!-- kb-manager:moc:start --> // example\n<!-- kb-manager:moc:end --> // example\n```\n' +
      '<!-- kb-manager:moc:start -->\nreal\n<!-- kb-manager:moc:end -->';
    expect(isWriteSafe(content, 'moc')).toBe(true);
  });

  it('treats unclosed fence as no fence so delimiters after it still work', () => {
    // A user with an in-progress edit (opening ``` but no close yet) must
    // not permanently disable kb-manager writes.
    const content =
      '<!-- kb-manager:moc:start -->\nbody\n<!-- kb-manager:moc:end -->\n\n```\nincomplete fence at EOF';
    expect(isWriteSafe(content, 'moc')).toBe(true);
  });

  it('ignores 4-space indented "fences" (not real markdown fences)', () => {
    // Indented code blocks are NOT fences; backticks inside them are content.
    const content =
      '    ```\n    not a real fence\n<!-- kb-manager:moc:start -->\nx\n<!-- kb-manager:moc:end -->';
    expect(isWriteSafe(content, 'moc')).toBe(true);
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

  it('handles 4-backtick wrapper containing a 3-backtick example correctly', () => {
    // CommonMark: closer must be same char AND at least as long as opener.
    // A 3-backtick line inside a 4-backtick fence is content; the wrapper
    // is closed only by the matching 4-backtick line.
    const content =
      '````\n' +
      '```\n' +
      '<!-- kb-manager:moc:start -->\n' +
      '<!-- kb-manager:moc:end -->\n' +
      '```\n' +
      '````\n\n' +
      '<!-- kb-manager:moc:start -->\nreal\n<!-- kb-manager:moc:end -->';
    expect(isWriteSafe(content, 'moc')).toBe(true);
  });

  it('targets the real managed pair, not the in-fence example pair', () => {
    // User has a code-fence example of kb-manager delimiters followed by the
    // real managed pair. Replace must touch only the real pair; otherwise
    // we splice the new body into the middle of the user's docs and leave
    // the real section stale.
    const content =
      '## Docs\n\n' +
      '```markdown\n' +
      '<!-- kb-manager:moc:start -->\n' +
      'example body\n' +
      '<!-- kb-manager:moc:end -->\n' +
      '```\n\n' +
      '## Real\n\n' +
      '<!-- kb-manager:moc:start -->\n' +
      'OLD\n' +
      '<!-- kb-manager:moc:end -->';
    const result = replaceDelimitedSection(content, 'moc', 'NEW');
    expect(result).toContain('example body'); // fenced docs untouched
    expect(result).toContain('NEW'); // real section replaced
    expect(result).not.toContain('OLD');
  });
});
