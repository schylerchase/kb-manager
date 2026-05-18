import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { applyCleansePlan, buildCleansePlan, type CleanseHost } from './cleanse-tags';
import { TagMutator, type MutatorDeps } from '../lib/tag-mutator';

type FakeFile = { path: string; frontmatter: Record<string, unknown>; body: string };

function makeFile(path: string, body = '', frontmatter: Record<string, unknown> = {}): FakeFile {
  return { path, frontmatter, body };
}

function host(initial: FakeFile[], allTagsRaw: Array<{ tag: string; noteCount: number }>): CleanseHost & { fakes: FakeFile[] } {
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
    getAllTagsWithCounts() {
      return allTagsRaw;
    },
  };
}

describe('buildCleansePlan', () => {
  it('returns an empty plan when every tag is already valid', () => {
    const h = host([], [{ tag: 'mcp', noteCount: 3 }, { tag: 'active-directory', noteCount: 1 }]);
    const plan = buildCleansePlan(h);
    expect(plan.items).toEqual([]);
    expect(plan.rewriteCount).toBe(0);
    expect(plan.unfixableCount).toBe(0);
  });

  it('plans a rewrite when a tag cleanses to a different valid form', () => {
    const h = host([], [{ tag: '802.1x', noteCount: 2 }]);
    const plan = buildCleansePlan(h);
    expect(plan.items).toEqual([{ kind: 'rewrite', from: '802.1x', to: '802-1x', noteCount: 2 }]);
    expect(plan.rewriteCount).toBe(1);
    expect(plan.affectedNoteCount).toBe(2);
  });

  it('marks unfixable tags (pure numeric) without proposing a destination', () => {
    const h = host([], [{ tag: '123', noteCount: 1 }, { tag: 'proj/2024', noteCount: 4 }]);
    const plan = buildCleansePlan(h);
    expect(plan.unfixableCount).toBe(2);
    expect(plan.items.every((i) => i.kind === 'unfixable')).toBe(true);
  });

  it('reports rewrite and unfixable items in one plan', () => {
    const h = host([], [
      { tag: '802.1x', noteCount: 2 },
      { tag: '123', noteCount: 1 },
      { tag: 'mcp', noteCount: 5 },
    ]);
    const plan = buildCleansePlan(h);
    expect(plan.rewriteCount).toBe(1);
    expect(plan.unfixableCount).toBe(1);
    expect(plan.affectedNoteCount).toBe(3);
  });
});

describe('applyCleansePlan', () => {
  it('rewrites every fixable frontmatter tag and reports counts', async () => {
    // Inline body containing `#802.1x` isn't a real-world case: Obsidian
    // (and our inline scanner) require tags to start with a letter, so an
    // invalid form like `802.1x` only ever survives in frontmatter. The
    // cleanse sweep targets exactly that surface.
    const h = host(
      [makeFile('a.md', '', { tags: ['802.1x'] }), makeFile('b.md', '', { tags: ['802.1x'] })],
      [{ tag: '802.1x', noteCount: 2 }],
    );
    const plan = buildCleansePlan(h);
    const result = await applyCleansePlan(h, plan);
    expect(result.rewritten).toBe(1);
    expect(result.filesChanged).toBe(2);
    expect(h.fakes[0]!.frontmatter.tags).toEqual(['802-1x']);
    expect(h.fakes[1]!.frontmatter.tags).toEqual(['802-1x']);
  });

  it('skips unfixable tags and counts them as skipped', async () => {
    const h = host([makeFile('a.md', '', { tags: ['123'] })], [{ tag: '123', noteCount: 1 }]);
    const plan = buildCleansePlan(h);
    const result = await applyCleansePlan(h, plan);
    expect(result.rewritten).toBe(0);
    expect(result.skipped).toBe(1);
    expect(h.fakes[0]!.frontmatter.tags).toEqual(['123']);
  });
});
