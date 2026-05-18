import type { TFile } from 'obsidian';
import { normalizeNoteTag } from '../lib/note-metadata';
import type { TagMutator, TagOp } from '../lib/tag-mutator';

export type BulkSelector =
  | { kind: 'folder'; path: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'paths'; paths: string[] };

export type BulkOpInput =
  | { kind: 'add'; tag: string }
  | { kind: 'remove'; tag: string }
  | { kind: 'rename'; from: string; to: string };

export type BulkOutcome =
  | { ok: true; filesScanned: number; filesChanged: number; errors: number }
  | { ok: false; reason: 'no-files' | 'no-ops'; message: string };

export interface BulkHost {
  mutator: TagMutator;
  resolveSelector(selector: BulkSelector): TFile[];
}

export async function runBulkTagOps(host: BulkHost, selector: BulkSelector, inputs: BulkOpInput[], dryRun = false): Promise<BulkOutcome> {
  // Validate ops first so callers get a more specific error when both
  // inputs and selector are empty.
  const ops: TagOp[] = inputs.map(normalizeInput).filter(isValidOp);
  if (ops.length === 0) return { ok: false, reason: 'no-ops', message: 'No valid operations.' };

  const files = host.resolveSelector(selector);
  if (files.length === 0) return { ok: false, reason: 'no-files', message: 'Selector matched no files.' };

  const result = await host.mutator.bulkApply(files, ops, { dryRun });
  return {
    ok: true,
    filesScanned: result.filesScanned,
    filesChanged: result.filesChanged,
    errors: result.errors.length,
  };
}

function normalizeInput(input: BulkOpInput): TagOp {
  if (input.kind === 'rename') {
    return { kind: 'rename', from: normalizeNoteTag(input.from), to: normalizeNoteTag(input.to) };
  }
  return { ...input, tag: normalizeNoteTag(input.tag) };
}

function isValidOp(op: TagOp): boolean {
  if (op.kind === 'rename') return op.from !== '' && op.to !== '' && op.from !== op.to;
  return op.tag !== '';
}
