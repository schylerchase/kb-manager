import { App, Modal, Notice, Plugin, Setting, TFile, TFolder } from 'obsidian';
import TagManager from './TagManager';
import VaultIndex from './VaultIndex';
import {
  buildNewNoteContent,
  getAvailableNotePath,
  initializeFrontmatter,
  mergeTags,
  type NewNoteKind,
  normalizeNoteFolderPath,
  normalizeNoteTags,
  normalizeProjectTagInput,
  parseNoteTags,
  sanitizeNoteTitle,
} from './lib/note-metadata';
import { isExcluded } from './lib/exclusions';

export default class NoteCapture {
  constructor(
    private app: App,
    private index: VaultIndex,
    private tagManager: TagManager,
    /**
     * Funneled rebuild trigger. Goes through the plugin's runWithLock so we
     * never race the scheduler tick or another generator pass.
     */
    private requestRebuild: () => Promise<void>,
  ) {}

  addCommands(plugin: Plugin): void {
    plugin.addCommand({
      id: 'new-note-current-folder',
      name: 'New KB note here',
      callback: () => { this.createNoteFromPrompt(this.getActiveFolderPath()); },
    });
    plugin.addCommand({
      id: 'new-moc-note-here',
      name: 'New MOC note here',
      callback: () => { this.createNoteFromPrompt(this.getActiveFolderPath(), [], 'moc'); },
    });
    plugin.addCommand({
      id: 'new-toc-note-here',
      name: 'New TOC note here',
      callback: () => { this.createNoteFromPrompt(this.getActiveFolderPath(), [], 'toc'); },
    });
    plugin.addCommand({
      id: 'add-tags-current-note',
      name: 'Add tags to current note',
      callback: () => { this.promptAddTagsToCurrentNote(); },
    });
    plugin.addCommand({
      id: 'initialize-current-note',
      name: 'Initialize properties for current note',
      callback: () => {
        this.initializeCurrentNote().catch(err => this.reportError('initialize properties', err));
      },
    });
  }

  createNoteFromPrompt(folderPath: string, tags: string[] = [], kind: NewNoteKind = 'kb'): void {
    new KBNoteTitleModal(this.app, folderPath, tags, kind, this.getProjectTags(), request => {
      this.createNote(request.folderPath, request.title, request.tags, request.kind).catch(err => this.reportError('create note', err));
    }).open();
  }

