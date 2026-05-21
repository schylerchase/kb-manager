import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { DebouncedRebuild } from 'lib/debounced-rebuild';
import { parseFolderRulesWithDiagnostics, parseExclusionPatterns } from 'lib/settings-parser';
import type { TagRule } from 'lib/tag-rules';

export interface KBManagerSettings {
  generatedWritesEnabled: boolean;
  initializeNoteProperties: boolean;
  updateIntervalMinutes: number;
  kbReviewReminderDays: number;
  kbReviewTaskPath: string;
  autoInject: boolean;
  excludedPaths: string[];
  defaultMocFormat: 'dedicated' | 'inline';
  folderRules: Record<string, 'dedicated' | 'inline'>;
  tagRules: TagRule[];
  ignoredTagCleanupCandidates: string[];
  rebuildRibbonIconIndex: number | null;
  sidebarRibbonIconIndex: number | null;
}

export const DEFAULT_SETTINGS: KBManagerSettings = {
  generatedWritesEnabled: false,
  initializeNoteProperties: true,
  updateIntervalMinutes: 5,
  kbReviewReminderDays: 7,
  kbReviewTaskPath: 'KB Updates.md',
  autoInject: false,
  excludedPaths: [],
  defaultMocFormat: 'dedicated',
  folderRules: {},
  tagRules: [],
  ignoredTagCleanupCandidates: [],
  rebuildRibbonIconIndex: null,
  sidebarRibbonIconIndex: null,
};

type SettingsHost = {
  settings: KBManagerSettings;
  saveSettings(): Promise<void>;
  restartScheduler(): void;
  runManualRebuild(): Promise<void>;
};

export class KBSettingsTab extends PluginSettingTab {
  private formatRebuild: DebouncedRebuild;

  constructor(app: App, private plugin: SettingsHost) {
    super(app, plugin as never);
    this.formatRebuild = new DebouncedRebuild(
      () => this.plugin.runManualRebuild(),
      err => console.error('KB Manager: format-change rebuild failed', err),
    );
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.buildGeneralSection(containerEl);
    this.buildExclusionsSection(containerEl);
    this.buildMocFormatSection(containerEl);
    this.buildTagCleanupSection(containerEl);
    this.buildTagRulesSection(containerEl);
  }

  hide(): void {
    this.formatRebuild.flush();
  }

  /**
   * Debounced rebuild trigger for MOC format / rule edits. Textarea typing
   * fires onChange per keystroke, so we coalesce into one rebuild ~600ms
   * after the user stops typing. Without this, generated MOC/INDEX output
   * stays in the old format until the user manually rebuilds or edits a
   * note (no dirty paths → scheduler tick early-exits).
   */
  private scheduleFormatRebuild(): void {
    this.formatRebuild.schedule();
  }

  private buildGeneralSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Generated content writes')
      .setDesc(
        'Off by default. Preview the MOC tree and tags without creating MOC.md, INDEX.md, or updating managed sections.'
      )
      .addToggle(t =>
        t
          .setValue(this.plugin.settings.generatedWritesEnabled)
          .onChange(async v => {
            this.plugin.settings.generatedWritesEnabled = v;
            try {
              await this.plugin.saveSettings();
              if (v) await this.plugin.runManualRebuild();
            } catch (err) {
              console.error('KB Manager: failed to save settings', err);
            }
          })
      );

    new Setting(containerEl)
      .setName('Initialize note properties')
      .setDesc(
        'Adds tags, status, and created properties to new notes that do not already have frontmatter. Existing property values are preserved.'
      )
      .addToggle(t =>
        t
          .setValue(this.plugin.settings.initializeNoteProperties)
          .onChange(async v => {
            this.plugin.settings.initializeNoteProperties = v;
            try { await this.plugin.saveSettings(); } catch (err) { console.error('KB Manager: failed to save settings', err); }
          })
      );

