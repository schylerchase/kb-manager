import { App, TFile, normalizePath } from 'obsidian';
import VaultIndex from './VaultIndex';
import { KBManagerSettings } from './settings';
import { buildIndexFile, buildPerNoteTocBody, IndexBuildInput } from './lib/toc-builder';
import { isWriteSafe, replaceDelimitedSection } from './lib/delimiter';
import { isExcluded } from './lib/exclusions';

const INDEX_BASENAME = 'INDEX.md';
const MOC_BASENAME = 'MOC.md';

export default class TocGenerator {
  constructor(
    private app: App,
    private index: VaultIndex,
    private settings: KBManagerSettings,
    private isUnloaded: () => boolean = () => false,
    private onSelfModify: (path: string) => void = () => {},
  ) {}

  async run(): Promise<void> {
    await this.runPerNoteToc();
    if (this.isUnloaded()) return;
    await this.runSectionIndex();
    if (this.isUnloaded()) return;
    await this.removeOrphanedIndexFiles();
  }

  async runForPaths(filePaths: ReadonlyArray<string>): Promise<void> {
    for (const filePath of filePaths) {
      if (this.isUnloaded()) return;
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) continue;
      if (this.shouldSkipFile(file.path) || this.isKbManaged(file)) continue;
      await this.updatePerNoteToc(file);
    }
    if (this.isUnloaded()) return;
    for (const folderPath of this.affectedFolders(filePaths)) {
      if (this.isUnloaded()) return;
      await this.syncSectionIndex(folderPath);
    }
  }

  private affectedFolders(filePaths: ReadonlyArray<string>): string[] {
    const folders = new Set<string>();
    for (const filePath of filePaths) folders.add(this.folderPathFromPath(filePath));
    return [...folders].sort();
  }

  private folderPathFromPath(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
  }

  /**
   * Full-vault orphan sweep for INDEX.md: catches managed indexes left in
   * folders that became empty / excluded / lost all eligible notes. Only
   * deletes files we own (kb-managed: true AND kb-type: index).
   */
  async removeOrphanedIndexFiles(): Promise<void> {
    const indexedFolders = new Set(this.index.getAllFolders());
    const indexFiles = this.app.vault
      .getMarkdownFiles()
      .filter(f => f.name === INDEX_BASENAME);
    for (const file of indexFiles) {
      if (this.isUnloaded()) return;
      if (!this.isManagedIndex(file)) continue;
      const folderPath = this.folderPathOf(file);
      const indexed = indexedFolders.has(folderPath);
      const excluded = isExcluded(folderPath, this.settings.excludedPaths);
      const hasNotes = indexed && this.getIndexNotes(folderPath).length > 0;
      if (indexed && !excluded && hasNotes) continue;
      try {
        this.onSelfModify(file.path);
        await this.app.vault.trash(file, true);
      } catch (err) {
        console.warn(`KB Manager: failed to trash orphan INDEX ${file.path}`, err);
      }
    }
  }

  private folderPathOf(file: TFile): string {
    const parentPath = file.parent?.path ?? '';
    return parentPath === '/' ? '' : parentPath;
  }

  private isManagedIndex(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    return frontmatter?.['kb-managed'] === true && frontmatter?.['kb-type'] === 'index';
  }

  async runPerNoteToc(): Promise<void> {
    // Iterate the index, not vault.getMarkdownFiles(), so excluded paths and
    // index consistency are honored (matches MocGenerator behavior).
    for (const record of this.index.getAllFiles()) {
      if (this.isUnloaded()) return;
      const file = this.app.vault.getAbstractFileByPath(record.path);
      if (!(file instanceof TFile)) continue;
      if (this.shouldSkipFile(file.path) || this.isKbManaged(file)) continue;
      await this.updatePerNoteToc(file);
    }
  }

  async runSectionIndex(): Promise<void> {
    for (const folderPath of this.index.getAllFolders()) {
      if (this.isUnloaded()) return;
      await this.syncSectionIndex(folderPath);
    }
  }

  private async updatePerNoteToc(file: TFile): Promise<void> {
    const body = buildPerNoteTocBody(file.path, this.index.getHeadings(file.path));
    await this.app.vault.process(file, content => {
      if (!isWriteSafe(content, 'toc')) return content;
      const next = replaceDelimitedSection(content, 'toc', body);
      if (next !== content) this.onSelfModify(file.path);
      return next;
    });
  }

  private async syncSectionIndex(folderPath: string): Promise<void> {
    if (isExcluded(folderPath, this.settings.excludedPaths)) {
      await this.removeIndexForFolder(folderPath);
      return;
    }
    const notes = this.getIndexNotes(folderPath);
    if (notes.length === 0) {
      await this.removeIndexForFolder(folderPath);
      return;
    }
    await this.writeIndex(folderPath, buildIndexFile({ folderPath, notes }));
  }

  private async removeIndexForFolder(folderPath: string): Promise<void> {
    const path = this.indexPathForFolder(folderPath);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (!(existing instanceof TFile) || !this.isManagedIndex(existing)) return;
    try {
      this.onSelfModify(existing.path);
      await this.app.vault.trash(existing, true);
    } catch (err) {
      console.warn(`KB Manager: failed to trash stale INDEX ${existing.path}`, err);
    }
  }

  private getIndexNotes(folderPath: string): IndexBuildInput['notes'] {
    return this.index
      .getFilesInFolder(folderPath)
      .filter(record => !this.shouldSkipFile(record.path))
      .filter(record => !this.isManagedPath(record.path))
      .map(record => ({ filePath: record.path, headings: this.index.getHeadings(record.path) }))
      .filter(note => note.headings.length > 0);
  }

  private async writeIndex(folderPath: string, content: string): Promise<void> {
    const path = this.indexPathForFolder(folderPath);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      if (!this.isKbManaged(existing)) {
        console.warn(`KB Manager: skipping ${path} - file lacks kb-managed frontmatter`);
        return;
      }
      const current = await this.app.vault.cachedRead(existing);
      if (current === content) return;
      this.onSelfModify(existing.path);
      await this.app.vault.process(existing, () => content);
      return;
    }
    this.onSelfModify(path);
    await this.app.vault.create(path, content);
  }

  private indexPathForFolder(folderPath: string): string {
    return normalizePath(folderPath === '' ? INDEX_BASENAME : `${folderPath}/${INDEX_BASENAME}`);
  }

  private shouldSkipFile(filePath: string): boolean {
    if (isExcluded(filePath, this.settings.excludedPaths)) return true;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return true;
    return file.name === MOC_BASENAME || file.name === INDEX_BASENAME;
  }

  private isManagedPath(filePath: string): boolean {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    return file instanceof TFile && this.isKbManaged(file);
  }

  private isKbManaged(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.['kb-managed'] === true;
  }
}
