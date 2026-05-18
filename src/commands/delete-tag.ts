import { normalizeNoteTag } from '../lib/note-metadata';
import type { TagMutator, TagMutationResult } from '../lib/tag-mutator';

export type DeleteOutcome =
  | { ok: true; tag: string; filesChanged: number; errors: number }
  | { ok: false; reason: 'invalid-tag' | 'no-matches' | 'cancelled'; message: string };

export interface DeleteTagHost {
  mutator: TagMutator;
  countFilesWithTag(tag: string): number;
}

/**
 * Strip a tag from every file in the vault. Caller is responsible for
 * confirmation — this performs the mutation directly.
 */
export async function deleteTagEverywhere(host: DeleteTagHost, rawTag: string): Promise<DeleteOutcome> {
  const tag = normalizeNoteTag(rawTag);
  if (tag === '') return { ok: false, reason: 'invalid-tag', message: 'Invalid tag.' };

  const count = host.countFilesWithTag(tag);
  if (count === 0) {
    return { ok: false, reason: 'no-matches', message: `No notes use #${tag}.` };
  }

  const result: TagMutationResult = await host.mutator.deleteTag(tag);
  return {
    ok: true,
    tag,
    filesChanged: result.filesChanged,
    errors: result.errors.length,
  };
}
