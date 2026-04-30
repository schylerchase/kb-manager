import { TFile, setIcon } from 'obsidian';
import type { FileRecord } from './vault-index-types';
import { isFileInFolderScope } from './sidebar-data';

export type AddRowAction = (
  row: HTMLElement,
  cls: string,
  icon: string,
  label: string,
  activate: () => void
) => void;

interface NoteActionPlugin {
  createNoteFromPrompt(folderPath: string, tags?: string[]): void;
  addTagsToCurrentNote(tags: string[]): Promise<void>;
  promptAddTagsToNote(filePath: string): void;
}

interface NeedsTagsRenderOptions {
  isExpanded: boolean;
  createTreeRow(parent: HTMLElement, depth: number, cls: string, key?: string): HTMLElement;
  addTwirl(row: HTMLElement, hasChildren: boolean, isExpanded: boolean, toggle: () => void): void;
  addRowAction: AddRowAction;
  addKeyboardActivation(element: HTMLElement, activate: () => void): void;
  toggle(): void;
  openFile(filePath: string): void;
  promptAddTags(filePath: string): void;
}

export function addNewNoteAction(
  row: HTMLElement,
  addRowAction: AddRowAction,
  plugin: NoteActionPlugin,
  folderPath: string,
  tags: string[]
): void {
  addRowAction(row, 'kb-folder-new', 'file-plus', 'New note here', () => {
    plugin.createNoteFromPrompt(folderPath, tags);
  });
}

export function addTagNoteActions(
  row: HTMLElement,
  addRowAction: AddRowAction,
  plugin: NoteActionPlugin,
  folderPath: string,
  tag: string
): void {
  addRowAction(row, 'kb-tag-add', 'tag', `Add #${tag} to current note`, () => {
    plugin.addTagsToCurrentNote([tag]).catch(err => console.error('KB Manager: add tag failed', err));
  });
  addRowAction(row, 'kb-tag-new-note', 'file-plus', `New note tagged #${tag}`, () => {
    plugin.createNoteFromPrompt(folderPath, [tag]);
  });
}

export function getFilesNeedingTags(
  files: FileRecord[],
  folderPath: string,
  resolveFile: (filePath: string) => TFile | null,
  isKbManaged: (file: TFile) => boolean
): Array<{ path: string; basename: string }> {
  return files
    .filter(file => file.tags.length === 0 && isFileInFolderScope(file.path, folderPath))
    .flatMap(file => buildNeedsTagsEntry(file.path, resolveFile, isKbManaged))
    .sort((a, b) => a.basename.toLowerCase().localeCompare(b.basename.toLowerCase()));
}

export function renderNeedsTags(
  parent: HTMLElement,
  files: Array<{ path: string; basename: string }>,
  options: NeedsTagsRenderOptions
): void {
  const row = options.createTreeRow(parent, 0, 'kb-row-needs-tags', 'needs-tags');
  options.addTwirl(row, true, options.isExpanded, options.toggle);
  row.createSpan({ cls: 'kb-label-file', text: 'Needs tags' });
  row.createSpan({ cls: 'kb-tag-count', text: String(files.length) });
  row.addEventListener('click', options.toggle);
  options.addKeyboardActivation(row, options.toggle);
  if (!options.isExpanded) return;
  for (const file of files) renderNeedsTagsFile(parent, file, options);
}

function renderNeedsTagsFile(
  parent: HTMLElement,
  file: { path: string; basename: string },
  options: NeedsTagsRenderOptions
): void {
  const row = options.createTreeRow(parent, 1, 'kb-row-file kb-row-needs-tags-file');
  const icon = row.createSpan({ cls: 'kb-file-icon' });
  setIcon(icon, 'file-text');
  row.createSpan({ cls: 'kb-label-file', text: file.basename });
  options.addRowAction(row, 'kb-metadata-add-tag', 'tag', `Add tags to ${file.basename}`, () => {
    options.promptAddTags(file.path);
  });
  row.addEventListener('click', () => options.openFile(file.path));
}

function buildNeedsTagsEntry(
  filePath: string,
  resolveFile: (filePath: string) => TFile | null,
  isKbManaged: (file: TFile) => boolean
): Array<{ path: string; basename: string }> {
  const file = resolveFile(filePath);
  if (!file || isKbManaged(file)) return [];
  return [{ path: filePath, basename: file.basename }];
}
