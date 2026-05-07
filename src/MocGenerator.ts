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
    private settings: KBManagerSettings
  ) {}

  async run(): Promise<void> {
    for (const folderPath of this.index.getAllFolders()) {
      if (isExcluded(folderPath, this.settings.excludedPaths)) continue;
      const body = buildMocBody(this.buildInputForFolder(folderPath));
      if (this.resolveFormat(folderPath) === 'dedicated') {
        await this.writeDedicated(folderPath, body);
        await this.injectInline(folderPath, body, false);
      } else {
        await this.injectInline(folderPath, body, true);
      }
    }
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
    const mocPath = normalizePath(folderPath === '' ? MOC_BASENAME : `${folderPath}/${MOC_BASENAME}`);
    const fullContent = buildDedicatedMocFile(folderPath, body);
    const existing = this.app.vault.getAbstractFileByPath(mocPath);
    if (existing instanceof TFile) {
      if (!this.isKbManaged(existing)) {
        console.warn(`KB Manager: skipping ${mocPath} - file lacks kb-managed frontmatter`);
        return;
      }
      await this.app.vault.process(existing, () => fullContent);
      return;
    }
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
        return replaceDelimitedSection(content, 'moc', body.trimEnd());
      }
      const hasAnyDelimiter = content.includes(startDelim) || content.includes(endDelim);
      if (!allowAutoInject || !this.settings.autoInject || hasAnyDelimiter) return content;
      const appended = `${content}\n\n${startDelim}\n${endDelim}\n`;
      return replaceDelimitedSection(appended, 'moc', body.trimEnd());
    });
  }
}
