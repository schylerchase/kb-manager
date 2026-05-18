import { ItemView, Menu, Notice, TFile, WorkspaceLeaf, normalizePath, setIcon } from 'obsidian';
import type KBManagerPlugin from './main';
import { FileEntry, FolderTreeNode, TagTreeViewNode, buildFolderTree, buildScopedTagHierarchy, buildTagViewTree, countFilesInFolderScope, countPathsInFolderScope, isFileInFolderScope } from './lib/sidebar-data';
import { isExcluded } from './lib/exclusions';
import { renderTagScope } from './lib/sidebar-ui';
import { addNewNoteAction, addTagNoteActions, getFilesNeedingTags, renderNeedsTags } from './lib/sidebar-note-actions';

export const KB_SIDEBAR_VIEW_TYPE = 'kb-manager-sidebar';

type SidebarTab = 'browse' | 'tags' | 'review';

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

  /**
   * Deferred-render timer handles. Tracked so onClose can cancel pending
   * retries — without this, a closed-then-reopened view could fire a
   * stale render that paints into a detached container.
   */
  private deferredRenderHandles: number[] = [];

  async onOpen(): Promise<void> {
    this.render();
    this.refreshCallback = () => this.render();
    this.plugin.sidebarRefreshCallbacks.add(this.refreshCallback);
    // Obsidian sometimes invokes onOpen BEFORE the leaf's containerEl is
    // attached to the DOM — most reliably reproducible after a plugin
    // toggle-off-then-on while a sidebar leaf was open. render() bails on
    // !container.isConnected and only retriggers via a rebuild-complete
    // notification, so if no rebuild fires (or it fires too early) the
    // sidebar stays blank until the user manually triggers one.
    //
    // Schedule a small ladder of deferred renders so the view paints once
    // the container becomes connected, with no dependency on rebuild
    // timing. Each retry is cheap: render() short-circuits when the leaf
    // is still detached, and when it's connected the result is idempotent.
    this.scheduleDeferredRenders();
  }

  async onClose(): Promise<void> {
    for (const handle of this.deferredRenderHandles) window.clearTimeout(handle);
    this.deferredRenderHandles = [];
    if (!this.refreshCallback) return;
    this.plugin.sidebarRefreshCallbacks.delete(this.refreshCallback);
    this.refreshCallback = null;
  }

  private scheduleDeferredRenders(): void {
    // Ladder covers: next animation frame (16ms), post-layout (100ms),
    // and a slow-mobile fallback (500ms). After ~500ms a still-blank
    // sidebar is almost certainly a real "view never attached" case that
    // no retry can fix.
    const delays = [16, 100, 500];
    for (const delay of delays) {
      const handle = window.setTimeout(() => {
        if (!this.refreshCallback) return;
        this.render();
      }, delay);
      this.deferredRenderHandles.push(handle);
    }
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
    } else if (this.activeTab === 'tags') {
      this.renderTagsSection(container);
      this.renderTagCleanupSection(container);
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
    this.renderTab(tabs, 'tags', 'Tags');
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
    this.renderTagManagementToolbar(section);
    if (tree.length === 0) { section.createEl('p', { cls: 'kb-empty', text: this.selectedFolderPath === '' ? 'No tags found' : 'No tags in this folder' }); return; }
    const list = section.createDiv({ cls: 'kb-tree' });
    for (const node of tree) this.renderTagNode(list, node, 0);
  }

  /**
   * Visible toolbar above the tag tree with global tag-management actions.
   * Big touch-friendly targets (iPad first) so users never need long-press
   * or right-click to discover rename/bulk/cleanse/rules. Per-tag actions
   * still live in the row's `more` icon and right-click menu.
   */
  private renderTagManagementToolbar(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: 'kb-tag-toolbar' });
    this.renderToolbarButton(toolbar, 'pencil', 'Rename', () => {
      const tags = [...this.plugin.index.getTagTree().keys()].sort();
      if (tags.length === 0) { new Notice('No tags to rename.'); return; }
      this.plugin.openTagPicker('Pick a tag to rename', tags, (tag) => {
        void this.plugin.renameTagWithConfirm(tag);
      });
    });
    this.renderToolbarButton(toolbar, 'git-merge', 'Merge', () => {
      const tags = [...this.plugin.index.getTagTree().keys()].sort();
      if (tags.length === 0) { new Notice('No tags to merge.'); return; }
      this.plugin.openTagPicker('Pick the source tag to merge', tags, (tag) => {
        void this.plugin.mergeTagWithConfirm(tag);
      });
    });
    this.renderToolbarButton(toolbar, 'list-tree', 'Bulk', () => {
      this.plugin.openBulkTagModalPublic();
    });
    this.renderToolbarButton(toolbar, 'wand-sparkles', 'Cleanse', () => {
      void this.plugin.cleanseInvalidTagsWithConfirm();
    });
    this.renderToolbarButton(toolbar, 'settings', 'Rules', () => {
      this.plugin.openTagRulesSettings();
    });
  }

  private renderToolbarButton(parent: HTMLElement, icon: string, label: string, activate: () => void): void {
    const btn = parent.createEl('button', { cls: 'kb-tag-toolbar-btn' });
    btn.setAttribute('aria-label', label);
    const iconEl = btn.createSpan({ cls: 'kb-tag-toolbar-btn-icon' });
    setIcon(iconEl, icon);
    btn.createSpan({ cls: 'kb-tag-toolbar-btn-label', text: label });
    btn.addEventListener('click', () => activate());
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

  /**
   * Tag cleanup panel rendered inside its own section in the Tags tab.
   * Previously lived under Review; relocated so all tag-management
   * surfaces are in one place.
   */
  private renderTagCleanupSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'kb-section kb-section-tag-cleanup' });
    section.createEl('h3', { text: 'Cleanup', cls: 'kb-section-header' });
    section.createEl('p', {
      cls: 'kb-section-intro',
      text:
        'Tags that may need attention: only used on 1 note (often typos or stale), ' +
        'or look almost identical to another tag. Rename or delete from here.',
    });
    this.renderTagCleanupPanel(section);
  }

  private renderTagCleanupPanel(parent: HTMLElement): void {
    const candidates = this.plugin.getTagCleanupCandidates();
    if (candidates.length === 0) {
      parent.createEl('p', { cls: 'kb-empty', text: 'No cleanup candidates' });
      return;
    }
    const list = parent.createDiv({ cls: 'kb-tag-cleanup-list' });
    for (const candidate of candidates) {
      if (candidate.kind === 'orphan') this.renderOrphanCandidate(list, candidate);
      else this.renderDuplicateCandidate(list, candidate);
    }
  }

  private renderOrphanCandidate(parent: HTMLElement, candidate: { kind: 'orphan'; tag: string; noteCount: number }): void {
    const row = parent.createDiv({ cls: 'kb-cleanup-row kb-cleanup-orphan' });
    const text = row.createDiv({ cls: 'kb-cleanup-text' });
    text.createSpan({ cls: 'kb-cleanup-label', text: `#${candidate.tag}` });
    text.createSpan({ cls: 'kb-cleanup-meta', text: 'Used in 1 note' });
    const actions = row.createDiv({ cls: 'kb-cleanup-actions' });
    this.renderCleanupActionButton(actions, 'pencil', 'Rename', () => this.plugin.renameTagWithConfirm(candidate.tag));
    this.renderCleanupActionButton(actions, 'trash-2', 'Delete', () => this.plugin.deleteTagEverywhereWithConfirm(candidate.tag));
  }

  private renderDuplicateCandidate(parent: HTMLElement, candidate: { kind: 'near-duplicate'; tags: string[]; noteCounts: number[]; distance: number }): void {
    const row = parent.createDiv({ cls: 'kb-cleanup-row kb-cleanup-duplicate' });
    const text = row.createDiv({ cls: 'kb-cleanup-text' });
    text.createSpan({
      cls: 'kb-cleanup-label',
      text: `#${candidate.tags[0]} ↔ #${candidate.tags[1]}`,
    });
    text.createSpan({
      cls: 'kb-cleanup-meta',
      text: `Looks like a duplicate (${candidate.noteCounts[0]} vs ${candidate.noteCounts[1]} notes)`,
    });
    const actions = row.createDiv({ cls: 'kb-cleanup-actions' });
    // Default merge direction: smaller-count → larger-count.
    const [keepCount, dropCount] = candidate.noteCounts;
    const keepIdx = keepCount! >= dropCount! ? 0 : 1;
    const dropIdx = 1 - keepIdx;
    const keepTag = candidate.tags[keepIdx]!;
    const dropTag = candidate.tags[dropIdx]!;
    this.renderCleanupActionButton(actions, 'git-merge', `Merge into #${keepTag}`, async () => {
      // Use renameTag semantics: drop → keep
      await this.plugin.mergeTagsDirectly(dropTag, keepTag);
    });
  }

  private renderCleanupActionButton(parent: HTMLElement, icon: string, label: string, activate: () => void | Promise<void>): void {
    const btn = parent.createEl('button', { cls: 'kb-cleanup-action-btn' });
    const iconEl = btn.createSpan({ cls: 'kb-action-button-icon' });
    setIcon(iconEl, icon);
    btn.createSpan({ text: label });
    btn.addEventListener('click', () => {
      void activate();
    });
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
    if (isShowingFiles) row.addClass('is-active');
    this.addTwirl(row, hasChildren, isExpanded, () => this.toggleTag(node.fullPath));
    row.createSpan({ cls: 'kb-label-tag', text: `#${node.name}` });
    row.createSpan({ cls: 'kb-tag-count', text: String(taggedFiles.length) });
    addTagNoteActions(row, this.addRowAction.bind(this), this.plugin, this.selectedFolderPath, node.fullPath);
    this.addTagSearchAction(row, node.fullPath);
    // Visible "more" icon — opens the same menu as right-click. Critical on
    // touch (iPad) where right-click via long-press isn't discoverable.
    this.addRowAction(row, 'kb-tag-more', 'more-horizontal', `More tag actions for #${node.fullPath}`, (event) => {
      this.showTagActionMenu(node.fullPath, event);
    });
    this.addTagContextMenu(row, node.fullPath);
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

  private addTagContextMenu(row: HTMLElement, fullPath: string): void {
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.showTagActionMenu(fullPath, event);
    });
  }

  private showTagActionMenu(fullPath: string, event: MouseEvent): void {
    const menu = this.buildTagActionMenu(fullPath);
    menu.showAtMouseEvent(event);
  }

  private buildTagActionMenu(fullPath: string): Menu {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle(`Search for #${fullPath}`)
        .setIcon('search')
        .onClick(() => this.openTagSearch(fullPath)),
    );
    menu.addItem((item) =>
      item
        .setTitle('Add to current note')
        .setIcon('tag')
        .onClick(() => {
          this.plugin
            .addTagsToCurrentNote([fullPath])
            .catch((err) => console.error('KB Manager: add tag failed', err));
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle('Remove from current note')
        .setIcon('circle-minus')
        .onClick(() => {
          this.plugin
            .removeTagFromCurrentNote(fullPath)
            .catch((err) => console.error('KB Manager: remove tag failed', err));
        }),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('Rename tag…')
        .setIcon('pencil')
        .onClick(() => {
          void this.plugin.renameTagWithConfirm(fullPath);
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle('Merge tag into…')
        .setIcon('git-merge')
        .onClick(() => {
          void this.plugin.mergeTagWithConfirm(fullPath);
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle('Show stats…')
        .setIcon('bar-chart-3')
        .onClick(() => {
          const stats = this.plugin.buildTagStatsForMenu(fullPath);
          if (!stats) {
            new Notice(`No notes use #${fullPath}.`);
            return;
          }
          stats.open();
        }),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('Delete tag everywhere…')
        .setIcon('trash-2')
        .setWarning(true)
        .onClick(() => {
          void this.plugin.deleteTagEverywhereWithConfirm(fullPath);
        }),
    );
    return menu;
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
    row.addEventListener('click', () => this.toggleFolder(node.path));
    this.addKeyboardActivation(row, () => this.toggleFolder(node.path));
  }

  private addMocAction(row: HTMLElement, folderPath: string): void {
    this.addRowAction(row, 'kb-folder-open', 'file-text', 'Open folder MOC', () => this.openMocForFolder(folderPath));
  }

  private addRowAction(row: HTMLElement, cls: string, icon: string, label: string, activate: (event: MouseEvent) => void): void {
    const action = row.createSpan({ cls: `kb-row-action ${cls}` });
    setIcon(action, icon);
    action.setAttribute('role', 'button');
    action.setAttribute('tabindex', '0');
    // aria-label drives both screen readers AND Obsidian's tooltip overlay.
    // Setting `title` in addition causes the browser's native tooltip to
    // stack on top of Obsidian's — visible as overlapping pills on hover.
    action.setAttribute('aria-label', label);
    action.addEventListener('click', event => {
      event.stopPropagation();
      activate(event);
    });
    this.addKeyboardActivation(action, () => activate(new MouseEvent('click')));
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
