import { ItemView, Notice, TFile, WorkspaceLeaf, normalizePath, setIcon } from 'obsidian';
import type KBManagerPlugin from './main';
import { FileEntry, FolderTreeNode, TagTreeViewNode, buildFolderTree, buildScopedTagHierarchy, buildTagViewTree, countFilesInFolderScope, countPathsInFolderScope, isFileInFolderScope } from './lib/sidebar-data';
import { isExcluded } from './lib/exclusions';
import { renderTagScope } from './lib/sidebar-ui';
import { addNewNoteAction, addTagNoteActions, getFilesNeedingTags, renderNeedsTags } from './lib/sidebar-note-actions';

export const KB_SIDEBAR_VIEW_TYPE = 'kb-manager-sidebar';

type SidebarTab = 'browse' | 'review';

type AppWithSearch = {
  internalPlugins?: { getPluginById(id: string): { instance?: { openGlobalSearch?(query: string): void } } | null };
  commands?: { executeCommandById(id: string): unknown };
};

export default class KBSidebarView extends ItemView {
  private refreshCallback: (() => void) | null = null;
  private expandedFolders = new Set<string>();
  private expandedTags = new Set<string>();
  private expandedTagResults = new Set<string>();
  private isNeedsTagsExpanded = true;
  private activeTab: SidebarTab = 'browse';
  private selectedFolderPath = '';
  private pulseKey: string | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: KBManagerPlugin) { super(leaf); }

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
    const container = this.containerEl.children[1] as HTMLElement | undefined;
    // Bail out if the leaf was detached between when this render was queued
    // (e.g. by a vault rebuild callback) and now.
    if (!container || !container.isConnected) return;
    // Drop selectedFolderPath if no indexed file lives under it (rename,
    // delete, or exclusion change) so the tag scope doesn't show "0 tags"
    // forever. Use prefix check so intermediate (file-less) folders that
    // exist in the sidebar tree but not as direct index keys still count.
    if (this.selectedFolderPath !== '') {
      const selected = this.selectedFolderPath;
      const prefix = `${selected}/`;
      const stillVisible = this.plugin.index
        .getAllFolders()
        .some(folder => folder === selected || folder.startsWith(prefix));
      if (!stillVisible) this.selectedFolderPath = '';
    }
    const mocScroll = container.querySelector<HTMLElement>('.kb-section-moc')?.scrollTop ?? 0;
    const tagScroll = container.querySelector<HTMLElement>('.kb-section-tags')?.scrollTop ?? 0;
    const reviewScroll = container.querySelector<HTMLElement>('.kb-section-review')?.scrollTop ?? 0;
    container.empty();
    container.addClass('kb-manager-sidebar');
    this.renderTabs(container);
    if (this.activeTab === 'browse') {
      this.renderMocSection(container);
      this.renderTagsSection(container);
    } else {
      this.renderReviewSection(container);
    }
    container.querySelector<HTMLElement>('.kb-section-moc')?.scrollTo({ top: mocScroll });
    container.querySelector<HTMLElement>('.kb-section-tags')?.scrollTo({ top: tagScroll });
    container.querySelector<HTMLElement>('.kb-section-review')?.scrollTo({ top: reviewScroll });
    container.querySelector<HTMLElement>('.kb-row-pulse')?.scrollIntoView({ block: 'nearest' });
    this.pulseKey = null;
  }

  private renderTabs(parent: HTMLElement): void {
    const tabs = parent.createDiv({ cls: 'kb-tabs' });
    this.renderTab(tabs, 'browse', 'Browse');
    this.renderTab(tabs, 'review', 'Review');
  }

  private renderTab(parent: HTMLElement, tab: SidebarTab, label: string): void {
    const button = parent.createEl('button', { text: label, cls: 'kb-tab' });
    const isActive = this.activeTab === tab;
    button.toggleClass('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.addEventListener('click', () => {
      this.activeTab = tab;
      this.render();
    });
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
    const row = this.createTreeRow(parent, depth, 'kb-row-folder', `folder:${node.path}`);
    if (this.selectedFolderPath === node.path) row.addClass('is-active');
    if (!isRoot) this.addTwirl(row, hasChildren, isExpanded, () => this.toggleFolder(node.path));
    row.createSpan({ cls: 'kb-label-folder', text: isRoot ? 'Vault' : node.name });
    this.configureFolderToggle(row, node, isExpanded);
    addNewNoteAction(row, this.addRowAction.bind(this), this.plugin, node.path, []);
    if (node.hasMoc) this.addMocAction(row, node.path);
    if (!node.hasMoc) row.addClass('kb-row-muted');
    if (!isExpanded) return;
    for (const childFolder of node.childFolders) this.renderFolderNode(parent, childFolder, depth + 1, false);
    for (const file of node.childFiles) this.renderFileRow(parent, file.path, file.basename, depth + 1);
  }

  private renderFileRow(parent: HTMLElement, filePath: string, basename: string, depth: number): void {
    const row = this.createTreeRow(parent, depth, 'kb-row-file', `file:${filePath}`);
    row.createSpan({ text: basename });
    row.addEventListener('click', () => this.openFileByPath(filePath));
  }

  private renderTagsSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'kb-section kb-section-tags' });
    const folder = this.selectedFolderPath.split('/').pop() || 'Vault';
    const files = this.plugin.index.getAllFiles();
    const hierarchy = this.selectedFolderPath === ''
      ? this.plugin.tagManager.getTagHierarchy()
      : buildScopedTagHierarchy(files, this.selectedFolderPath);
    const tree = buildTagViewTree(hierarchy, tag =>
      countPathsInFolderScope(this.plugin.tagManager.getFilesWithTag(tag), this.selectedFolderPath));
    section.createEl('h3', { text: 'Tags', cls: 'kb-section-header' });
    const noteCount = countFilesInFolderScope(files, this.selectedFolderPath);
    renderTagScope(section, { label: this.selectedFolderPath || folder, noteCount, tagCount: tree.length, canClear: this.selectedFolderPath !== '', clear: () => this.toggleFolder('') });
    if (tree.length === 0) { section.createEl('p', { cls: 'kb-empty', text: this.selectedFolderPath === '' ? 'No tags found' : 'No tags in this folder' }); return; }
    const list = section.createDiv({ cls: 'kb-tree' });
    for (const node of tree) this.renderTagNode(list, node, 0);
  }

  private renderReviewSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'kb-section kb-section-review' });
    section.createEl('h3', { text: 'Review', cls: 'kb-section-header' });
    const files = this.plugin.index.getAllFiles();
    const needsTags = getFilesNeedingTags(files, this.selectedFolderPath, path => this.getFile(path), file => this.isKbManaged(file));
    this.renderReviewSummary(section, needsTags.length);
    this.renderReviewActions(section);
    if (needsTags.length > 0) this.renderNeedsTagsSection(section, needsTags);
    else section.createEl('p', { cls: 'kb-empty', text: 'No untagged notes in scope' });
  }

  private renderReviewSummary(parent: HTMLElement, needsTagsCount: number): void {
    const scope = this.selectedFolderPath || 'Vault';
    const summary = parent.createDiv({ cls: 'kb-review-summary' });
    summary.createSpan({ cls: 'kb-scope-label', text: scope });
    summary.createSpan({
      cls: 'kb-scope-meta',
      text: `${needsTagsCount} need tags | ${this.plugin.settings.kbReviewReminderDays}d reminder`,
    });
  }

  private renderReviewActions(parent: HTMLElement): void {
    const actions = parent.createDiv({ cls: 'kb-review-actions' });
    this.renderActionButton(actions, 'alarm-clock', 'Remind', () => {
      this.plugin.createKbUpdateReminder(this.selectedFolderPath)
        .catch(err => console.error('KB Manager: reminder failed', err));
    });
    this.renderActionButton(actions, 'list-checks', 'Open reminders', () => {
      this.plugin.openReminderManager();
    });
  }

  private renderActionButton(parent: HTMLElement, iconName: string, label: string, activate: () => void): void {
    const button = parent.createEl('button', { cls: 'kb-action-button' });
    const icon = button.createSpan({ cls: 'kb-action-button-icon' });
    setIcon(icon, iconName);
    button.createSpan({ text: label });
    button.addEventListener('click', activate);
  }

  private renderTagNode(parent: HTMLElement, node: TagTreeViewNode, depth: number): void {
    const hasChildren = node.children.length > 0;
    const isExpanded = this.expandedTags.has(node.fullPath);
    const isShowingFiles = this.expandedTagResults.has(node.fullPath);
    const taggedFiles = this.getTaggedFiles(node);
    const row = this.createTreeRow(parent, depth, 'kb-row-tag', `tag:${node.fullPath}`);
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Show notes tagged #${node.fullPath}`);
    row.setAttribute('aria-expanded', String(isShowingFiles));
    row.setAttribute('title', `Show notes tagged #${node.fullPath}`);
    if (isShowingFiles) row.addClass('is-active');
    this.addTwirl(row, hasChildren, isExpanded, () => this.toggleTag(node.fullPath));
    row.createSpan({ cls: 'kb-label-tag', text: `#${node.name}` });
    row.createSpan({ cls: 'kb-tag-count', text: String(taggedFiles.length) });
    addTagNoteActions(row, this.addRowAction.bind(this), this.plugin, this.selectedFolderPath, node.fullPath);
    this.addTagSearchAction(row, node.fullPath);
    row.addEventListener('click', () => this.toggleTagResults(node.fullPath));
    this.addKeyboardActivation(row, () => this.toggleTagResults(node.fullPath));
    if (isShowingFiles) this.renderTagFiles(parent, taggedFiles, depth + 1);
    if (hasChildren && isExpanded) {
      for (const child of node.children) this.renderTagNode(parent, child, depth + 1);
    }
  }

  private addTagSearchAction(row: HTMLElement, fullPath: string): void {
    this.addRowAction(row, 'kb-tag-search', 'search', `Search for #${fullPath}`, () => this.openTagSearch(fullPath));
  }

  private renderTagFiles(parent: HTMLElement, files: Array<{ path: string; basename: string }>, depth: number): void {
    if (files.length === 0) {
      const row = this.createTreeRow(parent, depth, 'kb-row-tag-empty');
      row.createSpan({ text: 'No tag matches' });
      return;
    }
    for (const file of files) this.renderTagFileRow(parent, file.path, file.basename, depth);
  }

  private renderNeedsTagsSection(parent: HTMLElement, files: Array<{ path: string; basename: string }>): void {
    renderNeedsTags(parent, files, {
      isExpanded: this.isNeedsTagsExpanded,
      createTreeRow: (el, depth, cls, key) => this.createTreeRow(el, depth, cls, key),
      addTwirl: (row, hasChildren, isExpanded, toggle) => this.addTwirl(row, hasChildren, isExpanded, toggle),
      addRowAction: this.addRowAction.bind(this),
      addKeyboardActivation: (element, activate) => this.addKeyboardActivation(element, activate),
      toggle: () => this.toggleNeedsTags(),
      openFile: path => { this.openFileByPath(path); },
      promptAddTags: path => this.plugin.promptAddTagsToNote(path),
    });
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
        if (!isFileInFolderScope(path, this.selectedFolderPath)) return [];
        return [{ path, basename: this.basename(file.name) }];
      })
      .sort((a, b) => a.basename.toLowerCase().localeCompare(b.basename.toLowerCase()));
  }

  private collectTaggedFilePaths(node: TagTreeViewNode, paths: Set<string>): void {
    for (const path of this.plugin.tagManager.getFilesWithTag(node.fullPath)) paths.add(path);
    for (const child of node.children) this.collectTaggedFilePaths(child, paths);
  }

  private createTreeRow(parent: HTMLElement, depth: number, cls: string, key = ''): HTMLElement {
    const row = parent.createDiv({ cls: `kb-row ${cls}` });
    row.style.setProperty('--kb-depth', String(depth));
    if (key === this.pulseKey) row.addClass('kb-row-pulse');
    return row;
  }

  private configureFolderToggle(row: HTMLElement, node: FolderTreeNode, isExpanded: boolean): void {
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-expanded', String(isExpanded));
    row.setAttribute('aria-label', `Browse ${node.name || 'Vault'}`);
    row.setAttribute('title', `Show tags in ${node.name || 'Vault'}`);
    row.addEventListener('click', () => this.toggleFolder(node.path));
    this.addKeyboardActivation(row, () => this.toggleFolder(node.path));
  }

  private addMocAction(row: HTMLElement, folderPath: string): void {
    this.addRowAction(row, 'kb-folder-open', 'file-text', 'Open folder MOC', () => this.openMocForFolder(folderPath));
  }

  private addRowAction(row: HTMLElement, cls: string, icon: string, label: string, activate: () => void): void {
    const action = row.createSpan({ cls: `kb-row-action ${cls}` });
    setIcon(action, icon);
    action.setAttribute('role', 'button');
    action.setAttribute('tabindex', '0');
    action.setAttribute('aria-label', label);
    action.setAttribute('title', label);
    action.addEventListener('click', event => {
      event.stopPropagation();
      activate();
    });
    this.addKeyboardActivation(action, activate);
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

  private getFile(filePath: string): TFile | null {
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    return file instanceof TFile ? file : null;
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
    this.selectedFolderPath = folderPath;
    if (this.expandedFolders.has(folderPath)) this.expandedFolders.delete(folderPath);
    else this.expandedFolders.add(folderPath);
    this.pulseKey = `folder:${folderPath}`;
    this.render();
  }

  private toggleTag(fullPath: string): void {
    if (this.expandedTags.has(fullPath)) this.expandedTags.delete(fullPath);
    else this.expandedTags.add(fullPath);
    this.pulseKey = `tag:${fullPath}`;
    this.render();
  }

  private toggleTagResults(fullPath: string): void {
    if (this.expandedTagResults.has(fullPath)) this.expandedTagResults.delete(fullPath);
    else this.expandedTagResults.add(fullPath);
    this.pulseKey = `tag:${fullPath}`;
    this.render();
  }

  private toggleNeedsTags(): void {
    this.isNeedsTagsExpanded = !this.isNeedsTagsExpanded;
    this.pulseKey = 'needs-tags';
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
