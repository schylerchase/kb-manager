import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { TagMutator, type MutatorDeps } from './tag-mutator';

// ----------------------- mock harness -----------------------

type FakeFile = { path: string; frontmatter: Record<string, unknown>; body: string };

function makeFile(path: string, body = '', frontmatter: Record<string, unknown> = {}): FakeFile {
  return { path, frontmatter, body };
}

function asTFile(file: FakeFile): TFile {
  return file as unknown as TFile;
}

type Harness = {
  deps: MutatorDeps;
  files: Map<string, FakeFile>;
  selfModifies: string[];
  affectedTags: string[];
  mutator: TagMutator;
};

function harness(initialFiles: FakeFile[]): Harness {
  const files = new Map<string, FakeFile>();
  for (const f of initialFiles) files.set(f.path, f);
  const selfModifies: string[] = [];
  const affectedTags: string[] = [];

  const deps: MutatorDeps = {
    async readNote(file) {
      const data = files.get((file as unknown as FakeFile).path);
      if (!data) throw new Error(`unknown file: ${(file as unknown as FakeFile).path}`);
      return { frontmatterTags: data.frontmatter.tags, content: data.body };
    },
    async writeFrontmatter(file, mutate) {
      const data = files.get((file as unknown as FakeFile).path)!;
      mutate(data.frontmatter);
    },
    async writeBody(file, mutate) {
      const data = files.get((file as unknown as FakeFile).path)!;
      data.body = mutate(data.body);
    },
    listFiles(opts) {
      const all = [...files.values()].map(asTFile);
      if (!opts?.folderPath) return all;
      const prefix = opts.folderPath.endsWith('/') ? opts.folderPath : `${opts.folderPath}/`;
      return all.filter((f) => {
        const p = (f as unknown as FakeFile).path;
        return p === opts.folderPath || p.startsWith(prefix);
      });
    },
    filesWithTag(tag) {
      const out: TFile[] = [];
      for (const data of files.values()) {
        const fm = Array.isArray(data.frontmatter.tags) ? data.frontmatter.tags : [];
        const hasFm = fm.includes(tag);
        const hasInline = data.body.includes(`#${tag}`);
        if (hasFm || hasInline) out.push(asTFile(data));
      }
      return out;
    },
    onSelfModify(path) {
      selfModifies.push(path);
    },
    onTagsAffected(tags) {
      for (const t of tags) affectedTags.push(t);
    },
  };

  return { deps, files, selfModifies, affectedTags, mutator: new TagMutator(deps) };
}

// ----------------------- tests -----------------------

describe('TagMutator.renameTag', () => {
  it('rewrites frontmatter-only occurrences', async () => {
    const h = harness([
      makeFile('a.md', 'body', { tags: ['old', 'keep'] }),
      makeFile('b.md', 'body', { tags: ['keep'] }),
    ]);
    const result = await h.mutator.renameTag('old', 'new');
    expect(result.filesChanged).toBe(1);
    expect((h.files.get('a.md')!.frontmatter.tags as string[]).slice().sort()).toEqual(['keep', 'new']);
    expect(h.files.get('b.md')!.frontmatter.tags).toEqual(['keep']);
  });

  it('rewrites inline-only occurrences', async () => {
    const h = harness([makeFile('a.md', 'body has #old and more', {})]);
    const result = await h.mutator.renameTag('old', 'new');
    expect(result.filesChanged).toBe(1);
    expect(h.files.get('a.md')!.body).toBe('body has #new and more');
  });

  it('rewrites both frontmatter and inline in one pass', async () => {
    const h = harness([makeFile('a.md', 'body #old here', { tags: ['old'] })]);
    await h.mutator.renameTag('old', 'new');
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['new']);
    expect(h.files.get('a.md')!.body).toBe('body #new here');
  });

  it('dedupes when renaming to a tag the file already has', async () => {
    const h = harness([makeFile('a.md', 'body', { tags: ['old', 'new'] })]);
    await h.mutator.renameTag('old', 'new');
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['new']);
  });

  it('only affects exact-match hierarchical tags', async () => {
    const h = harness([
      makeFile('a.md', '', { tags: ['a/b'] }),
      makeFile('b.md', '', { tags: ['a'] }),
    ]);
    await h.mutator.renameTag('a', 'z');
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['a/b']);
    expect(h.files.get('b.md')!.frontmatter.tags).toEqual(['z']);
  });

  it('calls onSelfModify before each write', async () => {
    const h = harness([
      makeFile('a.md', 'body #old', { tags: ['old'] }),
      makeFile('b.md', 'body #old', {}),
    ]);
    await h.mutator.renameTag('old', 'new');
    // a.md: 2 writes (frontmatter + body), b.md: 1 write (body only)
    expect(h.selfModifies).toEqual(['a.md', 'a.md', 'b.md']);
  });

  it('reports tags affected at the end of the batch', async () => {
    const h = harness([makeFile('a.md', '', { tags: ['old'] })]);
    await h.mutator.renameTag('old', 'new');
    expect(h.affectedTags.sort()).toEqual(['new', 'old']);
  });

  it('returns empty result when from/to normalize equal', async () => {
    const h = harness([makeFile('a.md', '', { tags: ['Foo'] })]);
    const result = await h.mutator.renameTag('Foo', '#FOO');
    expect(result.filesScanned).toBe(0);
    expect(result.filesChanged).toBe(0);
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['Foo']);
  });

  it('captures errors per file and continues', async () => {
    const h = harness([makeFile('a.md', '', { tags: ['old'] }), makeFile('b.md', '', { tags: ['old'] })]);
    const originalWrite = h.deps.writeFrontmatter;
    h.deps.writeFrontmatter = async (file, mutate) => {
      const path = (file as unknown as FakeFile).path;
      if (path === 'a.md') throw new Error('boom');
      await originalWrite(file, mutate);
    };
    const result = await h.mutator.renameTag('old', 'new');
    expect(result.errors).toEqual([{ path: 'a.md', error: 'boom' }]);
    expect(result.filesChanged).toBe(1);
    expect(h.files.get('b.md')!.frontmatter.tags).toEqual(['new']);
  });
});

