import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { untagActiveFile, type UntagHost } from './untag-file';
import { TagMutator, type MutatorDeps } from '../lib/tag-mutator';

type FakeFile = { path: string; basename: string; frontmatter: Record<string, unknown>; body: string };

function makeFile(path: string, body = '', frontmatter: Record<string, unknown> = {}): FakeFile {
  const basename = path.split('/').pop()!.replace(/\.md$/, '');
  return { path, basename, frontmatter, body };
}

function host(initial: FakeFile[], active: FakeFile | null): UntagHost & { fakes: FakeFile[] } {
  const fakes = initial;
  const byPath = new Map(initial.map((f) => [f.path, f]));

  const deps: MutatorDeps = {
    async readNote(file) {
      const data = byPath.get((file as unknown as FakeFile).path)!;
      return { frontmatterTags: data.frontmatter.tags, content: data.body };
    },
    async writeFrontmatter(file, mutate) {
      const data = byPath.get((file as unknown as FakeFile).path)!;
      mutate(data.frontmatter);
    },
    async writeBody(file, mutate) {
      const data = byPath.get((file as unknown as FakeFile).path)!;
      data.body = mutate(data.body);
    },
    listFiles() {
      return fakes as unknown as TFile[];
    },
    filesWithTag(tag) {
      return fakes
        .filter((f) => Array.isArray(f.frontmatter.tags) && f.frontmatter.tags.includes(tag))
        .map((f) => f as unknown as TFile);
    },
    onSelfModify() {},
    onTagsAffected() {},
  };

  const mutator = new TagMutator(deps);
  return {
    fakes,
    mutator,
    getActiveMarkdownFile() {
      return (active as unknown as TFile) ?? null;
    },
    async readTagState(file) {
      const data = byPath.get((file as unknown as FakeFile).path)!;
      return { frontmatterTags: data.frontmatter.tags, content: data.body };
    },
  };
}

describe('untagActiveFile', () => {
  it('rejects when there is no active file', async () => {
    const h = host([], null);
    const out = await untagActiveFile(h, 'foo');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no-active-file');
  });

  it('rejects when the tag is not on the active file', async () => {
    const file = makeFile('a.md', 'body', { tags: ['x'] });
    const h = host([file], file);
    const out = await untagActiveFile(h, 'y');
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('tag-not-on-file');
      expect(out.message).toContain('#y');
    }
  });

  it('removes a frontmatter tag from the active file', async () => {
    const file = makeFile('a.md', 'body', { tags: ['gone', 'keep'] });
    const h = host([file], file);
    const out = await untagActiveFile(h, 'gone');
    expect(out.ok).toBe(true);
    expect(h.fakes[0]!.frontmatter.tags).toEqual(['keep']);
  });

  it('removes an inline tag from the active file', async () => {
    const file = makeFile('a.md', 'note about #gone here', {});
    const h = host([file], file);
    const out = await untagActiveFile(h, 'gone');
    expect(out.ok).toBe(true);
    expect(h.fakes[0]!.body).toBe('note about  here');
  });

  it('normalizes the input tag', async () => {
    const file = makeFile('a.md', '', { tags: ['foo'] });
    const h = host([file], file);
    const out = await untagActiveFile(h, '#FOO');
    expect(out.ok).toBe(true);
    expect(h.fakes[0]!.frontmatter.tags).toEqual([]);
  });

  it('rejects an empty or whitespace-only tag', async () => {
    const file = makeFile('a.md', '', { tags: ['foo'] });
    const h = host([file], file);
    const out = await untagActiveFile(h, '   ');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('invalid-tag');
  });
});
