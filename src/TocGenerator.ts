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
    private settings: KBManagerSettings
  ) {}

  async run(): Promise<void> {
    await this.runPerNoteToc();
    await this.runSectionIndex();
  }

  async runPerNoteToc(): Promise<void> {
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (this.shouldSkipFile(file.path) || this.isKbManaged(file)) continue;
      const body = buildPerNoteTocBody(file.path, this.index.getHeadings(file.path));
      await this.app.vault.process(file, content => {
        if (!isWriteSafe(content, 'toc')) return content;
        return replaceDelimitedSection(content, 'toc', body);
      });
    }
  }

  async runSectionIndex(): Promise<void> {
    for (const folderPath of this.index.getAllFolders()) {
      if (isExcluded(folderPath, this.settings.excludedPaths)) continue;
      const notes = this.getIndexNotes(folderPath);
      if (notes.length === 0) continue;
      await this.writeIndex(folderPath, buildIndexFile({ folderPath, notes }));
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
    const path = normalizePath(folderPath === '' ? INDEX_BASENAME : `${folderPath}/${INDEX_BASENAME}`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      if (!this.isKbManaged(existing)) {
        console.warn(`KB Manager: skipping ${path} - file lacks kb-managed frontmatter`);
        return;
      }
      await this.app.vault.process(existing, () => content);
      return;
    }
    await this.app.vault.create(path, content);
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
