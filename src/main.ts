import { Editor, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { KBManagerSettings, DEFAULT_SETTINGS, KBSettingsTab } from 'settings';
import KBSidebarView, { KB_SIDEBAR_VIEW_TYPE } from './KBSidebarView';
import MocGenerator from './MocGenerator';
import TagManager from './TagManager';
import TocGenerator from './TocGenerator';
import VaultIndex from './VaultIndex';
import { buildDelimiter, isWriteSafe, type DelimiterType } from './lib/delimiter';

const STATUS_IDLE = 'KB: idle';
const STATUS_PREVIEW = 'KB: preview';
const STATUS_REBUILDING = 'KB: rebuilding…';

export default class KBManagerPlugin extends Plugin {
  settings!: KBManagerSettings;
  index!: VaultIndex;
  mocGenerator!: MocGenerator;
  tocGenerator!: TocGenerator;
  tagManager!: TagManager;
  sidebarRefreshCallbacks: Set<() => void> = new Set();

  private schedulerHandle: number | null = null;
  private rebuildLock: Promise<void> | null = null;
  private queuedManualRebuild: Promise<void> | null = null;
  private statusBarItem: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.index = new VaultIndex(this.app, this.settings.excludedPaths);
    this.tagManager = new TagManager(this.index);
    this.mocGenerator = new MocGenerator(this.app, this.index, this.settings);
    this.tocGenerator = new TocGenerator(this.app, this.index, this.settings);
    this.registerView(KB_SIDEBAR_VIEW_TYPE, leaf => new KBSidebarView(leaf, this));

    this.addSettingTab(new KBSettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.statusBarItem = this.addStatusBarItem();
      this.statusBarItem.setText(this.statusText());
      this.registerVaultEvents();
      this.index.onRebuildComplete = () => this.runGenerators();

      this.runWithLock(() => this.index.rebuild())
        .catch(err => console.error('KB Manager: initial rebuild failed', err))
        .finally(() => {
          this.startScheduler();
          this.addManualRebuildControls();
          this.addInsertCommands();
          this.addSidebarControls();
          this.openSidebarOnFirstLoad();
        });
    });
  }

  onunload(): void {
    this.stopScheduler();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  restartScheduler(): void {
    this.stopScheduler();
    this.startScheduler();
  }

  async runManualRebuild(): Promise<void> {
    if (this.rebuildLock) {
      this.queuedManualRebuild ??= this.queueManualRebuild();
      await this.queuedManualRebuild;
      return;
    }
    await this.runWithLock(() => this.index.rebuild());
  }

  private startScheduler(): void {
    this.stopScheduler();
    const intervalMs = this.settings.updateIntervalMinutes * 60_000;
    this.schedulerHandle = window.setInterval(() => {
      this.runScheduledTick().catch(err =>
        console.error('KB Manager: scheduled tick failed', err)
      );
    }, intervalMs);
    this.registerInterval(this.schedulerHandle);
  }

  private stopScheduler(): void {
    if (this.schedulerHandle === null) return;
    clearInterval(this.schedulerHandle);
    this.schedulerHandle = null;
  }

  private async runScheduledTick(): Promise<void> {
    if (this.rebuildLock) return;
    await this.runWithLock(() => this.index.rebuildDirty());
  }

  private async queueManualRebuild(): Promise<void> {
    const activeRebuild = this.rebuildLock;
    try {
      if (activeRebuild) await this.awaitActiveRebuild(activeRebuild);
      await this.runWithLock(() => this.index.rebuild());
    } finally {
      this.queuedManualRebuild = null;
    }
  }

  private async awaitActiveRebuild(activeRebuild: Promise<void>): Promise<void> {
    try {
      await activeRebuild;
    } catch {
      // The owner logs the failing rebuild; queued manual work should still run.
    }
  }

  private async runWithLock(work: () => Promise<void>): Promise<void> {
    if (this.rebuildLock) await this.awaitActiveRebuild(this.rebuildLock);
    this.statusBarItem?.setText(STATUS_REBUILDING);
    const current = this.runLockedWork(work);
    this.rebuildLock = current;
    try {
      await current;
    } finally {
      if (this.rebuildLock === current) this.rebuildLock = null;
    }
  }

  private async runLockedWork(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } finally {
      this.statusBarItem?.setText(this.statusText());
    }
  }

  private addManualRebuildControls(): void {
    this.addRibbonIcon('rotate-cw', 'KB Manager: Rebuild now', () => {
      this.triggerManualRebuild();
    });
    this.addCommand({
      id: 'kb-manager-rebuild',
      name: 'KB Manager: Rebuild now',
      callback: () => { this.triggerManualRebuild(); },
    });
  }

  private addInsertCommands(): void {
    this.addCommand({
      id: 'kb-manager-insert-moc',
      name: 'KB Manager: Insert MOC here',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.insertSectionAtCursor(editor, view, 'moc');
      },
    });
    this.addCommand({
      id: 'kb-manager-insert-toc',
      name: 'KB Manager: Insert note TOC here',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.insertSectionAtCursor(editor, view, 'toc');
      },
    });
  }

  private addSidebarControls(): void {
    this.addRibbonIcon('network', 'KB Manager: Open sidebar', () => {
      this.activateSidebar().catch(err => console.error('KB Manager: activateSidebar failed', err));
    });
    this.addCommand({
      id: 'kb-manager-open-sidebar',
      name: 'KB Manager: Open sidebar',
      callback: () => {
        this.activateSidebar().catch(err => console.error('KB Manager: activateSidebar failed', err));
      },
    });
  }

  private async triggerManualRebuild(): Promise<void> {
    try {
      await this.runManualRebuild();
      const message = this.settings.generatedWritesEnabled
        ? 'KB Manager: rebuild complete'
        : 'KB Manager: preview refreshed - generated writes are off';
      new Notice(message);
    } catch (err) {
      console.error('KB Manager: manual rebuild failed', err);
      new Notice('KB Manager: rebuild failed — see console');
    }
  }

  private async runGenerators(): Promise<void> {
    if (!this.settings.generatedWritesEnabled) {
      this.notifySidebarRefresh();
      return;
    }
    await this.mocGenerator.run();
    await this.tocGenerator.run();
    this.notifySidebarRefresh();
  }

  private statusText(): string {
    return this.settings.generatedWritesEnabled ? STATUS_IDLE : STATUS_PREVIEW;
  }

  private insertSectionAtCursor(editor: Editor, view: MarkdownView, type: DelimiterType): void {
    if (!view.file) return;
    if (isWriteSafe(editor.getValue(), type)) {
      new Notice(`KB Manager: ${this.sectionLabel(type)} delimiters already present`);
      return;
    }
    const startDelim = buildDelimiter(type, 'start');
    const endDelim = buildDelimiter(type, 'end');
    editor.replaceRange(`${startDelim}\n${this.pendingSectionText(type)}\n${endDelim}\n`, editor.getCursor());
    new Notice(`KB Manager: ${this.sectionLabel(type)} placeholder inserted. Run rebuild to populate it.`);
  }

  private sectionLabel(type: DelimiterType): string {
    return type === 'toc' ? 'note TOC' : 'MOC';
  }

  private pendingSectionText(type: DelimiterType): string {
    if (type === 'toc') {
      return '_KB Manager will replace this with links to headings in this note after rebuild._';
    }
    return '<!-- pending rebuild -->';
  }

  private async activateSidebar(): Promise<void> {
    const first = this.app.workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE)[0];
    if (first) {
      this.app.workspace.revealLeaf(first);
      return;
    }
    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (rightLeaf) await rightLeaf.setViewState({ type: KB_SIDEBAR_VIEW_TYPE, active: true });
  }

  private openSidebarOnFirstLoad(): void {
    if (this.app.workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE).length > 0) return;
    this.activateSidebar().catch(err => console.error('KB Manager: initial sidebar open failed', err));
  }

  private notifySidebarRefresh(): void {
    for (const callback of this.sidebarRefreshCallbacks) {
      try {
        callback();
      } catch (err) {
        console.error('KB Manager: sidebar refresh callback failed', err);
      }
    }
  }

  private registerVaultEvents(): void {
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile) this.index.markDirty(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile) this.index.markDirty(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.index.remove(oldPath);
        if (file instanceof TFile) this.index.markDirty(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile) this.index.remove(file.path);
      })
    );
  }
}
