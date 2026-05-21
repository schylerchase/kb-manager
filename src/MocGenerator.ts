import { App, TFile, normalizePath } from 'obsidian';
import VaultIndex from './VaultIndex';
import { KBManagerSettings } from './settings';
import { buildMocBody, buildDedicatedMocFile, MocBuildInput } from './lib/moc-builder';
import { buildDelimiter, isWriteSafe, replaceDelimitedSection } from './lib/delimiter';
import { isExcluded } from './lib/exclusions';
import { buildTagTree } from './lib/tag-utils';

const MOC_BASENAME = 'MOC.md';

export default class MocGenerator {
  constructor(
    private app: App,
    private index: VaultIndex,
    private settings: KBManagerSettings,
    /** Bails out between folder iterations once the plugin is disabled. */
    private isUnloaded: () => boolean = () => false,
    private onSelfModify: (path: string) => void = () => {},
  ) {}

  async run(): Promise<void> {
    for (const folderPath of this.index.getAllFolders()) {
      if (this.isUnloaded()) return;
      await this.syncFolder(folderPath);
    }
    // Full-vault orphan sweep: catches MOC.md left behind in folders that
    // became empty, became excluded, or had their format flipped to inline.
    // The per-folder check missed these because such folders are no longer
    // in `index.getAllFolders()`.
    if (this.isUnloaded()) return;
    await this.removeOrphanedDedicatedMocs();
  }