describe('TagMutator.renameTag (dry run)', () => {
  it('reports change list without writing', async () => {
    const h = harness([makeFile('a.md', 'body #old', { tags: ['old'] })]);
    const result = await h.mutator.renameTag('old', 'new', { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.filesChanged).toBe(1);
    expect(result.changes[0]!.before).toContain('old');
    expect(result.changes[0]!.after).toContain('new');
    // Files should be untouched
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['old']);
    expect(h.files.get('a.md')!.body).toBe('body #old');
    expect(h.affectedTags).toEqual([]);
  });
});

describe('TagMutator.deleteTag', () => {
  it('removes tag from frontmatter', async () => {
    const h = harness([makeFile('a.md', '', { tags: ['gone', 'keep'] })]);
    await h.mutator.deleteTag('gone');
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['keep']);
  });

  it('removes tag from inline body', async () => {
    const h = harness([makeFile('a.md', 'body #gone keep #other', {})]);
    await h.mutator.deleteTag('gone');
    expect(h.files.get('a.md')!.body).toBe('body  keep #other');
  });

  it('removes from both locations in one pass', async () => {
    const h = harness([makeFile('a.md', 'body #gone', { tags: ['gone', 'keep'] })]);
    await h.mutator.deleteTag('gone');
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['keep']);
    expect(h.files.get('a.md')!.body).toBe('body ');
  });

  it('respects folder filter', async () => {
    const h = harness([
      makeFile('alpha/a.md', '', { tags: ['x'] }),
      makeFile('beta/b.md', '', { tags: ['x'] }),
    ]);
    await h.mutator.deleteTag('x', { folderPath: 'alpha' });
    expect(h.files.get('alpha/a.md')!.frontmatter.tags).toEqual([]);
    expect(h.files.get('beta/b.md')!.frontmatter.tags).toEqual(['x']);
  });
});

describe('TagMutator.untagFile', () => {
  it('removes a tag from a single file and returns true', async () => {
    const h = harness([makeFile('a.md', 'body #x', { tags: ['x', 'y'] })]);
    const file = asTFile(h.files.get('a.md')!);
    const ok = await h.mutator.untagFile(file, 'x');
    expect(ok).toBe(true);
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['y']);
    expect(h.files.get('a.md')!.body).toBe('body ');
  });

  it('returns false when the tag is not present', async () => {
    const h = harness([makeFile('a.md', '', { tags: ['x'] })]);
    const file = asTFile(h.files.get('a.md')!);
    const ok = await h.mutator.untagFile(file, 'missing');
    expect(ok).toBe(false);
  });
});

describe('TagMutator.bulkApply', () => {
  it('applies compound ops across multiple files in one batch', async () => {
    const h = harness([
      makeFile('a.md', 'body #foo', { tags: [] }),
      makeFile('b.md', '', { tags: ['old'] }),
    ]);
    const files = [asTFile(h.files.get('a.md')!), asTFile(h.files.get('b.md')!)];
    const result = await h.mutator.bulkApply(files, [
      { kind: 'add', tag: 'project' },
      { kind: 'rename', from: 'old', to: 'new' },
    ]);
    expect(result.filesChanged).toBe(2);
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['project']);
    expect((h.files.get('b.md')!.frontmatter.tags as string[]).slice().sort()).toEqual(['new', 'project']);
  });

  it('ignores invalid ops (empty tag, rename equal)', async () => {
    const h = harness([makeFile('a.md', '', { tags: ['x'] })]);
    const result = await h.mutator.bulkApply([asTFile(h.files.get('a.md')!)], [
      { kind: 'add', tag: '   ' },
      { kind: 'rename', from: 'x', to: 'x' },
    ]);
    expect(result.filesScanned).toBe(0);
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['x']);
  });
});

describe('TagMutator.inlineToFrontmatter', () => {
  it('moves inline tags into frontmatter', async () => {
    const h = harness([makeFile('a.md', 'body #foo and #bar', { tags: [] })]);
    await h.mutator.inlineToFrontmatter([asTFile(h.files.get('a.md')!)]);
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['foo', 'bar']);
    expect(h.files.get('a.md')!.body).toBe('body  and ');
  });

  it('restricts to provided tag whitelist', async () => {
    const h = harness([makeFile('a.md', 'body #foo and #bar', {})]);
    await h.mutator.inlineToFrontmatter([asTFile(h.files.get('a.md')!)], ['foo']);
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual(['foo']);
    expect(h.files.get('a.md')!.body).toContain('#bar');
    expect(h.files.get('a.md')!.body).not.toContain('#foo');
  });

  it('is a no-op when no inline tags match', async () => {
    const h = harness([makeFile('a.md', 'body without tags', {})]);
    const result = await h.mutator.inlineToFrontmatter([asTFile(h.files.get('a.md')!)]);
    expect(result.filesChanged).toBe(0);
  });
});

describe('TagMutator.frontmatterToInline', () => {
  it('moves frontmatter tags into body', async () => {
    const h = harness([makeFile('a.md', 'existing body', { tags: ['foo', 'bar'] })]);
    await h.mutator.frontmatterToInline([asTFile(h.files.get('a.md')!)]);
    expect(h.files.get('a.md')!.frontmatter.tags).toEqual([]);
    expect(h.files.get('a.md')!.body).toContain('#foo #bar');
  });
});
