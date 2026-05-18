import type { TFile } from 'obsidian';
import type { TagMutator } from '../lib/tag-mutator';

export type ConvertOutcome =
  | { ok: true; direction: 'inline-to-frontmatter' | 'frontmatter-to-inline'; filesChanged: number }
  | { ok: false; reason: 'no-active-file'; message: string };

export interface ConvertHost {
  mutator: TagMutator;
  getActiveMarkdownFile(): TFile | null;
}

/** Move every inline `#tag` on the active note into its frontmatter `tags:` array. */
export async function inlineToFrontmatterForActiveFile(host: ConvertHost): Promise<ConvertOutcome> {
  const file = host.getActiveMarkdownFile();
  if (!file) return { ok: false, reason: 'no-active-file', message: 'No active markdown note.' };
  const result = await host.mutator.inlineToFrontmatter([file]);
  return { ok: true, direction: 'inline-to-frontmatter', filesChanged: result.filesChanged };
}

/** Move every frontmatter tag on the active note into the body as `#tag`. */
export async function frontmatterToInlineForActiveFile(host: ConvertHost): Promise<ConvertOutcome> {
  const file = host.getActiveMarkdownFile();
  if (!file) return { ok: false, reason: 'no-active-file', message: 'No active markdown note.' };
  const result = await host.mutator.frontmatterToInline([file]);
  return { ok: true, direction: 'frontmatter-to-inline', filesChanged: result.filesChanged };
}
