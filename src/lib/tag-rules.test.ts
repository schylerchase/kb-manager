import { describe, expect, it } from 'vitest';
import { evaluateRules, type TagRule } from './tag-rules';

function rule(partial: Partial<TagRule>): TagRule {
  return {
    id: 'r',
    name: 'rule',
    enabled: true,
    trigger: 'on-create',
    match: {},
    action: {},
    ...partial,
  };
}

describe('evaluateRules', () => {
  it('returns empty when no rules', () => {
    const result = evaluateRules([], { filePath: 'a.md', trigger: 'on-create' });
    expect(result.matchedRules).toEqual([]);
    expect(result.tagsToAdd).toEqual([]);
  });

  it('skips disabled rules', () => {
    const r = rule({ enabled: false, action: { addTags: ['foo'] } });
    const result = evaluateRules([r], { filePath: 'a.md', trigger: 'on-create' });
    expect(result.matchedRules).toEqual([]);
  });

  it('matches by folder prefix', () => {
    const r = rule({ match: { folderPath: 'daily' }, action: { addTags: ['log'] } });
    const yes = evaluateRules([r], { filePath: 'daily/2026-05-17.md', trigger: 'on-create' });
    const no = evaluateRules([r], { filePath: 'kb/note.md', trigger: 'on-create' });
    expect(yes.tagsToAdd).toEqual(['log']);
    expect(no.tagsToAdd).toEqual([]);
  });

  it('matches by path regex', () => {
    const r = rule({ match: { pathRegex: 'projects/.*\\.md$' }, action: { addTags: ['project'] } });
    const yes = evaluateRules([r], { filePath: 'kb/projects/x.md', trigger: 'on-create' });
    const no = evaluateRules([r], { filePath: 'kb/x.md', trigger: 'on-create' });
    expect(yes.tagsToAdd).toEqual(['project']);
    expect(no.tagsToAdd).toEqual([]);
  });

  it('requires both folder and regex when both supplied', () => {
    const r = rule({
      match: { folderPath: 'daily', pathRegex: '\\d{4}' },
      action: { addTags: ['dated'] },
    });
    const both = evaluateRules([r], { filePath: 'daily/2026-05.md', trigger: 'on-create' });
    const onlyFolder = evaluateRules([r], { filePath: 'daily/intro.md', trigger: 'on-create' });
    expect(both.tagsToAdd).toEqual(['dated']);
    expect(onlyFolder.tagsToAdd).toEqual([]);
  });

  it('respects trigger', () => {
    const r = rule({ trigger: 'on-modify', action: { addTags: ['m'] } });
    expect(evaluateRules([r], { filePath: 'a.md', trigger: 'on-create' }).tagsToAdd).toEqual([]);
    expect(evaluateRules([r], { filePath: 'a.md', trigger: 'on-modify' }).tagsToAdd).toEqual(['m']);
  });

  it("manual rules fire on any trigger", () => {
    const r = rule({ trigger: 'manual', action: { addTags: ['m'] } });
    expect(evaluateRules([r], { filePath: 'a.md', trigger: 'on-create' }).tagsToAdd).toEqual(['m']);
    expect(evaluateRules([r], { filePath: 'a.md', trigger: 'on-modify' }).tagsToAdd).toEqual(['m']);
    expect(evaluateRules([r], { filePath: 'a.md', trigger: 'manual' }).tagsToAdd).toEqual(['m']);
  });

  it('accumulates tags from multiple matching rules', () => {
    const a = rule({ id: 'a', match: { folderPath: 'kb' }, action: { addTags: ['x'] } });
    const b = rule({ id: 'b', match: { folderPath: 'kb' }, action: { addTags: ['y'] } });
    const result = evaluateRules([a, b], { filePath: 'kb/note.md', trigger: 'on-create' });
    expect(result.tagsToAdd.sort()).toEqual(['x', 'y']);
    expect(result.matchedRules).toHaveLength(2);
  });

  it('captures regex errors without throwing', () => {
    const r = rule({ match: { pathRegex: '[invalid' }, action: { addTags: ['x'] } });
    const errors: Array<{ rule: TagRule; error: Error }> = [];
    const result = evaluateRules([r], { filePath: 'a.md', trigger: 'on-create' }, (rule, error) => {
      errors.push({ rule, error });
    });
    expect(result.tagsToAdd).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('deduplicates tags', () => {
    const a = rule({ id: 'a', action: { addTags: ['same'] } });
    const b = rule({ id: 'b', action: { addTags: ['same'] } });
    const result = evaluateRules([a, b], { filePath: 'a.md', trigger: 'on-create' });
    expect(result.tagsToAdd).toEqual(['same']);
  });
});
