---
phase: 07-sidebar-view
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/KBSidebarView.ts
autonomous: true
requirements:
  - SIDE-01
  - SIDE-02
must_haves:
  truths:
    - "src/KBSidebarView.ts exports default class KBSidebarView extends ItemView"
    - "src/KBSidebarView.ts exports KB_SIDEBAR_VIEW_TYPE = 'kb-manager-sidebar' constant"
    - "KBSidebarView.getViewType returns KB_SIDEBAR_VIEW_TYPE"
    - "KBSidebarView.getDisplayText returns 'KB Manager'"
    - "KBSidebarView.getIcon returns 'network'"
    - "onOpen renders the view and registers a refresh callback into plugin.sidebarRefreshCallbacks"
    - "onClose removes the refresh callback from plugin.sidebarRefreshCallbacks"
    - "render produces an h3 'MOC Tree' section followed by an h3 'Tags' section"
    - "Folder rows trigger this.app.workspace.getLeaf(false).openFile when clicking the folder's MOC.md if hasMoc is true"
    - "File rows trigger this.app.workspace.getLeaf(false).openFile on click"
    - "Tag rows trigger global-search openGlobalSearch with query 'tag:#<fullPath>' on click"
    - "Twirl click toggles expandedFolders / expandedTags Set membership and re-renders"
  artifacts:
    - path: "src/KBSidebarView.ts"
      provides: "Obsidian ItemView for KB Manager sidebar with MOC tree + tag hierarchy"
      exports: ["default KBSidebarView", "KB_SIDEBAR_VIEW_TYPE"]
  key_links:
    - from: "src/main.ts"
      to: "src/KBSidebarView.ts"
      via: "import KBSidebarView, { KB_SIDEBAR_VIEW_TYPE } from './KBSidebarView'"
      pattern: "from.*KBSidebarView"
---

<objective>
Build the Obsidian ItemView class that renders the MOC tree and tag hierarchy. Handles
expand/collapse state, click-to-open, and refresh subscription. Imports view-model
builders from Plan 07-01 to keep DOM logic dumb.

Output: src/KBSidebarView.ts.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-01-PLAN-pure-logic-sidebar-data.md

<interfaces>
import { ItemView, WorkspaceLeaf, TFile, setIcon, normalizePath } from 'obsidian';
import KBManagerPlugin from './main';
import { buildFolderTree, buildTagViewTree, FolderTreeNode, TagTreeViewNode, FileEntry } from './lib/sidebar-data';
import { isExcluded } from './lib/exclusions';

export const KB_SIDEBAR_VIEW_TYPE = 'kb-manager-sidebar';

export default class KBSidebarView extends ItemView { ... }
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create src/KBSidebarView.ts with ItemView class, render, refresh subscription, click handlers</name>
  <files>src/KBSidebarView.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts (current state — sidebarRefreshCallbacks Set added in Plan 07-03; here we just add the view that consumes it)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/sidebar-data.ts (Plan 07-01 — buildFolderTree + buildTagViewTree)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/TagManager.ts (getTagHierarchy, getFilesWithTag)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/VaultIndex.ts (getAllFolders, getFilesInFolder)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/exclusions.ts
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-CONTEXT.md (D-01..D-26 — full UI spec)
  </read_first>
  <action>
Create `src/KBSidebarView.ts`. Reference structure (you may inline subroutines or split per the file-size budget):

