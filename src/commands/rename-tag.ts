import { normalizeNoteTag } from '../lib/note-metadata';
import type { TagMutator } from '../lib/tag-mutator';

export type RenameOutcome =
  | { ok: true; from: string; to: string; filesChanged: number; errors: number; mergedIntoExisting: boolean }
  | { ok: false; reason: 'invalid-from' | 'invalid-to' | 'same' | 'no-matches'; message: string };

export interface RenameTagHost {
  mutator: TagMutator;
  countFilesWithTag(tag: string): number;
  tagExists(tag: string): boolean;
}

/**
 * Rewrite `from` → `to` across every file containing `from`. When `to`
 * already exists as a tag the operation is a merge — `mergedIntoExisting`
 * flags that the caller can display "merged" wording in the Notice.
 */
export async function renameTagEverywhere(host: RenameTagHost, rawFrom: string, rawTo: string): Promise<RenameOutcome> {
  const from = normalizeNoteTag(rawFrom);
  const to = normalizeNoteTag(rawTo);
  if (from === '') return { ok: false, reason: 'invalid-from', message: 'Source tag is invalid.' };
  if (to === '') return { ok: false, reason: 'invalid-to', message: 'Destination tag is invalid.' };
  if (from === to) return { ok: false, reason: 'same', message: 'Source and destination are the same.' };

  if (host.countFilesWithTag(from) === 0) {
    return { ok: false, reason: 'no-matches', message: `No notes use #${from}.` };
  }

  const mergedIntoExisting = host.tagExists(to);
  const result = await host.mutator.renameTag(from, to);
  return {
    ok: true,
    from,
    to,
    filesChanged: result.filesChanged,
    errors: result.errors.length,
    mergedIntoExisting,
  };
}

/**
 * Build a dry-run summary before committing — used by modals to show
 * "Will rewrite N notes" before the user clicks confirm.
 */
export async function previewRename(host: RenameTagHost, rawFrom: string, rawTo: string): Promise<{
  filesAffected: number;
  willMerge: boolean;
  invalid: boolean;
}> {
  const from = normalizeNoteTag(rawFrom);
  const to = normalizeNoteTag(rawTo);
  if (from === '' || to === '' || from === to) {
    return { filesAffected: 0, willMerge: false, invalid: true };
  }
  const result = await host.mutator.renameTag(from, to, { dryRun: true });
  return {
    filesAffected: result.filesChanged,
    willMerge: host.tagExists(to),
    invalid: false,
  };
}
