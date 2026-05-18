import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { frontmatterToInlineForActiveFile, inlineToFrontmatterForActiveFile, type ConvertHost } from './convert-tag-location';
import { TagMutator, type MutatorDeps } from '../lib/tag-mutator';

type FakeFile = { path: string; frontmatter: Record<string, unknown>; body: string };

function makeFile(path: string, body = '', frontmatter: Record<string, unknown> = {}): FakeFile {
  return { path, frontmatter, body };
}

function host(active: FakeFile | null, all: FakeFile[]): ConvertHost & { fakes: FakeFile[] } {
  const byPath = new Map(all.map((f) => [f.path, f]));
  const deps: MutatorDeps = {
    async readNote(file) {
      const data = byPath.get((file as unknown as FakeFile).path)!;
      return { frontmatterTags: data.frontmatter.tags, content: data.body };
    },
    async writeFrontmatter(file, mutate) {
      mutate(byPath.get((file as unknown as FakeFile).path)!.frontmatter);
    },
    async writeBody(file, mutate) {
      const data = byPath.get((file as unknown as FakeFile).path)!;
      data.body = mutate(data.body);
    },
    listFiles() {
      return all as unknown as TFile[];
    },
    filesWithTag() {
      return [];
    },
    onSelfModify() {},
    onTagsAffected() {},
  };
  return {
    fakes: all,
    mutator: new TagMutator(deps),
    getActiveMarkdownFile() {
      return (active as unknown as TFile) ?? null;
    },
  };
}

describe('inlineToFrontmatterForActiveFile', () => {
  it('rejects when there is no active file', async () => {
    const out = await inlineToFrontmatterForActiveFile(host(null, []));
    expect(out.ok).toBe(false);
  });

  it('moves inline tags into frontmatter', async () => {
    const file = makeFile('a.md', 'body #foo and #bar', { tags: [] });
    const h = host(file, [file]);
    const out = await inlineToFrontmatterForActiveFile(h);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.filesChanged).toBe(1);
    expect(h.fakes[0]!.frontmatter.tags).toEqual(['foo', 'bar']);
    expect(h.fakes[0]!.body).not.toContain('#foo');
  });
});

describe('frontmatterToInlineForActiveFile', () => {
  it('moves frontmatter tags into body', async () => {
    const file = makeFile('a.md', 'existing', { tags: ['foo', 'bar'] });
    const h = host(file, [file]);
    const out = await frontmatterToInlineForActiveFile(h);
    expect(out.ok).toBe(true);
    expect(h.fakes[0]!.frontmatter.tags).toEqual([]);
    expect(h.fakes[0]!.body).toContain('#foo #bar');
  });
});