  promptAddTagsToCurrentNote(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('KB Manager: no active note');
      return;
    }
    this.openTagInput(file);
  }

  promptAddTagsToNote(filePath: string): void {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      new Notice('KB Manager: note not found');
      return;
    }
    this.openTagInput(file);
  }

  async addTagsToCurrentNote(tags: string[]): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('KB Manager: no active note');
      return;
    }
    await this.addTagsToFile(file, tags);
  }

  async initializeCurrentNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('KB Manager: no active note');
      return;
    }
    await this.initializeFileProperties(file, true);
  }

  async initializeCreatedNote(
    file: TFile,
    isEnabled: boolean,
    excludedPaths: string[]
  ): Promise<void> {
    if (!isEnabled || !this.canInitializeCreatedFile(file, excludedPaths)) return;
    await this.initializeFileProperties(file, false);
  }

  private openTagInput(file: TFile): void {
    new KBTagInputModal(this.app, file.basename, this.tagManager.getAllTags(), tags => {
      this.addTagsToFile(file, tags).catch(err => this.reportError('add tags', err));
    }).open();
  }

  private async createNote(folderPath: string, title: string, tags: string[], kind: NewNoteKind): Promise<void> {
    const normalizedFolder = normalizeNoteFolderPath(folderPath);
    await this.ensureFolderPath(normalizedFolder);
    const path = getAvailableNotePath(normalizedFolder, title, p => this.app.vault.getAbstractFileByPath(p) !== null);
    const file = await this.app.vault.create(path, buildNewNoteContent(title, tags, new Date(), kind));
    this.index.markDirty(file.path);
    await this.requestRebuild();
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(`KB Manager: created ${this.kindLabel(kind)} ${sanitizeNoteTitle(title)}`);
  }

  private async addTagsToFile(file: TFile, tags: string[]): Promise<void> {
    const additions = normalizeNoteTags(tags);
    if (additions.length === 0) return;
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      frontmatter.tags = mergeTags(frontmatter.tags, additions);
    });
    this.index.markDirty(file.path);
    await this.requestRebuild();
    new Notice(`KB Manager: added ${this.formatTagList(additions)}`);
  }

  private async initializeFileProperties(file: TFile, shouldNotify: boolean): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      initializeFrontmatter(frontmatter, new Date());
    });
    this.index.markDirty(file.path);
    await this.requestRebuild();
    if (shouldNotify) new Notice('KB Manager: properties initialized');
  }

  private canInitializeCreatedFile(file: TFile, excludedPaths: string[]): boolean {
    if (file.extension !== 'md' || isExcluded(file.path, excludedPaths)) return false;
    if (file.basename === 'MOC' || file.basename === 'INDEX') return false;
    return true;
  }

  private getActiveFolderPath(): string {
    const file = this.app.workspace.getActiveFile();
    if (!file) return '';
    const lastSlash = file.path.lastIndexOf('/');
    return lastSlash === -1 ? '' : file.path.slice(0, lastSlash);
  }

  private formatTagList(tags: string[]): string {
    return tags.map(tag => `#${tag}`).join(', ');
  }

  private getProjectTags(): string[] {
    const tags = new Set<string>();
    for (const file of this.index.getAllFiles()) {
      for (const tag of file.tags) {
        if (tag === 'project' || tag.startsWith('project/')) tags.add(tag);
      }
    }
    return [...tags].sort();
  }

  private kindLabel(kind: NewNoteKind): string {
    if (kind === 'moc') return 'MOC';
    if (kind === 'toc') return 'TOC';
    return 'KB note';
  }

  private async ensureFolderPath(folderPath: string): Promise<void> {
    if (folderPath === '') return;
    const parts = folderPath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current === '' ? part : `${current}/${part}`;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing !== null) throw new Error(`Path exists and is not a folder: ${current}`);
      try {
        await this.app.vault.createFolder(current);
      } catch (err) {
        // Tolerate the TOCTOU race where two concurrent createNote calls both
        // pass the existence check and both try to create. Only re-throw if
        // the folder genuinely still does not exist after the failure.
        const stillExists = this.app.vault.getAbstractFileByPath(current);
        if (!(stillExists instanceof TFolder)) throw err;
      }
    }
  }

  private reportError(action: string, err: unknown): void {
    console.error(`KB Manager: ${action} failed`, err);
    new Notice(`KB Manager: could not ${action} - see console`);
  }
}

type KBNoteCreateRequest = {
  title: string;
  folderPath: string;
  tags: string[];
  kind: NewNoteKind;
};

type KBNoteDraft = {
  title: string;
  folderPath: string;
  projectTag: string;
  tagInput: string;
  kind: NewNoteKind;
};