```typescript
import { ItemView, WorkspaceLeaf, TFile, setIcon, normalizePath } from 'obsidian';
import KBManagerPlugin from './main';
import {
  buildFolderTree,
  buildTagViewTree,
  FolderTreeNode,
  TagTreeViewNode,
  FileEntry,
} from './lib/sidebar-data';
import { isExcluded } from './lib/exclusions';

export const KB_SIDEBAR_VIEW_TYPE = 'kb-manager-sidebar';

export default class KBSidebarView extends ItemView {
  private refreshCallback: (() => void) | null = null;
  private expandedFolders = new Set<string>();
  private expandedTags = new Set<string>();

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
    if (this.refreshCallback) {
      this.plugin.sidebarRefreshCallbacks.delete(this.refreshCallback);
      this.refreshCallback = null;
    }
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement; // ItemView's content child
    container.empty();
    container.addClass('kb-manager-sidebar');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = '100%';

    this.renderMocSection(container);
    this.renderTagsSection(container);
  }

  // --- MOC Tree section ---

  private renderMocSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'kb-section kb-section-moc' });
    section.style.flex = '1 1 60%';
    section.style.overflowY = 'auto';
    section.style.borderBottom = '1px solid var(--background-modifier-border)';
    section.createEl('h3', { text: 'MOC Tree', cls: 'kb-section-header' });

    const folders = this.plugin.index.getAllFolders();
    const files = this.collectFilesByFolder(folders);
    const root = buildFolderTree(
      folders,
      files,
      this.plugin.settings.excludedPaths,
      (p) => this.plugin.settings.folderRules[p] ?? this.plugin.settings.defaultMocFormat,
      isExcluded,
    );
    if (root.childFolders.length === 0 && root.childFiles.length === 0) {
      const msg = section.createEl('p', { cls: 'kb-empty', text: 'No folders to index' });
      msg.style.color = 'var(--text-muted)';
      return;
    }
    const list = section.createDiv({ cls: 'kb-tree' });
    this.renderFolderNode(list, root, 0, /*isRoot=*/true);
  }

  private collectFilesByFolder(folders: string[]): Map<string, FileEntry[]> {
    const map = new Map<string, FileEntry[]>();
    for (const folder of folders) {
      const records = this.plugin.index.getFilesInFolder(folder);
      const entries: FileEntry[] = [];
      for (const r of records) {
        const file = this.plugin.app.vault.getAbstractFileByPath(r.path);
        if (!(file instanceof TFile)) continue;
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const kbManaged = cache?.frontmatter?.['kb-managed'] === true;
        const dot = file.name.lastIndexOf('.');
        const basename = dot === -1 ? file.name : file.name.slice(0, dot);
        entries.push({ path: r.path, basename, kbManaged });
      }
      map.set(folder, entries);
    }
    return map;
  }

  private renderFolderNode(parent: HTMLElement, node: FolderTreeNode, depth: number, isRoot: boolean): void {
    const isExpanded = isRoot || this.expandedFolders.has(node.path);
    const row = parent.createDiv({ cls: 'kb-row kb-row-folder' });
    row.style.paddingLeft = `${depth * 12}px`;
    row.style.cursor = 'pointer';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '4px';

    if (!isRoot) {
      const twirl = row.createSpan({ cls: 'kb-twirl' });
      setIcon(twirl, isExpanded ? 'chevron-down' : 'chevron-right');
      twirl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.toggleFolder(node.path);
      });
    }
    const nameLabel = isRoot ? 'Vault' : node.name;
    const label = row.createSpan({ cls: 'kb-label-folder', text: nameLabel });
    if (node.hasMoc) {
      row.addEventListener('click', () => this.openMocForFolder(node.path));
    } else {
      row.style.opacity = '0.7';
      row.title = 'Inline MOC mode — no MOC.md to open';
    }
    if (!isExpanded) return;
    for (const childFolder of node.childFolders) {
      this.renderFolderNode(parent, childFolder, depth + 1, /*isRoot=*/false);
    }
    for (const childFile of node.childFiles) {
      this.renderFileRow(parent, childFile.path, childFile.basename, depth + 1);
    }
  }

  private renderFileRow(parent: HTMLElement, filePath: string, basename: string, depth: number): void {
    const row = parent.createDiv({ cls: 'kb-row kb-row-file' });
    row.style.paddingLeft = `${depth * 12 + 16}px`;
    row.style.cursor = 'pointer';
    row.textContent = basename;
    row.addEventListener('click', () => this.openFileByPath(filePath));
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
    if (!(file instanceof TFile)) return;
    await this.plugin.app.workspace.getLeaf(false).openFile(file);
  }

  private toggleFolder(folderPath: string): void {
    if (this.expandedFolders.has(folderPath)) this.expandedFolders.delete(folderPath);
    else this.expandedFolders.add(folderPath);
    this.render();
  }

  // --- Tags section ---

  private renderTagsSection(parent: HTMLElement): void {
    const section = parent.createDiv({ cls: 'kb-section kb-section-tags' });
    section.style.flex = '1 1 40%';
    section.style.overflowY = 'auto';
    section.createEl('h3', { text: 'Tags', cls: 'kb-section-header' });

    const hierarchy = this.plugin.tagManager.getTagHierarchy();
    const tree = buildTagViewTree(hierarchy, (fullPath) => this.plugin.tagManager.getFilesWithTag(fullPath).length);
    if (tree.length === 0) {
      const msg = section.createEl('p', { cls: 'kb-empty', text: 'No tags found' });
      msg.style.color = 'var(--text-muted)';
      return;
    }
    const list = section.createDiv({ cls: 'kb-tree' });
    for (const node of tree) this.renderTagNode(list, node, 0);
  }

  private renderTagNode(parent: HTMLElement, node: TagTreeViewNode, depth: number): void {
    const isExpanded = this.expandedTags.has(node.fullPath);
    const hasChildren = node.children.length > 0;
    const row = parent.createDiv({ cls: 'kb-row kb-row-tag' });
    row.style.paddingLeft = `${depth * 12}px`;
    row.style.cursor = 'pointer';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '4px';

    if (hasChildren) {
      const twirl = row.createSpan({ cls: 'kb-twirl' });
      setIcon(twirl, isExpanded ? 'chevron-down' : 'chevron-right');
      twirl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.toggleTag(node.fullPath);
      });
    }
    const labelText = `${node.name} (${node.count})`;
    row.createSpan({ cls: 'kb-label-tag', text: labelText });
    row.addEventListener('click', () => this.openTagSearch(node.fullPath));

    if (!hasChildren || !isExpanded) return;
    for (const child of node.children) this.renderTagNode(parent, child, depth + 1);
  }

  private toggleTag(fullPath: string): void {
    if (this.expandedTags.has(fullPath)) this.expandedTags.delete(fullPath);
    else this.expandedTags.add(fullPath);
    this.render();
  }

  private openTagSearch(fullPath: string): void {
    const query = `tag:#${fullPath}`;
    const search = (this.plugin.app as any).internalPlugins?.getPluginById('global-search');
    const instance = search?.instance;
    if (instance && typeof instance.openGlobalSearch === 'function') {
      instance.openGlobalSearch(query);
      return;
    }
    // Fallback: log a warn so user knows search wasn't available.
    console.warn(`KB Manager: global-search plugin unavailable; cannot open tag search for ${query}`);
  }
}
```

Constraints:
- File ≤ 320 lines (target ~250). Project file size limit is <300; if you exceed, split
  into helpers but keep the public surface unchanged.
- Functions ≤ 30 lines each (split renderFolderNode helpers if needed)
- Nesting max 3 levels
- No console.log; one or two console.warn calls allowed (D-09 missing-MOC, missing global-search)
- All Obsidian imports come from 'obsidian'
- The `(this.plugin.app as any).internalPlugins` cast is necessary — Obsidian's TypeScript
  types don't expose internalPlugins; this is a known idiomatic escape hatch
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -5 && grep -c "extends ItemView" src/KBSidebarView.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "^export default class KBSidebarView extends ItemView" src/KBSidebarView.ts` outputs 1
    - `grep -c "^export const KB_SIDEBAR_VIEW_TYPE" src/KBSidebarView.ts` outputs 1
    - `grep "= 'kb-manager-sidebar'" src/KBSidebarView.ts` matches 1 line
    - `grep -c "getViewType" src/KBSidebarView.ts` outputs at least 1
    - `grep -c "getDisplayText" src/KBSidebarView.ts` outputs at least 1
    - `grep -c "getIcon" src/KBSidebarView.ts` outputs at least 1
    - `grep "'network'" src/KBSidebarView.ts` matches at least 1 line (icon name)
    - `grep "'KB Manager'" src/KBSidebarView.ts` matches at least 1 line (display text)
    - `grep -c "async onOpen" src/KBSidebarView.ts` outputs 1
    - `grep -c "async onClose" src/KBSidebarView.ts` outputs 1
    - `grep -c "sidebarRefreshCallbacks" src/KBSidebarView.ts` outputs at least 2 (add + delete)
    - `grep -c "buildFolderTree" src/KBSidebarView.ts` outputs at least 1
    - `grep -c "buildTagViewTree" src/KBSidebarView.ts` outputs at least 1
    - `grep -c "openFile" src/KBSidebarView.ts` outputs at least 2 (file row + folder MOC)
    - `grep -c "openGlobalSearch" src/KBSidebarView.ts` outputs at least 1
    - `grep "MOC Tree" src/KBSidebarView.ts` matches 1 line
    - `grep "Tags" src/KBSidebarView.ts` matches at least 1 line (section header)
    - `grep -c "console.log" src/KBSidebarView.ts` outputs 0
    - `wc -l src/KBSidebarView.ts` outputs ≤ 320
  </acceptance_criteria>
  <done>KBSidebarView extends ItemView with vertical-split layout. MOC tree and Tags hierarchy render with expand/collapse, click-to-open files / MOC.md / tag-search. Subscribes to plugin.sidebarRefreshCallbacks for SIDE-03 auto-refresh.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build
```
Expected: exit 0. Functional verification in Phase 7 manual UAT (Plan 07-03 verification block)
once main.ts wires the view registration and ribbon icon.
</verification>
