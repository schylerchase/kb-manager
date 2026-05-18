import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { previewRename, renameTagEverywhere, type RenameTagHost } from './rename-tag';
import { TagMutator, type MutatorDeps } from '../lib/tag-mutator';

type FakeFile = { path: string; frontmatter: Record<string, unknown>; body: string };

function makeFile(path: string, body = '', frontmatter: Record<string, unknown> = {}): FakeFile {
  return { path, frontmatter, body };
}

function host(initial: FakeFile[]): RenameTagHost & { fakes: FakeFile[] } {
  const byPath = new Map(initial.map((f) => [f.path, f]));
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
      return initial as unknown as TFile[];
    },
    filesWithTag(tag) {
      return initial
        .filter((f) => {
          const fmHas = Array.isArray(f.frontmatter.tags) && f.frontmatter.tags.includes(tag);
          return fmHas || f.body.includes(`#${tag}`);
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
    tagExists(tag) {
      return deps.filesWithTag(tag).length > 0;
    },
  };
}

describe('renameTagEverywhere', () => {
  it('rewrites across all files', async () => {
    const h = host([makeFile('a.md', '', { tags: ['old'] }), makeFile('b.md', 'body #old here', {})]);
    const out = await renameTagEverywhere(h, 'old', 'new');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.filesChanged).toBe(2);
    expect(h.fakes[0]!.frontmatter.tags).toEqual(['new']);
    expect(h.fakes[1]!.body).toBe('body #new here');
  });

  it('rejects empty from', async () => {
    const out = await renameTagEverywhere(host([]), '', 'new');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('invalid-from');
  });

  it('rejects empty to', async () => {
    const out = await renameTagEverywhere(host([]), 'old', '   ');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('invalid-to');
  });

  it('rejects same source and destination', async () => {
    const out = await renameTagEverywhere(host([]), 'foo', '#Foo');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('same');
  });

  it('reports no-matches without writing', async () => {
    const h = host([makeFile('a.md', '', { tags: ['other'] })]);
    const out = await renameTagEverywhere(h, 'missing', 'new');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no-matches');
  });

  it('flags merge when destination already exists', async () => {
    const h = host([makeFile('a.md', '', { tags: ['old'] }), makeFile('b.md', '', { tags: ['new'] })]);
    const out = await renameTagEverywhere(h, 'old', 'new');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.mergedIntoExisting).toBe(true);
  });
});

describe('previewRename', () => {
  it('reports affected count without writing', async () => {
    const h = host([makeFile('a.md', '', { tags: ['old'] }), makeFile('b.md', '', { tags: ['old'] })]);
    const preview = await previewRename(h, 'old', 'new');
    expect(preview.filesAffected).toBe(2);
    expect(preview.willMerge).toBe(false);
    expect(preview.invalid).toBe(false);
    expect(h.fakes[0]!.frontmatter.tags).toEqual(['old']);
  });

  it('flags merge in preview', async () => {
    const h = host([makeFile('a.md', '', { tags: ['old'] }), makeFile('b.md', '', { tags: ['new'] })]);
    const preview = await previewRename(h, 'old', 'new');
    expect(preview.willMerge).toBe(true);
  });

  it('marks invalid input', async () => {
    const preview = await previewRename(host([]), '', 'x');
    expect(preview.invalid).toBe(true);
  });
});