class KBNoteTitleModal extends Modal {
  constructor(
    app: App,
    private folderPath: string,
    private tags: string[],
    private kind: NewNoteKind,
    private projectTags: string[],
    private onSubmit: (request: KBNoteCreateRequest) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const draft: KBNoteDraft = {
      title: '',
      folderPath: this.folderPath,
      projectTag: this.initialProjectTag(),
      tagInput: this.initialOtherTags().join(', '),
      kind: this.kind,
    };
    this.titleEl.setText('New KB note');
    this.contentEl.empty();
    this.contentEl.addClass('kb-note-create-modal');
    const projectListId = this.createProjectDatalist();
    new Setting(this.contentEl)
      .setName('Title')
      .addText(text => {
        text.setPlaceholder('MCP Goals').onChange(value => { draft.title = value; });
        text.inputEl.addClass('kb-note-create-input');
        text.inputEl.addEventListener('keydown', event => this.handleEnter(event, draft));
      });
    new Setting(this.contentEl)
      .setName('Category')
      .setDesc('Vault-relative folder/category path. Leave blank for vault root.')
      .addText(text => {
        text.setPlaceholder('Projects/MCP').setValue(draft.folderPath).onChange(value => { draft.folderPath = this.cleanFolderPath(value); });
        text.inputEl.addClass('kb-note-create-input');
        text.inputEl.addEventListener('keydown', event => this.handleEnter(event, draft));
      });
    new Setting(this.contentEl)
      .setName('Project')
      .setDesc('Optional project tag. "Halo MCP" becomes #project/halo-mcp.')
      .addText(text => {
        text.setPlaceholder('project/halo-mcp').setValue(draft.projectTag).onChange(value => { draft.projectTag = value; });
        text.inputEl.addClass('kb-note-create-input');
        if (projectListId) text.inputEl.setAttribute('list', projectListId);
        text.inputEl.addEventListener('keydown', event => this.handleEnter(event, draft));
      });
    new Setting(this.contentEl)
      .setName('Tags')
      .setDesc('Optional extra tags, separated by commas.')
      .addText(text => {
        text.setPlaceholder('reference, vendor').setValue(draft.tagInput).onChange(value => { draft.tagInput = value; });
        text.inputEl.addClass('kb-note-create-input');
        text.inputEl.addEventListener('keydown', event => this.handleEnter(event, draft));
      });
    new Setting(this.contentEl)
      .setName('Type')
      .addDropdown(dropdown => {
        dropdown
          .addOption('kb', 'KB note')
          .addOption('moc', 'MOC note')
          .addOption('toc', 'TOC note')
          .setValue(draft.kind)
          .onChange(value => { draft.kind = value as NewNoteKind; });
      });
    new Setting(this.contentEl).addButton(button =>
      button.setButtonText('Create').setCta().onClick(() => this.submit(draft))
    );
  }

  private handleEnter(event: KeyboardEvent, draft: KBNoteDraft): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.submit(draft);
  }

  private cleanFolderPath(folderPath: string): string {
    return normalizeNoteFolderPath(folderPath);
  }

  private submit(draft: KBNoteDraft): void {
    const projectTag = normalizeProjectTagInput(draft.projectTag);
    const tags = normalizeNoteTags([...this.tags, projectTag, ...parseNoteTags(draft.tagInput)]);
    this.close();
    this.onSubmit({
      title: sanitizeNoteTitle(draft.title),
      folderPath: this.cleanFolderPath(draft.folderPath),
      tags,
      kind: draft.kind,
    });
  }

  private initialProjectTag(): string {
    return this.tags.find(tag => tag === 'project' || tag.startsWith('project/')) ?? '';
  }

  private initialOtherTags(): string[] {
    return this.tags.filter(tag => tag !== 'project' && !tag.startsWith('project/'));
  }

  private createProjectDatalist(): string {
    if (this.projectTags.length === 0) return '';
    const id = `kb-project-tags-${Date.now().toString(36)}`;
    const list = this.contentEl.createEl('datalist');
    list.id = id;
    for (const tag of this.projectTags) list.createEl('option', { value: tag });
    return id;
  }
}

class KBTagInputModal extends Modal {
  constructor(
    app: App,
    private fileName: string,
    private existingTags: string[],
    private onSubmit: (tags: string[]) => void
  ) {
    super(app);
  }

  onOpen(): void {
    let value = '';
    this.titleEl.setText(`Add tags to ${this.fileName}`);
    this.contentEl.empty();
    new Setting(this.contentEl)
      .setName('Tags')
      .addText(text => {
        text.setPlaceholder(this.tagPlaceholder()).onChange(next => { value = next; });
        text.inputEl.addEventListener('keydown', event => this.handleEnter(event, value));
      });
    new Setting(this.contentEl).addButton(button =>
      button.setButtonText('Add').setCta().onClick(() => this.submit(value))
    );
  }

  private tagPlaceholder(): string {
    return this.existingTags.slice(0, 3).join(', ') || 'project/mcp, reference';
  }

  private handleEnter(event: KeyboardEvent, value: string): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.submit(value);
  }

  private submit(value: string): void {
    const tags = parseNoteTags(value);
    if (tags.length === 0) {
      new Notice('KB Manager: enter at least one tag');
      return;
    }
    this.close();
    this.onSubmit(tags);
  }
}