    new Setting(containerEl)
      .setName('Update interval')
      .setDesc(
        'How often KB Manager refreshes its index and, when writes are enabled, updates generated content. Range: 1–60 minutes.'
      )
      .addSlider(s =>
        s
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.updateIntervalMinutes)
          .setDynamicTooltip()
          .onChange(async v => {
            this.plugin.settings.updateIntervalMinutes = v;
            try {
              await this.plugin.saveSettings();
              this.plugin.restartScheduler();
            } catch (err) {
              console.error('KB Manager: failed to save settings', err);
            }
          })
      );

    new Setting(containerEl)
      .setName('KB update reminder')
      .setDesc('Days from now for reminders created from the KB Manager Review tab.')
      .addSlider(s =>
        s
          .setLimits(1, 30, 1)
          .setValue(this.plugin.settings.kbReviewReminderDays)
          .setDynamicTooltip()
          .onChange(async v => {
            this.plugin.settings.kbReviewReminderDays = v;
            try { await this.plugin.saveSettings(); } catch (err) { console.error('KB Manager: failed to save settings', err); }
          })
      );

    new Setting(containerEl)
      .setName('KB update task file')
      .setDesc('Fallback note used when Quick Reminder is not loaded.')
      .addText(t =>
        t
          .setPlaceholder('KB Updates.md')
          .setValue(this.plugin.settings.kbReviewTaskPath)
          .onChange(async v => {
            this.plugin.settings.kbReviewTaskPath = v.trim() || 'KB Updates.md';
            try { await this.plugin.saveSettings(); } catch (err) { console.error('KB Manager: failed to save settings', err); }
          })
      );

    new Setting(containerEl)
      .setName('Auto-injection')
      .setDesc(
        'When writes are enabled, automatically injects MOC sections into all notes in folders configured for inline format. Disabled by default.'
      )
      .addToggle(t =>
        t
          .setValue(this.plugin.settings.autoInject)
          .onChange(async v => {
            this.plugin.settings.autoInject = v;
            try { await this.plugin.saveSettings(); } catch (err) { console.error('KB Manager: failed to save settings', err); }
          })
      );
  }

  private buildExclusionsSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Exclusions' });

    new Setting(containerEl)
      .setName('Exclusion patterns')
      .setDesc(
        'Folders and files to skip entirely — no indexing, no MOC or TOC writes. One name per line. A pattern matches any path segment: "templates" excludes notes/templates/foo.md and templates/bar.md.'
      )
      .addTextArea(ta =>
        ta
          .setPlaceholder('templates\narchive\ndaily-notes')
          .setValue(this.plugin.settings.excludedPaths.join('\n'))
          .onChange(async v => {
            this.plugin.settings.excludedPaths = parseExclusionPatterns(v);
            try {
              await this.plugin.saveSettings();
              // Trigger a full rebuild so newly-excluded files are dropped
              // from the index (rebuildDirty only touches modified paths).
              await this.plugin.runManualRebuild();
            } catch (err) {
              console.error('KB Manager: failed to save settings', err);
            }
          })
      );
  }

  private buildMocFormatSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'MOC Format' });

    new Setting(containerEl)
      .setName('Default MOC format')
      .setDesc(
        'How MOC content is planned when no per-folder rule applies. Dedicated writes create MOC.md files; inline writes update notes with delimiter markers.'
      )
      .addDropdown(dd =>
        dd
          .addOption('dedicated', 'Dedicated file')
          .addOption('inline', 'Inline injection')
          .setValue(this.plugin.settings.defaultMocFormat)
          .onChange(async v => {
            if (v !== 'dedicated' && v !== 'inline') return;
            this.plugin.settings.defaultMocFormat = v;
            try {
              await this.plugin.saveSettings();
              this.scheduleFormatRebuild();
            } catch (err) { console.error('KB Manager: failed to save settings', err); }
          })
      );

    new Setting(containerEl)
      .setName('Per-folder rules')
      .setDesc(
        "Override the default MOC format for specific folders. One rule per line. Lines that don't match the expected format are ignored."
      )
      .addTextArea(ta =>
        ta
          .setPlaceholder('notes/projects = inline\ndailies = dedicated')
          .setValue(
            Object.entries(this.plugin.settings.folderRules)
              .map(([k, v]) => `${k} = ${v}`)
              .join('\n')
          )
          .onChange(async v => {
            const { rules, collisions } = parseFolderRulesWithDiagnostics(v);
            this.plugin.settings.folderRules = rules;
            try {
              await this.plugin.saveSettings();
              this.scheduleFormatRebuild();
              if (collisions.length > 0) {
                new Notice(
                  `KB Manager: duplicate folder rule(s) — last value wins for: ${collisions.join(', ')}`,
                  8000,
                );
              }
            } catch (err) { console.error('KB Manager: failed to save settings', err); }
          })
      );
  }

  private buildTagCleanupSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Tag Cleanup' });
    const ignoredCount = this.plugin.settings.ignoredTagCleanupCandidates.length;

    new Setting(containerEl)
      .setName('Ignored suggestions')
      .setDesc(`${ignoredCount} ignored cleanup suggestion${ignoredCount === 1 ? '' : 's'}.`)
      .addButton(btn =>
        btn
          .setButtonText('Clear ignored')
          .setDisabled(ignoredCount === 0)
          .onClick(async () => {
            this.plugin.settings.ignoredTagCleanupCandidates = [];
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }

  private buildTagRulesSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Tag Rules' });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Automatically add tags to notes that match a folder prefix or path regex. Rules fire on note create and on modify.',
    });

    const list = containerEl.createDiv({ cls: 'kb-tag-rules-list' });
    const renderRules = (): void => {
      list.empty();
      const rules = this.plugin.settings.tagRules ?? [];
      if (rules.length === 0) {
        list.createEl('p', { cls: 'kb-empty', text: 'No rules yet.' });
      } else {
        rules.forEach((rule, idx) => this.renderRuleCard(list, rule, idx, renderRules));
      }
    };
    renderRules();

    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText('Add rule')
          .setCta()
          .onClick(async () => {
            const rules = this.plugin.settings.tagRules ?? [];
            rules.push({
              id: `r${Date.now().toString(36)}`,
              name: 'New rule',
              enabled: true,
              trigger: 'on-create',
              match: { folderPath: '' },
              action: { addTags: [] },
            });
            this.plugin.settings.tagRules = rules;
            await this.plugin.saveSettings();
            renderRules();
          }),
      );
  }

  private renderRuleCard(parent: HTMLElement, rule: TagRule, index: number, refresh: () => void): void {
    const card = parent.createDiv({ cls: 'kb-tag-rule-card' });
    if (!rule.enabled) card.addClass('is-disabled');

    const header = card.createDiv({ cls: 'kb-tag-rule-header' });
    const nameInput = header.createEl('input', { type: 'text', cls: 'kb-tag-rule-name' });
    nameInput.value = rule.name;
    nameInput.placeholder = 'Rule name';
    nameInput.addEventListener('change', async () => {
      rule.name = nameInput.value;
      await this.plugin.saveSettings();
    });

    const enabledToggle = header.createEl('input', { type: 'checkbox' });
    enabledToggle.checked = rule.enabled;
    enabledToggle.title = 'Enable / disable rule';
    enabledToggle.addEventListener('change', async () => {
      rule.enabled = enabledToggle.checked;
      await this.plugin.saveSettings();
      refresh();
    });

    const grid = card.createDiv({ cls: 'kb-tag-rule-grid' });

    grid.createEl('label', { text: 'Trigger' });
    const triggerSel = grid.createEl('select');
    for (const [val, label] of [
      ['on-create', 'When a note is created'],
      ['on-modify', 'When a note is modified'],
      ['manual', 'Manual only'],
    ] as const) {
      const opt = triggerSel.createEl('option', { text: label });
      opt.value = val;
      if (rule.trigger === val) opt.selected = true;
    }
    triggerSel.addEventListener('change', async () => {
      rule.trigger = triggerSel.value as TagRule['trigger'];
      await this.plugin.saveSettings();
    });

    grid.createEl('label', { text: 'Folder prefix' });
    const folderInput = grid.createEl('input', { type: 'text' });
    folderInput.value = rule.match.folderPath ?? '';
    folderInput.placeholder = 'daily';
    folderInput.addEventListener('change', async () => {
      rule.match.folderPath = folderInput.value.trim() || undefined;
      await this.plugin.saveSettings();
    });

    grid.createEl('label', { text: 'Path regex' });
    const regexInput = grid.createEl('input', { type: 'text' });
    regexInput.value = rule.match.pathRegex ?? '';
    regexInput.placeholder = 'projects/.+\\.md$';
    regexInput.addEventListener('change', async () => {
      rule.match.pathRegex = regexInput.value.trim() || undefined;
      await this.plugin.saveSettings();
    });

    grid.createEl('label', { text: 'Add tags' });
    const tagsInput = grid.createEl('input', { type: 'text' });
    tagsInput.value = (rule.action.addTags ?? []).join(', ');
    tagsInput.placeholder = 'tag1, tag2/nested';
    tagsInput.addEventListener('change', async () => {
      const tags = tagsInput.value
        .split(',')
        .map((t) => t.trim().replace(/^#/, '').toLowerCase())
        .filter((t) => t !== '');
      rule.action.addTags = tags;
      await this.plugin.saveSettings();
    });

    const actions = card.createDiv({ cls: 'kb-tag-rule-actions' });
    const deleteBtn = actions.createEl('button', { text: 'Delete' });
    deleteBtn.addEventListener('click', async () => {
      const rules = this.plugin.settings.tagRules ?? [];
      rules.splice(index, 1);
      this.plugin.settings.tagRules = rules;
      await this.plugin.saveSettings();
      refresh();
    });
  }
}
