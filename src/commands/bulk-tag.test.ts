import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { runBulkTagOps, type BulkHost, type BulkSelector } from './bulk-tag';
import { TagMutator, type MutatorDeps } from '../lib/tag-mutator';

type FakeFile = { path: string; frontmatter: Record<string, unknown>; body: string };

function makeFile(path: string, body = '', frontmatter: Record<string, unknown> = {}): FakeFile {
  return { path, frontmatter, body };
}

function host(initial: FakeFile[]): BulkHost & { fakes: FakeFile[] } {
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
        .filter((f) => Array.isArray(f.frontmatter.tags) && f.frontmatter.tags.includes(tag))
        .map((f) => f as unknown as TFile);
    },
    onSelfModify() {},
    onTagsAffected() {},
  };
  return {
    fakes: initial,
    mutator: new TagMutator(deps),
    resolveSelector(selector: BulkSelector) {
      if (selector.kind === 'folder') {
        const prefix = selector.path.endsWith('/') ? selector.path : `${selector.path}/`;
        return initial.filter((f) => f.path === selector.path || f.path.startsWith(prefix)).map((f) => f as unknown as TFile);
      }
      if (selector.kind === 'tag') {
        return initial
          .filter((f) => Array.isArray(f.frontmatter.tags) && f.frontmatter.tags.includes(selector.tag))
          .map((f) => f as unknown as TFile);
      }
      const pathSet = new Set(selector.paths);
      return initial.filter((f) => pathSet.has(f.path)).map((f) => f as unknown as TFile);
    },
  };
}

describe('runBulkTagOps', () => {
  it('rejects when selector matches zero files', async () => {
    const h = host([makeFile('a.md', '', { tags: [] })]);
    const out = await runBulkTagOps(h, { kind: 'folder', path: 'missing' }, [{ kind: 'add', tag: 'x' }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no-files');
  });

  it('rejects when no valid ops', async () => {
    const h = host([makeFile('a.md', '', { tags: [] })]);
    const out = await runBulkTagOps(h, { kind: 'folder', path: '' }, [{ kind: 'add', tag: '   ' }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no-ops');
  });

  it('applies multiple ops across folder selection', async () => {
    const h = host([
      makeFile('kb/a.md', '', { tags: ['old'] }),
      makeFile('kb/b.md', '', { tags: [] }),
      makeFile('other/c.md', '', { tags: ['old'] }),
    ]);
    const out = await runBulkTagOps(
      h,
      { kind: 'folder', path: 'kb' },
      [
        { kind: 'add', tag: 'project' },
        { kind: 'rename', from: 'old', to: 'new' },
      ],
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.filesChanged).toBe(2);
    expect((h.fakes[0]!.frontmatter.tags as string[]).slice().sort()).toEqual(['new', 'project']);
    expect(h.fakes[1]!.frontmatter.tags).toEqual(['project']);
    expect(h.fakes[2]!.frontmatter.tags).toEqual(['old']);
  });

  it('supports tag-based selector', async () => {
    const h = host([
      makeFile('a.md', '', { tags: ['target'] }),
      makeFile('b.md', '', { tags: [] }),
    ]);
    await runBulkTagOps(h, { kind: 'tag', tag: 'target' }, [{ kind: 'add', tag: 'extra' }]);
    expect((h.fakes[0]!.frontmatter.tags as string[]).slice().sort()).toEqual(['extra', 'target']);
    expect(h.fakes[1]!.frontmatter.tags).toEqual([]);
  });

  it('supports dry-run', async () => {
    const h = host([makeFile('a.md', '', { tags: [] })]);
    const out = await runBulkTagOps(h, { kind: 'paths', paths: ['a.md'] }, [{ kind: 'add', tag: 'x' }], true);
    expect(out.ok).toBe(true);
    expect(h.fakes[0]!.frontmatter.tags).toEqual([]);
  });
});
