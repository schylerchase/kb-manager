import { App, Modal, Notice, Plugin, Setting, TFile } from 'obsidian';
import TagManager from './TagManager';
import VaultIndex from './VaultIndex';
import {
  buildNewNoteContent,
  getAvailableNotePath,
  initializeFrontmatter,
  mergeTags,
  normalizeNoteTags,
  parseNoteTags,
  sanitizeNoteTitle,
} from './lib/note-metadata';
import { isExcluded } from './lib/exclusions';

export default class NoteCapture {
  constructor(
    private app: App,
    private index: VaultIndex,
    private tagManager: TagManager
  ) {}

  addCommands(plugin: Plugin): void {
    plugin.addCommand({
      id: 'kb-manager-new-note-current-folder',
      name: 'KB Manager: New note in current folder',
      callback: () => { this.createNoteFromPrompt(this.getActiveFolderPath()); },
    });
    plugin.addCommand({
      id: 'kb-manager-add-tags-current-note',
      name: 'KB Manager: Add tags to current note',
      callback: () => { this.promptAddTagsToCurrentNote(); },
    });
    plugin.addCommand({
      id: 'kb-manager-initialize-current-note',
      name: 'KB Manager: Initialize properties for current note',
      callback: () => {
        this.initializeCurrentNote().catch(err => this.reportError('initialize properties', err));
      },
    });
  }

  createNoteFromPrompt(folderPath: string, tags: string[] = []): void {
    new KBNoteTitleModal(this.app, folderPath, tags, title => {
      this.createNote(folderPath, title, tags).catch(err => this.reportError('create note', err));
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

  private async createNote(folderPath: string, title: string, tags: string[]): Promise<void> {
    const path = getAvailableNotePath(folderPath, title, p => this.app.vault.getAbstractFileByPath(p) !== null);
    const file = await this.app.vault.create(path, buildNewNoteContent(title, tags, new Date()));
    this.index.markDirty(file.path);
    await this.index.rebuildDirty();
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(`KB Manager: created ${sanitizeNoteTitle(title)}`);
  }

  private async addTagsToFile(file: TFile, tags: string[]): Promise<void> {
    const additions = normalizeNoteTags(tags);
    if (additions.length === 0) return;
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      frontmatter.tags = mergeTags(frontmatter.tags, additions);
    });
    this.index.markDirty(file.path);
    await this.index.rebuildDirty();
    new Notice(`KB Manager: added ${this.formatTagList(additions)}`);
  }

  private async initializeFileProperties(file: TFile, shouldNotify: boolean): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, frontmatter => {
      initializeFrontmatter(frontmatter, new Date());
    });
    this.index.markDirty(file.path);
    await this.index.rebuildDirty();
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

  private reportError(action: string, err: unknown): void {
    console.error(`KB Manager: ${action} failed`, err);
    new Notice(`KB Manager: could not ${action} - see console`);
  }
}

class KBNoteTitleModal extends Modal {
  constructor(
    app: App,
    private folderPath: string,
    private tags: string[],
    private onSubmit: (title: string) => void
  ) {
    super(app);
  }

  onOpen(): void {
    let title = '';
    this.titleEl.setText('New KB note');
    this.contentEl.empty();
    new Setting(this.contentEl)
      .setName(this.folderLabel())
      .addText(text => {
        text.setPlaceholder('MCP Goals').onChange(value => { title = value; });
        text.inputEl.addEventListener('keydown', event => this.handleEnter(event, title));
      });
    new Setting(this.contentEl).addButton(button =>
      button.setButtonText('Create').setCta().onClick(() => this.submit(title))
    );
  }

  private folderLabel(): string {
    const folder = this.folderPath === '' ? 'Vault root' : this.folderPath;
    const tags = this.tags.length === 0 ? '' : ` | ${this.formatTags()}`;
    return `${folder}${tags}`;
  }

  private formatTags(): string {
    return this.tags.map(tag => `#${tag}`).join(', ');
  }

  private handleEnter(event: KeyboardEvent, title: string): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.submit(title);
  }

  private submit(title: string): void {
    this.close();
    this.onSubmit(sanitizeNoteTitle(title));
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