  async runForPaths(filePaths: ReadonlyArray<string>): Promise<void> {
    for (const folderPath of this.affectedFolders(filePaths)) {
      if (this.isUnloaded()) return;
      await this.syncFolder(folderPath);
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

  private async syncFolder(folderPath: string): Promise<void> {
    if (isExcluded(folderPath, this.settings.excludedPaths)) {
      await this.removeDedicatedMocForFolder(folderPath);
      return;
    }
    const mocPath = this.mocPathForFolder(folderPath);
    if (!this.folderHasUserContent(folderPath, mocPath)) {
      await this.removeDedicatedMocForFolder(folderPath);
      return;
    }
    const body = buildMocBody(this.buildInputForFolder(folderPath));
    if (this.resolveFormat(folderPath) === 'dedicated') {
      await this.writeDedicated(folderPath, body);
      if (this.isUnloaded()) return;
      await this.injectInline(folderPath, body, false);
    } else {
      await this.injectInline(folderPath, body, true);
    }
  }

  private async removeOrphanedDedicatedMocs(): Promise<void> {
    const mocFiles = this.app.vault
      .getMarkdownFiles()
      .filter(f => f.name === MOC_BASENAME);
    for (const file of mocFiles) {
      if (this.isUnloaded()) return;
      if (!this.isKbManaged(file)) continue;
      const folderPath = this.folderPathOf(file);
      const excluded = isExcluded(folderPath, this.settings.excludedPaths);
      const wantsDedicated = this.resolveFormat(folderPath) === 'dedicated';
      // Folder must still contain at least one USER note (non-managed,
      // non-MOC.md). Without this check the generated MOC.md itself keeps
      // its own folder "alive" in the index and the orphan check never
      // triggers when all real notes have been deleted.
      const hasUserContent = this.folderHasUserContent(folderPath, file.path);
      const shouldKeep = hasUserContent && !excluded && wantsDedicated;
      if (shouldKeep) continue;
      try {
        this.onSelfModify(file.path);
        await this.app.vault.trash(file, true);
      } catch (err) {
        console.warn(`KB Manager: failed to trash orphan MOC ${file.path}`, err);
      }
    }
  }

  private async removeDedicatedMocForFolder(folderPath: string): Promise<void> {
    const mocPath = this.mocPathForFolder(folderPath);
    const existing = this.app.vault.getAbstractFileByPath(mocPath);
    if (!(existing instanceof TFile) || !this.isKbManaged(existing)) return;
    try {
      this.onSelfModify(existing.path);
      await this.app.vault.trash(existing, true);
    } catch (err) {
      console.warn(`KB Manager: failed to trash stale MOC ${existing.path}`, err);
    }
  }

  private folderHasUserContent(folderPath: string, mocPath: string): boolean {
    return this.index.getFilesInFolder(folderPath).some(record => {
      if (record.path === mocPath) return false;
      const file = this.app.vault.getAbstractFileByPath(record.path);
      if (!(file instanceof TFile)) return false;
      if (file.name === MOC_BASENAME) return false;
      return !this.isKbManaged(file);
    });
  }

  private folderPathOf(file: TFile): string {
    const parentPath = file.parent?.path ?? '';
    return parentPath === '/' ? '' : parentPath;
  }

  private mocPathForFolder(folderPath: string): string {
    return normalizePath(folderPath === '' ? MOC_BASENAME : `${folderPath}/${MOC_BASENAME}`);
  }

  private resolveFormat(folderPath: string): 'dedicated' | 'inline' {
    return this.settings.folderRules[folderPath] ?? this.settings.defaultMocFormat;
  }

  private buildInputForFolder(folderPath: string): MocBuildInput {
    const filtered = this.index
      .getFilesInFolder(folderPath)
      .filter(record => !this.shouldSkipForListing(record.path));
    const tagTree = buildTagTree(filtered.map(r => ({ filePath: r.path, tags: r.tags })));
    const untaggedFiles = filtered.filter(r => r.tags.length === 0).map(r => r.path);
    return { tagTree, untaggedFiles };
  }

  private shouldSkipForListing(filePath: string): boolean {
    if (isExcluded(filePath, this.settings.excludedPaths)) return true;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return true;
    if (file.name === MOC_BASENAME) return true;
    return this.isKbManaged(file);
  }

  private isKbManaged(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    return cache?.frontmatter?.['kb-managed'] === true;
  }

  private async writeDedicated(folderPath: string, body: string): Promise<void> {
    const mocPath = this.mocPathForFolder(folderPath);
    const fullContent = buildDedicatedMocFile(folderPath, body);
    const existing = this.app.vault.getAbstractFileByPath(mocPath);
    if (existing instanceof TFile) {
      if (!this.isKbManaged(existing)) {
        console.warn(`KB Manager: skipping ${mocPath} - file lacks kb-managed frontmatter`);
        return;
      }
      const current = await this.app.vault.cachedRead(existing);
      if (current === fullContent) return;
      this.onSelfModify(existing.path);
      await this.app.vault.process(existing, () => fullContent);
      return;
    }
    this.onSelfModify(mocPath);
    await this.app.vault.create(mocPath, fullContent);
  }

  private async injectInline(folderPath: string, body: string, allowAutoInject: boolean): Promise<void> {
    for (const record of this.index.getFilesInFolder(folderPath)) {
      if (isExcluded(record.path, this.settings.excludedPaths)) continue;
      const file = this.app.vault.getAbstractFileByPath(record.path);
      if (!(file instanceof TFile)) continue;
      if (file.name === MOC_BASENAME || this.isKbManaged(file)) continue;
      await this.processInlineFile(file, body, allowAutoInject);
    }
  }

  private async processInlineFile(file: TFile, body: string, allowAutoInject: boolean): Promise<void> {
    const startDelim = buildDelimiter('moc', 'start');
    const endDelim = buildDelimiter('moc', 'end');
    await this.app.vault.process(file, content => {
      if (isWriteSafe(content, 'moc')) {
        const next = replaceDelimitedSection(content, 'moc', body.trimEnd());
        if (next !== content) this.onSelfModify(file.path);
        return next;
      }
      const hasAnyDelimiter = content.includes(startDelim) || content.includes(endDelim);
      if (!allowAutoInject || !this.settings.autoInject || hasAnyDelimiter) return content;
      const appended = `${content}\n\n${startDelim}\n${endDelim}\n`;
      const next = replaceDelimitedSection(appended, 'moc', body.trimEnd());
      if (next !== content) this.onSelfModify(file.path);
      return next;
    });
  }
}
