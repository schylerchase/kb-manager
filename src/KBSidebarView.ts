import { ItemView, Notice, TFile, WorkspaceLeaf, normalizePath, setIcon } from 'obsidian';
import type KBManagerPlugin from './main';
import {
  FileEntry,
  FolderTreeNode,
  TagTreeViewNode,
  buildFolderTree,
  buildTagViewTree,
} from './lib/sidebar-data';
import { isExcluded } from './lib/exclusions';

export const KB_SIDEBAR_VIEW_TYPE = 'kb-manager-sidebar';

type AppWithSearch = {
  internalPlugins?: {
    getPluginById(id: string): { instance?: { openGlobalSearch?(query: string): void } } | null;
  };
  commands?: {
    executeCommandById(id: string): unknown;
  };
};

export default class KBSidebarView extends ItemView {
  private refreshCallback: (() => void) | null = null;
  private expandedFolders = new Set<string>();
  private expandedTags = new Set<string>();
  private expandedTagResults = new Set<string>();

  constructor(leaf: WorkspaceLeaf, private plugin: KBManagerPlugin) {
    super(leaf);
  }

  getViewType(): string { return KB_SIDEBAR_VIEW_TYPE; }
  getDisplayText(): string { return 'KB Manager'; }
  getIcon(): string { return 'network'; }

  async onOpen(): Promise<void> {
    this.render();
    this.refreshCallback = () => this.render();
    this.plugin.sidebarRefreshCallbacks.add(this.refreshCallback);
  }

  async onClose(): Promise<void> {
    if (!this.refreshCallback) return;
    this.plugin.sidebarRefreshCallbacks.delete(this.refreshCallback);
    this.refreshCallback = null;
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('kb-manager-sidebar');
    this.renderMocSection(container);
    this.renderTagsSection(container);
  }

