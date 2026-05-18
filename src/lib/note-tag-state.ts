import type { App, TFile } from 'obsidian';
import { findInlineTags } from './inline-tag-rewriter';

/**
 * Light tag normalization for *reading* stored values. We intentionally
 * don't run the full cleansing pass here — invalid-but-existing tags
 * (e.g. `802.1x` from legacy notes) must surface to the UI and the mutator
 * so users can rename or delete them. Cleansing happens at write time.
 */
function readStoredTags(value: unknown): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '').toLowerCase();
    if (tag !== '' && !out.includes(tag)) out.push(tag);
  };
  if (Array.isArray(value)) {
    for (const v of value) if (typeof v === 'string') push(v);
  } else if (typeof value === 'string') {
    const separator = value.includes(',') ? /,+/ : /\s+/;
    for (const part of value.split(separator)) push(part);
  }
  return out;
}

export type InlineTagOccurrence = {
  tag: string;
  line: number;
  col: number;
};

export type NoteTagState = {
  path: string;
  frontmatter: string[];
  inline: InlineTagOccurrence[];
  combined: Set<string>;
};

/**
 * Pure: given a note's markdown body and its raw frontmatter `tags` value
 * (whatever shape Obsidian's metadata cache parsed it into), produce the
 * unified tag state with provenance.
 *
 * Use this in tests; use {@link readNoteTagState} from production code
 * to bring the Obsidian app dependencies in.
 */
export function buildNoteTagState(
  path: string,
  content: string,
  frontmatterTags: unknown,
): NoteTagState {
  const frontmatter = readStoredTags(frontmatterTags);
  const inline = findInlineTags(content);
  const combined = new Set<string>(frontmatter);
  for (const occ of inline) combined.add(occ.tag);
  return { path, frontmatter, inline, combined };
}

type AppWithMetadata = App & {
  metadataCache: {
    getFileCache(file: TFile): { frontmatter?: { tags?: unknown; tag?: unknown } } | null;
  };
};

/**
 * Read a note from disk via Obsidian APIs and produce the unified tag
 * state. Reads frontmatter from the metadata cache (already parsed by
 * Obsidian, fast) and inline tags by scanning the file body.
 *
 * Returns an empty state if the file body cannot be read.
 */
export async function readNoteTagState(app: App, file: TFile): Promise<NoteTagState> {
  const metadata = (app as AppWithMetadata).metadataCache.getFileCache(file);
  // Tasks plugin and friends sometimes use `tag` (singular). Combine both
  // shapes so the read state matches what mutations need to consider.
  const fmTags = mergeRawTagValues(metadata?.frontmatter?.tags, metadata?.frontmatter?.tag);
  let content = '';
  try {
    content = await app.vault.cachedRead(file);
  } catch {
    // Leave content empty so we still surface the frontmatter side.
  }
  return buildNoteTagState(file.path, content, fmTags);
}

function mergeRawTagValues(primary: unknown, secondary: unknown): unknown {
  if (primary === undefined && secondary === undefined) return undefined;
  if (primary === undefined) return secondary;
  if (secondary === undefined) return primary;
  // Both present (rare). Read each light-side and union for a flat list
  // that readStoredTags will normalize again.
  return [...readStoredTags(primary), ...readStoredTags(secondary)];
}

/**
 * Returns true when a tag appears anywhere in the note. Convenient guard
 * for the "untag from current note" button which should disable itself
 * when the tag isn't present.
 */
export function noteHasTag(state: NoteTagState, tag: string): boolean {
  return state.combined.has(tag);
}

/**
 * Returns the locations where a tag lives. Used by remove operations to
 * decide whether to touch frontmatter, body, or both.
 */
export function locateTag(state: NoteTagState, tag: string): { inFrontmatter: boolean; inlineCount: number } {
  const inFrontmatter = state.frontmatter.includes(tag);
  let inlineCount = 0;
  for (const occ of state.inline) if (occ.tag === tag) inlineCount += 1;
  return { inFrontmatter, inlineCount };
}
