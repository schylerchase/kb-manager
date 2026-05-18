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
import { TagMutator, createTagMutator } from './lib/tag-mutator';
import { untagActiveFile } from './commands/untag-file';
import { deleteTagEverywhere } from './commands/delete-tag';
import { DeleteTagConfirmModal } from './commands/delete-tag-modal';
import { TagPickerModal } from './commands/tag-picker-modal';
import { previewRename, renameTagEverywhere } from './commands/rename-tag';
import { RenameTagModal } from './commands/rename-tag-modal';
import { computeTagStats, findCleanupCandidates } from './lib/tag-analytics';
import { TagStatsModal } from './commands/tag-stats-modal';
import { runBulkTagOps, type BulkSelector } from './commands/bulk-tag';
import { BulkTagModal } from './commands/bulk-tag-modal';
import { frontmatterToInlineForActiveFile, inlineToFrontmatterForActiveFile } from './commands/convert-tag-location';
import { evaluateRules } from './lib/tag-rules';
import { applyCleansePlan, buildCleansePlan } from './commands/cleanse-tags';
import { CleanseTagsModal } from './commands/cleanse-tags-modal';

const STATUS_IDLE = 'KB: idle';
const STATUS_PREVIEW = 'KB: preview';
const STATUS_REBUILDING = 'KB: rebuilding…';

export default class KBManagerPlugin extends Plugin {
  settings!: KBManagerSettings;
  index!: VaultIndex;
  mocGenerator!: MocGenerator;
  tocGenerator!: TocGenerator;
  tagManager!: TagManager;
  tagMutator!: TagMutator;
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
    // Race-suppression for tag mutations: pre-mark the file dirty BEFORE the
    // write so the rebuild scheduler sees fresh state on the next tick.
    // Avoids relying solely on Obsidian's modify event ordering.
    this.tagMutator = createTagMutator(
      this.app,
      {
        getFilesWithTag: (tag) => this.index.getFilesWithTag(tag),
        invalidateTags: (tags) => {
          this.index.invalidateTags(tags);
          void this.requestDirtyRebuild();
        },
      },
      (path) => this.index.markDirty(path),
    );
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
          this.addTagManagementCommands();
          this.noteCapture.addCommands(this);
          this.kbReminder.addCommands(this);
          this.addSidebarControls();
          // Intentionally NOT auto-opening the sidebar on enable. Any
          // setViewState call — even with active:false — is a workspace
          // mutation that on iPad closes an open settings modal. The user
          // can open the sidebar via the ribbon icon or command palette.
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

  async removeTagFromCurrentNote(tag: string): Promise<void> {
    const result = await untagActiveFile(
      {
        getActiveMarkdownFile: () => this.getActiveMarkdownFile(),
        readTagState: async (file) => {
          const metadata = this.app.metadataCache.getFileCache(file);
          const tagsValue = metadata?.frontmatter?.tags ?? metadata?.frontmatter?.tag;
          let content = '';
          try {
            content = await this.app.vault.cachedRead(file);
          } catch {
            content = '';
          }
          return { frontmatterTags: tagsValue, content };
        },
        mutator: this.tagMutator,
      },
      tag,
    );
    if (result.ok) {
      new Notice(`Removed #${result.tag}`);
    } else {
      new Notice(result.message);
    }
  }

