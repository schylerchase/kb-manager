import type { TFile } from 'obsidian';
import { normalizeNoteTag } from '../lib/note-metadata';
import { buildNoteTagState, noteHasTag } from '../lib/note-tag-state';
import type { TagMutator } from '../lib/tag-mutator';

export type UntagOutcome =
  | { ok: true; tag: string; file: TFile }
  | { ok: false; reason: 'no-active-file' | 'tag-not-on-file' | 'invalid-tag' | 'write-failed'; message: string };

/**
 * Narrow plugin shape the untag command consumes. Avoids depending on the
 * whole KBManagerPlugin so the command is testable with a tiny mock.
 */
export interface UntagHost {
  getActiveMarkdownFile(): TFile | null;
  readTagState(file: TFile): Promise<{ frontmatterTags: unknown; content: string }>;
  mutator: TagMutator;
}

/**
 * Remove a single tag from the currently active markdown note.
 *
 * Designed to surface failure modes as structured outcomes rather than
 * exceptions so the calling UI can show targeted Notices.
 */
export async function untagActiveFile(host: UntagHost, rawTag: string): Promise<UntagOutcome> {
  const tag = normalizeNoteTag(rawTag);
  if (tag === '') {
    return { ok: false, reason: 'invalid-tag', message: 'Invalid tag.' };
  }

  const file = host.getActiveMarkdownFile();
  if (!file) {
    return { ok: false, reason: 'no-active-file', message: 'No active markdown note.' };
  }

  const { frontmatterTags, content } = await host.readTagState(file);
  const state = buildNoteTagState(file.path, content, frontmatterTags);
  if (!noteHasTag(state, tag)) {
    return { ok: false, reason: 'tag-not-on-file', message: `#${tag} is not on ${file.basename ?? file.path}.` };
  }

  const changed = await host.mutator.untagFile(file, tag);
  if (!changed) {
    return { ok: false, reason: 'write-failed', message: `Could not remove #${tag}. Check the note manually.` };
  }
  return { ok: true, tag, file };
}
