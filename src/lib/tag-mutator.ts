import type { App, TFile } from 'obsidian';
import { coerceFrontmatterTags, mergeTags, normalizeNoteTag, normalizeNoteTags } from './note-metadata';
import { rewriteInlineTags, type TagRewrite } from './inline-tag-rewriter';
import { buildNoteTagState, type NoteTagState } from './note-tag-state';

/**
 * Light normalization for *lookup* values — match what's actually stored
 * in the index (just strip leading `#` and lowercase). The cleansing
 * normalizer would mangle invalid-but-existing tags like `802.1x` into
 * `802-1x` and the lookup would miss every file that uses the original.
 *
 * Use {@link normalizeNoteTag} for *destination* values (what we write
 * back to disk).
 */
function lookupKey(rawTag: string): string {
  return rawTag.trim().replace(/^#/, '').toLowerCase();
}

export type TagOp =
  | { kind: 'add'; tag: string }
  | { kind: 'remove'; tag: string }
  | { kind: 'rename'; from: string; to: string };

export type TagOpFilter = {
  /** Restrict to files under this folder path (prefix match). */
  folderPath?: string;
  /** Also rewrite `#tag` occurrences in the body. Default true. */
  includeInline?: boolean;
  /** When true, build the change list without writing. */
  dryRun?: boolean;
};

export type FileChange = {
  path: string;
  before: string[];
  after: string[];
};

export type FileError = {
  path: string;
  error: string;
};

export type TagMutationResult = {
  filesScanned: number;
  filesChanged: number;
  changes: FileChange[];
  errors: FileError[];
  dryRun: boolean;
};

/**
 * Narrow dependencies for the mutator. The production wiring in
 * {@link createTagMutator} adapts an Obsidian `App` into this shape. Tests
 * pass a hand-rolled mock so we never have to spin up a vault.
 */
export interface MutatorDeps {
  /** Read a file's frontmatter tags (raw value from metadata cache) and body. */
  readNote(file: TFile): Promise<{ frontmatterTags: unknown; content: string }>;
  /** Apply a frontmatter mutation. Must serialize sequentially per-file. */
  writeFrontmatter(file: TFile, mutate: (fm: Record<string, unknown>) => void): Promise<void>;
  /** Apply a body mutation. Must serialize sequentially per-file. */
  writeBody(file: TFile, mutate: (content: string) => string): Promise<void>;
  /** Enumerate markdown files, optionally constrained to a folder prefix. */
  listFiles(opts?: { folderPath?: string }): TFile[];
  /** Get files known to contain a tag (frontmatter or inline). */
  filesWithTag(tag: string): TFile[];
  /** Called BEFORE each write so the host can suppress its own modify event. */
  onSelfModify(path: string): void;
  /** Called after a batch completes so the host can invalidate affected tags. */
  onTagsAffected(tags: ReadonlySet<string>): void;
}

export class TagMutator {
  constructor(private deps: MutatorDeps) {}

  async renameTag(from: string, to: string, opts: TagOpFilter = {}): Promise<TagMutationResult> {
    // FROM uses light normalization so existing-but-invalid tags (e.g. the
    // legacy `802.1x` stored in older notes) can still be located in the
    // index. TO is fully cleansed so we never write an invalid form.
    const fromKey = lookupKey(from);
    const toNorm = normalizeNoteTag(to);
    if (fromKey === '' || toNorm === '') {
      return emptyResult(opts.dryRun ?? false);
    }
    if (fromKey === toNorm) {
      return emptyResult(opts.dryRun ?? false);
    }
    const files = this.filterByFolder(this.deps.filesWithTag(fromKey), opts.folderPath);
    return this.applyOps(files, [{ kind: 'rename', from: fromKey, to: toNorm }], opts);
  }

  async deleteTag(tag: string, opts: TagOpFilter = {}): Promise<TagMutationResult> {
    const key = lookupKey(tag);
    if (key === '') return emptyResult(opts.dryRun ?? false);
    const files = this.filterByFolder(this.deps.filesWithTag(key), opts.folderPath);
    return this.applyOps(files, [{ kind: 'remove', tag: key }], opts);
  }

  async untagFile(file: TFile, tag: string): Promise<boolean> {
    const result = await this.applyOps([file], [{ kind: 'remove', tag: lookupKey(tag) }], {
      includeInline: true,
    });
    return result.filesChanged === 1;
  }

  async bulkApply(files: TFile[], ops: TagOp[], opts: TagOpFilter = {}): Promise<TagMutationResult> {
    const normalizedOps = ops.map(normalizeOp).filter(isValidOp);
    if (normalizedOps.length === 0) return emptyResult(opts.dryRun ?? false);
    return this.applyOps(files, normalizedOps, opts);
  }

  /**
   * For each file: move inline `#tag` occurrences into the frontmatter
   * `tags:` array. If `tags` is provided, only those tags move; otherwise
   * every inline tag in each file moves.
   */
  async inlineToFrontmatter(files: TFile[], tags?: string[]): Promise<TagMutationResult> {
    const targetSet = tags ? new Set(normalizeNoteTags(tags)) : null;
    return this.applyPerFile(files, async (file) => {
      const state = await this.readState(file);
      const moving = new Set<string>();
      for (const occ of state.inline) {
        if (targetSet === null || targetSet.has(occ.tag)) moving.add(occ.tag);
      }
      if (moving.size === 0) return { changed: false, before: [...state.combined], after: [...state.combined] };
      const ops: TagOp[] = [];
      for (const tag of moving) {
        ops.push({ kind: 'remove', tag }); // strip from inline (frontmatter is fine; add will dedupe)
        ops.push({ kind: 'add', tag });
      }
      return this.applyFileOps(file, state, ops, { includeInline: true });
    });
  }

  /**
   * For each file: copy frontmatter tags into the body as `#tag` and remove
   * them from frontmatter.
   */
  async frontmatterToInline(files: TFile[], tags?: string[]): Promise<TagMutationResult> {
    const targetSet = tags ? new Set(normalizeNoteTags(tags)) : null;
    return this.applyPerFile(files, async (file) => {
      const state = await this.readState(file);
      const moving = state.frontmatter.filter((t) => targetSet === null || targetSet.has(t));
      if (moving.length === 0) return { changed: false, before: [...state.combined], after: [...state.combined] };

      const before = [...state.combined];
      this.deps.onSelfModify(file.path);
      await this.deps.writeFrontmatter(file, (fm) => {
        const current = coerceFrontmatterTags(fm.tags);
        fm.tags = current.filter((t) => !moving.includes(t));
      });

      // Append `#tag` for each moving tag at the end of the body, on a single line.
      this.deps.onSelfModify(file.path);
      await this.deps.writeBody(file, (content) => {
        const inlineLine = moving.map((t) => `#${t}`).join(' ');
        const newline = content.includes('\r\n') ? '\r\n' : '\n';
        return content.endsWith(newline) ? `${content}${inlineLine}${newline}` : `${content}${newline}${inlineLine}${newline}`;
      });

      const after = before.filter((t) => true); // unchanged set
      return { changed: true, before, after };
    });
  }

  // ----------------------- internal -----------------------

  private async applyOps(files: TFile[], ops: TagOp[], opts: TagOpFilter): Promise<TagMutationResult> {
    const includeInline = opts.includeInline ?? true;
    const dryRun = opts.dryRun ?? false;
    const changes: FileChange[] = [];
    const errors: FileError[] = [];
    const affected = new Set<string>();

    for (const op of ops) {
      if (op.kind === 'add') affected.add(op.tag);
      else if (op.kind === 'remove') affected.add(op.tag);
      else if (op.kind === 'rename') {
        affected.add(op.from);
        affected.add(op.to);
      }
    }

    for (const file of files) {
      try {
        const state = await this.readState(file);
        const result = dryRun
          ? this.previewFileOps(state, ops, includeInline)
          : await this.applyFileOps(file, state, ops, { includeInline });
        if (result.changed) {
          changes.push({ path: file.path, before: result.before, after: result.after });
        }
      } catch (err) {
        errors.push({ path: file.path, error: err instanceof Error ? err.message : String(err) });
      }
    }

    if (!dryRun && affected.size > 0) this.deps.onTagsAffected(affected);

    return {
      filesScanned: files.length,
      filesChanged: changes.length,
      changes,
      errors,
      dryRun,
    };
  }

  private async applyPerFile(
    files: TFile[],
    handler: (file: TFile) => Promise<{ changed: boolean; before: string[]; after: string[] }>,
  ): Promise<TagMutationResult> {
    const changes: FileChange[] = [];
    const errors: FileError[] = [];
    for (const file of files) {
      try {
        const r = await handler(file);
        if (r.changed) changes.push({ path: file.path, before: r.before, after: r.after });
      } catch (err) {
        errors.push({ path: file.path, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return {
      filesScanned: files.length,
      filesChanged: changes.length,
      changes,
      errors,
      dryRun: false,
    };
  }

  private async readState(file: TFile): Promise<NoteTagState> {
    const { frontmatterTags, content } = await this.deps.readNote(file);
    return buildNoteTagState(file.path, content, frontmatterTags);
  }

  private previewFileOps(state: NoteTagState, ops: TagOp[], includeInline: boolean): { changed: boolean; before: string[]; after: string[] } {
    const before = [...state.combined].sort();
    const fm = new Set(state.frontmatter);
    const inlineSet = new Set(state.inline.map((o) => o.tag));
    let changed = false;

    for (const op of ops) {
      if (op.kind === 'add') {
        if (!fm.has(op.tag) && !inlineSet.has(op.tag)) {
          fm.add(op.tag);
          changed = true;
        }
      } else if (op.kind === 'remove') {
        if (fm.has(op.tag)) {
          fm.delete(op.tag);
          changed = true;
        }
        if (includeInline && inlineSet.has(op.tag)) {
          inlineSet.delete(op.tag);
          changed = true;
        }
      } else if (op.kind === 'rename') {
        if (fm.has(op.from)) {
          fm.delete(op.from);
          fm.add(op.to);
          changed = true;
        }
        if (includeInline && inlineSet.has(op.from)) {
          inlineSet.delete(op.from);
          inlineSet.add(op.to);
          changed = true;
        }
      }
    }

    const after = [...new Set([...fm, ...inlineSet])].sort();
    return { changed, before, after };
  }

  private async applyFileOps(
    file: TFile,
    state: NoteTagState,
    ops: TagOp[],
    opts: { includeInline: boolean },
  ): Promise<{ changed: boolean; before: string[]; after: string[] }> {
    const before = [...state.combined].sort();
    const fmOps = ops.filter((op) => affectsFrontmatter(op, state));
    const inlineOps = opts.includeInline ? ops.filter((op) => affectsInline(op, state)) : [];

    let changed = false;

    if (fmOps.length > 0) {
      this.deps.onSelfModify(file.path);
      await this.deps.writeFrontmatter(file, (fm) => {
        const current = readRawTagList(fm.tags);
        const next = applyOpsToTagList(current, fmOps);
        fm.tags = next;
      });
      changed = true;
    }

    if (inlineOps.length > 0) {
      const rewrites = inlineRewritesForOps(inlineOps);
      if (rewrites.length > 0) {
        this.deps.onSelfModify(file.path);
        await this.deps.writeBody(file, (content) => {
          const result = rewriteInlineTags(content, rewrites);
          return result.changed ? result.content : content;
        });
        changed = true;
      }
    }

    // After applying, recompute the projected combined set without re-reading
    // the file (the on-disk state may not yet reflect writes when the host
    // batches metadata-cache updates).
    const after = computeProjectedTags(state, ops, opts.includeInline);
    return { changed, before, after };
  }

  private filterByFolder(files: TFile[], folderPath: string | undefined): TFile[] {
    if (!folderPath) return files;
    const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
    return files.filter((f) => f.path === folderPath || f.path.startsWith(prefix));
  }
}

// ----------------------- helpers -----------------------

function normalizeOp(op: TagOp): TagOp {
  if (op.kind === 'rename') {
    return { kind: 'rename', from: lookupKey(op.from), to: normalizeNoteTag(op.to) };
  }
  if (op.kind === 'remove') {
    // Lookup-side: match the stored form, including invalid tags so users
    // can still remove a legacy `802.1x`.
    return { kind: 'remove', tag: lookupKey(op.tag) };
  }
  // add: destination side, cleanse so we never write an invalid tag.
  return { kind: 'add', tag: normalizeNoteTag(op.tag) };
}

function isValidOp(op: TagOp): boolean {
  if (op.kind === 'rename') return op.from !== '' && op.to !== '' && op.from !== op.to;
  return op.tag !== '';
}

function affectsFrontmatter(op: TagOp, state: NoteTagState): boolean {
  const has = (t: string) => state.frontmatter.includes(t);
  if (op.kind === 'add') return !has(op.tag);
  if (op.kind === 'remove') return has(op.tag);
  return has(op.from); // rename
}

function affectsInline(op: TagOp, state: NoteTagState): boolean {
  const has = (t: string) => state.inline.some((o) => o.tag === t);
  if (op.kind === 'add') return false; // add never targets inline; goes to frontmatter
  if (op.kind === 'remove') return has(op.tag);
  return has(op.from); // rename
}

function applyOpsToTagList(list: string[], ops: TagOp[]): string[] {
  const set = new Set(list);
  for (const op of ops) {
    if (op.kind === 'add') set.add(op.tag);
    else if (op.kind === 'remove') set.delete(op.tag);
    else if (op.kind === 'rename') {
      if (set.has(op.from)) {
        set.delete(op.from);
        set.add(op.to);
      }
    }
  }
  // Preserve invalid-but-untouched tags verbatim (don't cleanse the rest of
  // the file just because one op fired). The op.to values were already
  // cleansed by the mutator. Untouched values stay as-stored.
  return [...set];
}

/**
 * Read frontmatter `tags` as stored: light strip + lowercase. Mirrors
 * {@link readStoredTags} in note-tag-state but inlined here so the
 * mutator's write path doesn't depend on the state module.
 */
function readRawTagList(value: unknown): string[] {
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

function inlineRewritesForOps(ops: TagOp[]): TagRewrite[] {
  const out: TagRewrite[] = [];
  for (const op of ops) {
    if (op.kind === 'remove') out.push({ from: op.tag, to: null });
    else if (op.kind === 'rename') out.push({ from: op.from, to: op.to });
    // add is not an inline op
  }
  return out;
}

function computeProjectedTags(state: NoteTagState, ops: TagOp[], includeInline: boolean): string[] {
  const fm = new Set(state.frontmatter);
  const inline = new Set(state.inline.map((o) => o.tag));
  for (const op of ops) {
    if (op.kind === 'add') fm.add(op.tag);
    else if (op.kind === 'remove') {
      fm.delete(op.tag);
      if (includeInline) inline.delete(op.tag);
    } else if (op.kind === 'rename') {
      if (fm.has(op.from)) {
        fm.delete(op.from);
        fm.add(op.to);
      }
      if (includeInline && inline.has(op.from)) {
        inline.delete(op.from);
        inline.add(op.to);
      }
    }
  }
  return [...new Set([...fm, ...inline])].sort();
}

function emptyResult(dryRun: boolean): TagMutationResult {
  return { filesScanned: 0, filesChanged: 0, changes: [], errors: [], dryRun };
}

// ----------------------- production wiring -----------------------

type AppWithFileManager = App & {
  fileManager: {
    processFrontMatter(file: TFile, fn: (fm: Record<string, unknown>) => void): Promise<void>;
  };
  metadataCache: {
    getFileCache(file: TFile): { frontmatter?: { tags?: unknown; tag?: unknown } } | null;
  };
};

export interface TagIndexAdapter {
  getFilesWithTag(tag: string): string[];
  invalidateTags(tags: ReadonlySet<string>): void;
}

/**
 * Bridge an Obsidian `App` and a vault index adapter into the narrow
 * {@link MutatorDeps} the {@link TagMutator} consumes.
 */
export function createTagMutator(
  app: App,
  index: TagIndexAdapter,
  onSelfModify: (path: string) => void,
): TagMutator {
  const a = app as AppWithFileManager;
  const deps: MutatorDeps = {
    async readNote(file) {
      const metadata = a.metadataCache.getFileCache(file);
      const tagsValue = metadata?.frontmatter?.tags ?? metadata?.frontmatter?.tag;
      let content = '';
      try {
        content = await app.vault.cachedRead(file);
      } catch {
        content = '';
      }
      return { frontmatterTags: tagsValue, content };
    },
    async writeFrontmatter(file, mutate) {
      await a.fileManager.processFrontMatter(file, mutate);
    },
    async writeBody(file, mutate) {
      await app.vault.process(file, mutate);
    },
    listFiles(opts) {
      const files = app.vault.getMarkdownFiles();
      if (!opts?.folderPath) return files;
      const folderPath = opts.folderPath;
      const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
      return files.filter((f) => f.path === folderPath || f.path.startsWith(prefix));
    },
    filesWithTag(tag) {
      const paths = index.getFilesWithTag(tag);
      const result: TFile[] = [];
      for (const p of paths) {
        const file = app.vault.getAbstractFileByPath(p);
        if (file && 'extension' in file && (file as TFile).extension === 'md') result.push(file as TFile);
      }
      return result;
    },
    onSelfModify,
    onTagsAffected(tags) {
      index.invalidateTags(tags);
    },
  };
  return new TagMutator(deps);
}

export { mergeTags }; // re-export so callers needing add-only flow don't reach into note-metadata
