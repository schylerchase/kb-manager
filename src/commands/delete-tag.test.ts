import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { deleteTagEverywhere, type DeleteTagHost } from './delete-tag';
import { TagMutator, type MutatorDeps } from '../lib/tag-mutator';

type FakeFile = { path: string; frontmatter: Record<string, unknown>; body: string };

function makeFile(path: string, body = '', frontmatter: Record<string, unknown> = {}): FakeFile {
  return { path, frontmatter, body };
}

function host(initial: FakeFile[]): DeleteTagHost & { fakes: FakeFile[] } {
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
      return initial as unknown as TFile[];
    },
    filesWithTag(tag) {
      return initial
        .filter((f) => {
          const fmHas = Array.isArray(f.frontmatter.tags) && f.frontmatter.tags.includes(tag);
          const inlineHas = f.body.includes(`#${tag}`);
          return fmHas || inlineHas;
        })
        .map((f) => f as unknown as TFile);
    },
    onSelfModify() {},
    onTagsAffected() {},
  };

  return {
    fakes: initial,
    mutator: new TagMutator(deps),
    countFilesWithTag(tag) {
      return deps.filesWithTag(tag).length;
    },
  };
}

describe('deleteTagEverywhere', () => {
  it('rejects empty/invalid tags', async () => {
    const h = host([]);
    const out = await deleteTagEverywhere(h, '   ');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('invalid-tag');
  });

  it('reports no-matches without writing when nothing uses the tag', async () => {
    const h = host([makeFile('a.md', '', { tags: ['other'] })]);
    const out = await deleteTagEverywhere(h, 'gone');
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('no-matches');
      expect(out.message).toContain('#gone');
    }
    expect(h.fakes[0]!.frontmatter.tags).toEqual(['other']);
  });

  it('strips a tag from a single file (frontmatter)', async () => {
    const h = host([makeFile('a.md', '', { tags: ['orphan', 'keep'] })]);
    const out = await deleteTagEverywhere(h, 'orphan');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.filesChanged).toBe(1);
    expect(h.fakes[0]!.frontmatter.tags).toEqual(['keep']);
  });

  it('strips a tag from multiple files', async () => {
    const h = host([
      makeFile('a.md', '', { tags: ['gone'] }),
      makeFile('b.md', 'body #gone here', {}),
      makeFile('c.md', '', { tags: ['unrelated'] }),
    ]);
    const out = await deleteTagEverywhere(h, 'gone');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.filesChanged).toBe(2);
    expect(h.fakes[0]!.frontmatter.tags).toEqual([]);
    expect(h.fakes[1]!.body).toBe('body  here');
    expect(h.fakes[2]!.frontmatter.tags).toEqual(['unrelated']);
  });

  it('does not cascade to child tags when deleting parent', async () => {
    const h = host([
      makeFile('a.md', '', { tags: ['a'] }),
      makeFile('b.md', '', { tags: ['a/b'] }),
    ]);
    const out = await deleteTagEverywhere(h, 'a');
    expect(out.ok).toBe(true);
    expect(h.fakes[0]!.frontmatter.tags).toEqual([]);
    expect(h.fakes[1]!.frontmatter.tags).toEqual(['a/b']);
  });

  it('normalizes the input tag', async () => {
    const h = host([makeFile('a.md', '', { tags: ['foo'] })]);
    const out = await deleteTagEverywhere(h, '#FOO');
    expect(out.ok).toBe(true);
    expect(h.fakes[0]!.frontmatter.tags).toEqual([]);
  });
});
