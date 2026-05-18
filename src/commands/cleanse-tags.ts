import { normalizeNoteTag } from '../lib/note-metadata';
import type { TagMutator } from '../lib/tag-mutator';

export type CleansePlanItem =
  | { kind: 'rewrite'; from: string; to: string; noteCount: number }
  | { kind: 'unfixable'; from: string; noteCount: number };

export type CleansePlan = {
  items: CleansePlanItem[];
  rewriteCount: number;
  unfixableCount: number;
  affectedNoteCount: number;
};

export interface CleanseHost {
  mutator: TagMutator;
  getAllTagsWithCounts(): Array<{ tag: string; noteCount: number }>;
}

/**
 * Build a plan describing every invalid tag in the index and what we'd
 * rewrite it to. Does NOT mutate anything — callers preview the plan and
 * choose whether to apply.
 *
 * - `rewrite`: the tag has a fixable form (e.g. `802.1x` → `802-1x`). Will
 *   be applied via mutator.renameTag during {@link applyCleansePlan}.
 * - `unfixable`: the tag cleanses to '' (e.g. pure numeric like `#123`).
 *   Skipped by apply — surfaces in the report so users can decide to
 *   delete those tags manually.
 */
export function buildCleansePlan(host: CleanseHost): CleansePlan {
  const items: CleansePlanItem[] = [];
  const seenRewrites = new Set<string>();
  let rewriteCount = 0;
  let unfixableCount = 0;
  const affectedNotes = new Set<number>(); // not used — counted differently below

  let affectedNoteCount = 0;
  for (const { tag, noteCount } of host.getAllTagsWithCounts()) {
    const cleansed = normalizeNoteTag(tag);
    if (cleansed === tag) continue; // already valid
    if (cleansed === '') {
      items.push({ kind: 'unfixable', from: tag, noteCount });
      unfixableCount += 1;
      affectedNoteCount += noteCount;
      continue;
    }
    // Multiple invalid tags can cleanse to the same destination — dedupe to
    // avoid showing "foo.bar → foo-bar" twice when both forms appear.
    const key = `${tag}::${cleansed}`;
    if (seenRewrites.has(key)) continue;
    seenRewrites.add(key);
    items.push({ kind: 'rewrite', from: tag, to: cleansed, noteCount });
    rewriteCount += 1;
    affectedNoteCount += noteCount;
  }

  return { items, rewriteCount, unfixableCount, affectedNoteCount };
}

export type CleanseResult = {
  rewritten: number;
  filesChanged: number;
  errors: number;
  skipped: number;
};

/**
 * Apply only the rewrite items in a plan. Unfixable items are skipped
 * (user must explicitly delete them via the Delete tag command).
 */
export async function applyCleansePlan(host: CleanseHost, plan: CleansePlan): Promise<CleanseResult> {
  let filesChanged = 0;
  let errors = 0;
  let rewritten = 0;
  for (const item of plan.items) {
    if (item.kind !== 'rewrite') continue;
    try {
      const result = await host.mutator.renameTag(item.from, item.to);
      rewritten += 1;
      filesChanged += result.filesChanged;
      errors += result.errors.length;
    } catch (err) {
      errors += 1;
      // intentionally swallow per-tag errors so the sweep keeps going
    }
  }
  return { rewritten, filesChanged, errors, skipped: plan.unfixableCount };
}