  async deleteTagEverywhereWithConfirm(rawTag: string): Promise<void> {
    const tag = rawTag.replace(/^#/, '').trim();
    if (tag === '') {
      new Notice('Invalid tag.');
      return;
    }
    const count = this.index.getFilesWithTag(tag).length;
    if (count === 0) {
      new Notice(`No notes use #${tag}.`);
      return;
    }
    const modal = new DeleteTagConfirmModal(this.app, tag, count);
    modal.open();
    const confirmed = await modal.confirmed;
    if (!confirmed) return;
    const result = await deleteTagEverywhere(
      {
        mutator: this.tagMutator,
        countFilesWithTag: (t) => this.index.getFilesWithTag(t).length,
      },
      tag,
    );
    if (result.ok) {
      const errorSuffix = result.errors > 0 ? ` (${result.errors} error${result.errors === 1 ? '' : 's'})` : '';
      new Notice(`Removed #${result.tag} from ${result.filesChanged} note${result.filesChanged === 1 ? '' : 's'}${errorSuffix}`);
    } else {
      new Notice(result.message);
    }
  }

  private getActiveMarkdownFile(): TFile | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file ?? null;
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

  private addTagManagementCommands(): void {
    this.addCommand({
      id: 'delete-tag-everywhere',
      name: 'Delete tag everywhere…',
      callback: () => this.pickTagThen('Pick a tag to delete', (tag) => this.deleteTagEverywhereWithConfirm(tag)),
    });
    this.addCommand({
      id: 'rename-tag',
      name: 'Rename tag…',
      callback: () => this.pickTagThen('Pick a tag to rename', (tag) => this.renameTagWithConfirm(tag)),
    });
    this.addCommand({
      id: 'merge-tag-into',
      name: 'Merge tag into…',
      callback: () => this.pickTagThen('Pick the source tag to merge', (tag) => this.mergeTagWithConfirm(tag)),
    });
    this.addCommand({
      id: 'tag-stats',
      name: 'Show tag stats…',
      callback: () => this.pickTagThen('Pick a tag', (tag) => {
        const stats = this.buildTagStats(tag);
        if (!stats) {
          new Notice(`No notes use #${tag}.`);
          return;
        }
        new TagStatsModal(this.app, stats).open();
      }),
    });
    this.addCommand({
      id: 'bulk-tag-files',
      name: 'Bulk tag files…',
      callback: () => this.openBulkTagModal(),
    });
    this.addCommand({
      id: 'inline-to-frontmatter',
      name: 'Move inline tags to frontmatter (active note)',
      callback: () => void this.runInlineToFrontmatter(),
    });
    this.addCommand({
      id: 'frontmatter-to-inline',
      name: 'Move frontmatter tags to inline (active note)',
      callback: () => void this.runFrontmatterToInline(),
    });
    this.addCommand({
      id: 'cleanse-invalid-tags',
      name: 'Cleanse invalid tags across vault…',
      callback: () => void this.cleanseInvalidTagsWithConfirm(),
    });
  }

  async cleanseInvalidTagsWithConfirm(): Promise<void> {
    const cleanseHost = {
      mutator: this.tagMutator,
      getAllTagsWithCounts: () =>
        [...this.index.getTagTree().keys()].map((tag) => ({
          tag,
          noteCount: this.index.getFilesWithTag(tag).length,
        })),
    };
    const plan = buildCleansePlan(cleanseHost);
    const modal = new CleanseTagsModal(this.app, plan);
    modal.open();
    const confirmed = await modal.confirmed;
    if (!confirmed) return;
    if (plan.rewriteCount === 0) return;
    const result = await applyCleansePlan(cleanseHost, plan);
    const errorSuffix = result.errors > 0 ? ` (${result.errors} error${result.errors === 1 ? '' : 's'})` : '';
    new Notice(
      `Cleansed ${result.rewritten} tag${result.rewritten === 1 ? '' : 's'}, rewrote ${result.filesChanged} file${result.filesChanged === 1 ? '' : 's'}${errorSuffix}`,
    );
  }

  private pickTagThen(prompt: string, then: (tag: string) => void | Promise<void>): void {
    const allTags = [...this.index.getTagTree().keys()].sort();
    if (allTags.length === 0) {
      new Notice('No tags in the vault.');
      return;
    }
    new TagPickerModal(this.app, prompt, allTags, (tag) => {
      void then(tag);
    }).open();
  }

  private buildTagStats(tag: string) {
    const flatTagMap = new Map<string, string[]>();
    for (const t of this.index.getTagTree().keys()) {
      flatTagMap.set(t, this.index.getFilesWithTag(t));
    }
    return computeTagStats(tag, {
      flatTagMap,
      folderForPath: (p) => p.split('/').slice(0, -1).join('/') || '/',
    });
  }

  async renameTagWithConfirm(fromTag: string): Promise<void> {
    const tag = fromTag.replace(/^#/, '').trim();
    if (tag === '') {
      new Notice('Invalid tag.');
      return;
    }
    const count = this.index.getFilesWithTag(tag).length;
    if (count === 0) {
      new Notice(`No notes use #${tag}.`);
      return;
    }
    const modal = new RenameTagModal(this.app, tag, count, async (destination) => {
      return previewRename(
        {
          mutator: this.tagMutator,
          countFilesWithTag: (t) => this.index.getFilesWithTag(t).length,
          tagExists: (t) => this.index.getFilesWithTag(t).length > 0,
        },
        tag,
        destination,
      );
    });
    modal.open();
    const result = await modal.result;
    if (!result.confirmed || result.destination === '') return;
    const out = await renameTagEverywhere(
      {
        mutator: this.tagMutator,
        countFilesWithTag: (t) => this.index.getFilesWithTag(t).length,
        tagExists: (t) => this.index.getFilesWithTag(t).length > 0,
      },
      tag,
      result.destination,
    );
    if (out.ok) {
      const verb = out.mergedIntoExisting ? 'Merged' : 'Renamed';
      new Notice(`${verb} #${out.from} → #${out.to} across ${out.filesChanged} note${out.filesChanged === 1 ? '' : 's'}`);
    } else {
      new Notice(out.message);
    }
  }

  async mergeTagWithConfirm(fromTag: string): Promise<void> {
    const tag = fromTag.replace(/^#/, '').trim();
    if (tag === '') {
      new Notice('Invalid tag.');
      return;
    }
    const allTags = [...this.index.getTagTree().keys()].filter((t) => t !== tag).sort();
    if (allTags.length === 0) {
      new Notice('No other tags to merge into.');
      return;
    }
    new TagPickerModal(this.app, `Merge #${tag} into…`, allTags, (target) => {
      void (async () => {
        const out = await renameTagEverywhere(
          {
            mutator: this.tagMutator,
            countFilesWithTag: (t) => this.index.getFilesWithTag(t).length,
            tagExists: (t) => this.index.getFilesWithTag(t).length > 0,
          },
          tag,
          target,
        );
        if (out.ok) {
          new Notice(`Merged #${out.from} → #${out.to} (${out.filesChanged} note${out.filesChanged === 1 ? '' : 's'})`);
        } else {
          new Notice(out.message);
        }
      })();
    }).open();
  }

  private openBulkTagModal(): void {
    const allTags = [...this.index.getTagTree().keys()].sort();
    const modal = new BulkTagModal(this.app, allTags, async (selector) => {
      const files = this.resolveBulkSelector(selector);
      return files.length;
    });
    modal.open();
    void modal.result.then(async (result) => {
      if (!result.confirmed) return;
      const out = await runBulkTagOps(
        {
          mutator: this.tagMutator,
          resolveSelector: (sel) => this.resolveBulkSelector(sel),
        },
        result.selector,
        result.ops,
      );
      if (out.ok) {
        new Notice(`Bulk tag complete: ${out.filesChanged}/${out.filesScanned} files changed`);
      } else {
        new Notice(out.message);
      }
    });
  }

  private resolveBulkSelector(selector: BulkSelector): TFile[] {
    if (selector.kind === 'folder') {
      const prefix = selector.path === '' ? '' : selector.path.endsWith('/') ? selector.path : `${selector.path}/`;
      return this.app.vault.getMarkdownFiles().filter((f) => prefix === '' || f.path === selector.path || f.path.startsWith(prefix));
    }
    if (selector.kind === 'tag') {
      const paths = this.index.getFilesWithTag(selector.tag);
      const result: TFile[] = [];
      for (const p of paths) {
        const file = this.app.vault.getAbstractFileByPath(p);
        if (file instanceof TFile) result.push(file);
      }
      return result;
    }
    const result: TFile[] = [];
    for (const p of selector.paths) {
      const file = this.app.vault.getAbstractFileByPath(p);
      if (file instanceof TFile) result.push(file);
    }
    return result;
  }

  private async runInlineToFrontmatter(): Promise<void> {
    const out = await inlineToFrontmatterForActiveFile({
      mutator: this.tagMutator,
      getActiveMarkdownFile: () => this.getActiveMarkdownFile(),
    });
    if (out.ok) {
      new Notice(out.filesChanged > 0 ? 'Moved inline tags to frontmatter' : 'No inline tags to move');
    } else {
      new Notice(out.message);
    }
  }

  private async runFrontmatterToInline(): Promise<void> {
    const out = await frontmatterToInlineForActiveFile({
      mutator: this.tagMutator,
      getActiveMarkdownFile: () => this.getActiveMarkdownFile(),
    });
    if (out.ok) {
      new Notice(out.filesChanged > 0 ? 'Moved frontmatter tags to inline' : 'No frontmatter tags to move');
    } else {
      new Notice(out.message);
    }
  }

  /** Called by vault create/modify listeners. Applies any matching tag rules. */
  private async applyTagRules(file: TFile, trigger: 'on-create' | 'on-modify'): Promise<void> {
    const rules = this.settings.tagRules ?? [];
    if (rules.length === 0) return;
    const evaluation = evaluateRules(rules, { filePath: file.path, trigger }, (rule, error) => {
      console.warn(`KB Manager: tag-rule "${rule.name}" failed:`, error.message);
    });
    if (evaluation.tagsToAdd.length === 0) return;
    await this.tagMutator.bulkApply([file], evaluation.tagsToAdd.map((tag) => ({ kind: 'add', tag })));
  }

  /** Open the fuzzy tag picker — sidebar toolbar entry point. */
  openTagPicker(prompt: string, tags: string[], onPick: (tag: string) => void): void {
    new TagPickerModal(this.app, prompt, tags, onPick).open();
  }

  /** Open the bulk-tag modal — sidebar toolbar entry point. */
  openBulkTagModalPublic(): void {
    this.openBulkTagModal();
  }

  /** Open Obsidian settings, scrolled to KB Manager — sidebar Rules button. */
  openTagRulesSettings(): void {
    const setting = (this.app as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
    setting?.open?.();
    setting?.openTabById?.(this.manifest.id);
  }

  /** Direct merge (no picker modal) — used by the Review-tab cleanup buttons. */
  async mergeTagsDirectly(from: string, into: string): Promise<void> {
    const out = await renameTagEverywhere(
      {
        mutator: this.tagMutator,
        countFilesWithTag: (t) => this.index.getFilesWithTag(t).length,
        tagExists: (t) => this.index.getFilesWithTag(t).length > 0,
      },
      from,
      into,
    );
    if (out.ok) {
      new Notice(`Merged #${out.from} → #${out.to} (${out.filesChanged} note${out.filesChanged === 1 ? '' : 's'})`);
    } else {
      new Notice(out.message);
    }
  }

  /** Sidebar uses this so it can construct and open the modal in one call. */
  buildTagStatsForMenu(tag: string): TagStatsModal | null {
    const stats = this.buildTagStats(tag);
    return stats ? new TagStatsModal(this.app, stats) : null;
  }

  /** Surface cleanup candidates (orphan + near-duplicate tags). Used by Review tab. */
  getTagCleanupCandidates() {
    const flatTagMap = new Map<string, string[]>();
    for (const t of this.index.getTagTree().keys()) {
      flatTagMap.set(t, this.index.getFilesWithTag(t));
    }
    return findCleanupCandidates({ flatTagMap });
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

  private async activateSidebar(focus = true): Promise<void> {
    const first = this.app.workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE)[0];
    if (first) {
      if (focus) this.app.workspace.revealLeaf(first);
      return;
    }
    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (rightLeaf) await rightLeaf.setViewState({ type: KB_SIDEBAR_VIEW_TYPE, active: focus });
  }

  private openSidebarOnFirstLoad(): void {
    if (this.app.workspace.getLeavesOfType(KB_SIDEBAR_VIEW_TYPE).length > 0) return;
    // Attach the view without stealing focus. Activating the leaf during
    // plugin enable dismisses any open settings modal because Obsidian
    // closes modals when an unrelated leaf is set active.
    this.activateSidebar(false).catch(err => console.error('KB Manager: initial sidebar open failed', err));
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
        if (!(file instanceof TFile)) return;
        this.index.markDirty(file.path);
        void this.applyTagRules(file, 'on-modify').catch((err) =>
          console.error('KB Manager: tag rules on-modify failed', err),
        );
      })
    );
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (!(file instanceof TFile)) return;
        this.index.markDirty(file.path);
        this.noteCapture
          .initializeCreatedNote(file, this.settings.initializeNoteProperties, this.settings.excludedPaths)
          .catch(err => console.error('KB Manager: initialize note properties failed', err));
        void this.applyTagRules(file, 'on-create').catch((err) =>
          console.error('KB Manager: tag rules on-create failed', err),
        );
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