  private renderMocSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'kb-section kb-section-moc' });
    section.createEl('h3', { text: 'MOC Tree', cls: 'kb-section-header' });
    const folders = this.plugin.index.getAllFolders();
    const root = buildFolderTree(
      folders,
      this.collectFilesByFolder(folders),
      this.plugin.settings.excludedPaths,
      path => this.plugin.settings.folderRules[path] ?? this.plugin.settings.defaultMocFormat,
      isExcluded
    );
    if (root.childFolders.length === 0 && root.childFiles.length === 0) {
      section.createEl('p', { cls: 'kb-empty', text: 'No folders to index' });
      return;
    }
    const list = section.createDiv({ cls: 'kb-tree' });
    this.renderFolderNode(list, root, 0, true);
  }

  private collectFilesByFolder(folders: string[]): Map<string, FileEntry[]> {
    const map = new Map<string, FileEntry[]>();
    for (const folder of folders) {
      map.set(folder, this.plugin.index.getFilesInFolder(folder).flatMap(record => {
        const file = this.plugin.app.vault.getAbstractFileByPath(record.path);
        if (!(file instanceof TFile)) return [];
        return [{ path: record.path, basename: this.basename(file.name), kbManaged: this.isKbManaged(file) }];
      }));
    }
    return map;
  }

  private renderFolderNode(parent: HTMLElement, node: FolderTreeNode, depth: number, isRoot: boolean): void {
    const hasChildren = node.childFolders.length > 0 || node.childFiles.length > 0;
    const isExpanded = isRoot || this.expandedFolders.has(node.path);
    const row = this.createTreeRow(parent, depth, 'kb-row-folder');
    if (!isRoot) this.addTwirl(row, hasChildren, isExpanded, () => this.toggleFolder(node.path));
    row.createSpan({ cls: 'kb-label-folder', text: isRoot ? 'Vault' : node.name });
    if (node.hasMoc) row.addEventListener('click', () => this.openMocForFolder(node.path));
    else row.addClass('kb-row-muted');
    if (!isExpanded) return;
    for (const childFolder of node.childFolders) this.renderFolderNode(parent, childFolder, depth + 1, false);
    for (const file of node.childFiles) this.renderFileRow(parent, file.path, file.basename, depth + 1);
  }

  private renderFileRow(parent: HTMLElement, filePath: string, basename: string, depth: number): void {
    const row = this.createTreeRow(parent, depth, 'kb-row-file');
    row.createSpan({ text: basename });
    row.addEventListener('click', () => this.openFileByPath(filePath));
  }

  private renderTagsSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'kb-section kb-section-tags' });
    section.createEl('h3', { text: 'Tags', cls: 'kb-section-header' });
    const tree = buildTagViewTree(
      this.plugin.tagManager.getTagHierarchy(),
      tag => this.plugin.tagManager.getFilesWithTag(tag).length
    );
    if (tree.length === 0) {
      section.createEl('p', { cls: 'kb-empty', text: 'No tags found' });
      return;
    }
    const list = section.createDiv({ cls: 'kb-tree' });
    for (const node of tree) this.renderTagNode(list, node, 0);
  }

  private renderTagNode(parent: HTMLElement, node: TagTreeViewNode, depth: number): void {
    const hasChildren = node.children.length > 0;
    const isExpanded = this.expandedTags.has(node.fullPath);
    const isShowingFiles = this.expandedTagResults.has(node.fullPath);
    const taggedFiles = this.getTaggedFiles(node);
    const row = this.createTreeRow(parent, depth, 'kb-row-tag');
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Show notes tagged #${node.fullPath}`);
    row.setAttribute('aria-expanded', String(isShowingFiles));
    row.setAttribute('title', `Show notes tagged #${node.fullPath}`);
    if (isShowingFiles) row.addClass('is-active');
    this.addTwirl(row, hasChildren, isExpanded, () => this.toggleTag(node.fullPath));
    row.createSpan({ cls: 'kb-label-tag', text: `#${node.name}` });
    row.createSpan({ cls: 'kb-tag-count', text: String(taggedFiles.length) });
    this.addTagSearchAction(row, node.fullPath);
    row.addEventListener('click', () => this.toggleTagResults(node.fullPath));
    this.addKeyboardActivation(row, () => this.toggleTagResults(node.fullPath));
    if (isShowingFiles) this.renderTagFiles(parent, taggedFiles, depth + 1);
    if (hasChildren && isExpanded) {
      for (const child of node.children) this.renderTagNode(parent, child, depth + 1);
    }
  }

  private addTagSearchAction(row: HTMLElement, fullPath: string): void {
    const action = row.createSpan({ cls: 'kb-row-action kb-tag-search' });
    setIcon(action, 'search');
    action.setAttribute('role', 'button');
    action.setAttribute('tabindex', '0');
    action.setAttribute('aria-label', `Search for #${fullPath}`);
    action.setAttribute('title', `Search for #${fullPath}`);
    action.addEventListener('click', event => {
      event.stopPropagation();
      this.openTagSearch(fullPath);
    });
    this.addKeyboardActivation(action, () => this.openTagSearch(fullPath));
  }

  private renderTagFiles(parent: HTMLElement, files: Array<{ path: string; basename: string }>, depth: number): void {
    if (files.length === 0) {
      const row = this.createTreeRow(parent, depth, 'kb-row-tag-empty');
      row.createSpan({ text: 'No tag matches' });
      return;
    }
    for (const file of files) this.renderTagFileRow(parent, file.path, file.basename, depth);
  }

  private renderTagFileRow(parent: HTMLElement, filePath: string, basename: string, depth: number): void {
    const row = this.createTreeRow(parent, depth, 'kb-row-file kb-row-tag-file');
    const icon = row.createSpan({ cls: 'kb-file-icon' });
    setIcon(icon, 'file-text');
    row.createSpan({ cls: 'kb-label-file', text: basename });
    row.addEventListener('click', () => this.openFileByPath(filePath));
  }

  private getTaggedFiles(node: TagTreeViewNode): Array<{ path: string; basename: string }> {
    const paths = new Set<string>();
    this.collectTaggedFilePaths(node, paths);
    return [...paths]
      .flatMap(path => {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile) || this.isKbManaged(file)) return [];
        return [{ path, basename: this.basename(file.name) }];
      })
      .sort((a, b) => a.basename.toLowerCase().localeCompare(b.basename.toLowerCase()));
  }

  private collectTaggedFilePaths(node: TagTreeViewNode, paths: Set<string>): void {
    for (const path of this.plugin.tagManager.getFilesWithTag(node.fullPath)) paths.add(path);
    for (const child of node.children) this.collectTaggedFilePaths(child, paths);
  }

  private createTreeRow(parent: HTMLElement, depth: number, cls: string): HTMLElement {
    const row = parent.createDiv({ cls: `kb-row ${cls}` });
    row.style.paddingLeft = `${depth * 12}px`;
    return row;
  }

  private addTwirl(row: HTMLElement, hasChildren: boolean, isExpanded: boolean, toggle: () => void): void {
    const twirl = row.createSpan({ cls: 'kb-twirl' });
    if (!hasChildren) return;
    setIcon(twirl, isExpanded ? 'chevron-down' : 'chevron-right');
    twirl.addEventListener('click', event => {
      event.stopPropagation();
      toggle();
    });
  }

  private addKeyboardActivation(element: HTMLElement, activate: () => void): void {
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      activate();
    });
  }

  private async openMocForFolder(folderPath: string): Promise<void> {
    const mocPath = normalizePath(folderPath === '' ? 'MOC.md' : `${folderPath}/MOC.md`);
    const file = this.plugin.app.vault.getAbstractFileByPath(mocPath);
    if (!(file instanceof TFile)) {
      console.warn(`KB Manager: no MOC.md at ${mocPath} (inline mode or not yet generated)`);
      return;
    }
    await this.plugin.app.workspace.getLeaf(false).openFile(file);
  }

  private async openFileByPath(filePath: string): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) await this.plugin.app.workspace.getLeaf(false).openFile(file);
  }

  private openTagSearch(fullPath: string): void {
    const query = `tag:#${fullPath}`;
    const app = this.plugin.app as typeof this.plugin.app & AppWithSearch;
    const search = app.internalPlugins?.getPluginById('global-search')?.instance;
    if (search?.openGlobalSearch) {
      search.openGlobalSearch(query);
      return;
    }
    app.commands?.executeCommandById('global-search:open');
    new Notice(`KB Manager: open Obsidian search and use ${query}`);
  }

  private toggleFolder(folderPath: string): void {
    if (this.expandedFolders.has(folderPath)) this.expandedFolders.delete(folderPath);
    else this.expandedFolders.add(folderPath);
    this.render();
  }

  private toggleTag(fullPath: string): void {
    if (this.expandedTags.has(fullPath)) this.expandedTags.delete(fullPath);
    else this.expandedTags.add(fullPath);
    this.render();
  }

  private toggleTagResults(fullPath: string): void {
    if (this.expandedTagResults.has(fullPath)) this.expandedTagResults.delete(fullPath);
    else this.expandedTagResults.add(fullPath);
    this.render();
  }

  private isKbManaged(file: TFile): boolean {
    return this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.['kb-managed'] === true;
  }

  private basename(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot === -1 ? fileName : fileName.slice(0, dot);
  }
}
