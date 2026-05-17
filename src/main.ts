import { Editor, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { KBManagerSettings, DEFAULT_SETTINGS, KBSettingsTab } from 'settings';
import KBSidebarView, { KB_SIDEBAR_VIEW_TYPE } from './KBSidebarView';
import KBReminder from './KBReminder';
import MocGenerator from './MocGenerator';
import NoteCapture from './NoteCapture';
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
  noteCapture!: NoteCapture;
  kbReminder!: KBReminder;
  sidebarRefreshCallbacks: Set<() => void> = new Set();

  private schedulerHandle: number | null = null;
  private rebuildLock: Promise<void> | null = null;
  private queuedManualRebuild: Promise<void> | null = null;
  private statusBarItem: HTMLElement | null = null;
  /** Set true in onunload so deferred work (vault writes, generators) can bail. */
  unloaded = false;
  /**
   * Paths whose vault.rename event fired but whose MetadataCache hasn't yet
   * resolved at the new path. The metadataCache 'changed' listener re-marks
   * them dirty so the next rebuildDirty picks up fresh tags/headings instead
   * of recording empty values.
   */
  private metadataAwaitingRename: Set<string> = new Set();

  async onload(): Promise<void> {
    await this.loadSettings();

    // Pass a getter so the index always sees the live excludedPaths array —
    // settings tab reassigns the field, so a cached reference goes stale.
    this.index = new VaultIndex(this.app, () => this.settings.excludedPaths);
    this.tagManager = new TagManager(this.index);
    const isUnloaded = () => this.unloaded;
    this.noteCapture = new NoteCapture(
      this.app,
      this.index,
      this.tagManager,
      () => this.requestDirtyRebuild(),
    );
    this.kbReminder = new KBReminder(this.app, this.settings);
    this.mocGenerator = new MocGenerator(this.app, this.index, this.settings, isUnloaded);
    this.tocGenerator = new TocGenerator(this.app, this.index, this.settings, isUnloaded);
    this.registerView(KB_SIDEBAR_VIEW_TYPE, leaf => new KBSidebarView(leaf, this));

    this.addSettingTab(new KBSettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      // Plugin could have been disabled before layoutReady fires on a slow-
      // loading vault. Bail so we don't register commands / start timers on
      // a dead instance.
      if (this.unloaded) return;
      this.statusBarItem = this.addStatusBarItem();
      this.statusBarItem.setText(this.statusText());
      this.registerVaultEvents();
      this.index.onRebuildComplete = () => this.runGenerators();

      this.runWithLock(() => this.index.rebuild())
        .catch(err => console.error('KB Manager: initial rebuild failed', err))
        .finally(() => {
          if (this.unloaded) return;
          this.startScheduler();
          this.addManualRebuildControls();
          this.addInsertCommands();
          this.noteCapture.addCommands(this);
          this.kbReminder.addCommands(this);
          this.addSidebarControls();
          this.openSidebarOnFirstLoad();
        });
    });
  }

  onunload(): void {
    this.unloaded = true;
    this.stopScheduler();
  }

  /**
   * Public entry for components that need a dirty-rebuild. Every call queues
   * its own rebuild through runWithLock's FIFO so caller-side ordering is
   * preserved: after `await requestDirtyRebuild()` the caller's prior
   * markDirty IS reflected in the index.
   *
   * Duplicate calls in a burst are cheap: rebuildDirty early-exits when
   * dirty is empty AND derivedMaps are clean, so it does not trigger a
   * spurious onRebuildComplete / generator pass.
   *
   * (Coalescing via a shared in-flight promise was tried but corrupted the
   * caller contract: a second markDirty that landed AFTER an in-flight
   * rebuild snapshotted but BEFORE it completed would silently be coalesced
   * onto the snapshotted rebuild — leaving the dirty path unindexed until
   * the next scheduler tick.)
   */
  requestDirtyRebuild(): Promise<void> {
    if (this.unloaded) return Promise.resolve();
    return this.runWithLock(() => this.index.rebuildDirty());
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

  createNoteFromPrompt(folderPath: string, tags: string[] = []): void {
    this.noteCapture.createNoteFromPrompt(folderPath, tags);
  }

  promptAddTagsToNote(filePath: string): void {
    this.noteCapture.promptAddTagsToNote(filePath);
  }

  async addTagsToCurrentNote(tags: string[]): Promise<void> {
    await this.noteCapture.addTagsToCurrentNote(tags);
  }

  async createKbUpdateReminder(scopePath: string): Promise<void> {
    await this.kbReminder.createUpdateReminder(scopePath);
  }

  openReminderManager(): void {
    this.kbReminder.openReminderManager();
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
    if (this.unloaded) return;
    // Route through the same coalescing path as note-capture so we don't
    // queue a duplicate dirty rebuild on top of an in-flight one.
    await this.requestDirtyRebuild();
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
    // FIFO queue: chain onto the current tail so two concurrent callers
    // serialize instead of both racing past the same await and overwriting
    // the lock. Previous implementation used `if (rebuildLock) await ...`
    // which let parallel callers proceed simultaneously.
    const previous = this.rebuildLock ?? Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      this.statusBarItem?.setText(STATUS_REBUILDING);
      try {
        await work();
      } finally {
        this.statusBarItem?.setText(this.statusText());
      }
    });
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
      id: 'rebuild',
      name: 'Rebuild now',
      callback: () => { this.triggerManualRebuild(); },
    });
  }

  private addInsertCommands(): void {
    this.addCommand({
      id: 'insert-moc',
      name: 'Insert MOC here',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.insertSectionAtCursor(editor, view, 'moc');
      },
    });
    this.addCommand({
      id: 'insert-toc',
      name: 'Insert note TOC here',
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
      id: 'open-sidebar',
      name: 'Open sidebar',
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
    if (this.unloaded) return;
    if (!this.settings.generatedWritesEnabled) {
      this.notifySidebarRefresh();
      return;
    }
    await this.mocGenerator.run();
    if (this.unloaded) return;
    await this.tocGenerator.run();
    if (this.unloaded) return;
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
        if (!(file instanceof TFile)) return;
        this.index.markDirty(file.path);
        this.noteCapture
          .initializeCreatedNote(file, this.settings.initializeNoteProperties, this.settings.excludedPaths)
          .catch(err => console.error('KB Manager: initialize note properties failed', err));
      })
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.index.remove(oldPath);
        if (file instanceof TFile) {
          this.index.markDirty(file.path);
          // Obsidian's MetadataCache often lags behind a rename — the next
          // rebuildDirty would index the file with empty tags/headings.
          // Mark it as awaiting so we re-mark dirty when cache catches up.
          this.metadataAwaitingRename.add(file.path);
        }
      })
    );
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        if (!(file instanceof TFile)) return;
        if (!this.metadataAwaitingRename.delete(file.path)) return;
        this.index.markDirty(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile) this.index.remove(file.path);
      })
    );
  }
}
