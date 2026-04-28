import { App, PluginSettingTab, Setting } from 'obsidian';
import { parseFolderRules, parseExclusionPatterns } from 'lib/settings-parser';

export interface KBManagerSettings {
  updateIntervalMinutes: number;
  autoInject: boolean;
  excludedPaths: string[];
  defaultMocFormat: 'dedicated' | 'inline';
  folderRules: Record<string, 'dedicated' | 'inline'>;
}

export const DEFAULT_SETTINGS: KBManagerSettings = {
  updateIntervalMinutes: 5,
  autoInject: false,
  excludedPaths: [],
  defaultMocFormat: 'dedicated',
  folderRules: {},
};

type SettingsHost = {
  settings: KBManagerSettings;
  saveSettings(): Promise<void>;
};

export class KBSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: SettingsHost) {
    super(app, plugin as never);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.buildGeneralSection(containerEl);
    this.buildExclusionsSection(containerEl);
    this.buildMocFormatSection(containerEl);
  }

  private buildGeneralSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Update interval')
      .setDesc(
        'How often KB Manager rebuilds MOC files and TOC sections in the background. Range: 1–60 minutes.'
      )
      .addSlider(s =>
        s
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.updateIntervalMinutes)
          .setDynamicTooltip()
          .onChange(async v => {
            this.plugin.settings.updateIntervalMinutes = v;
            try { await this.plugin.saveSettings(); } catch (err) { console.error('KB Manager: failed to save settings', err); }
          })
      );

    new Setting(containerEl)
      .setName('Auto-injection')
      .setDesc(
        'When enabled, automatically injects MOC sections into all notes in folders configured for inline format. Disabled by default — enable after reviewing per-folder rules.'
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
            try { await this.plugin.saveSettings(); } catch (err) { console.error('KB Manager: failed to save settings', err); }
          })
      );
  }

  private buildMocFormatSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'MOC Format' });

    new Setting(containerEl)
      .setName('Default MOC format')
      .setDesc(
        'How MOC content is delivered when no per-folder rule applies. "Dedicated file" creates a MOC.md in each folder. "Inline injection" updates sections inside existing notes that contain delimiter markers.'
      )
      .addDropdown(dd =>
        dd
          .addOption('dedicated', 'Dedicated file')
          .addOption('inline', 'Inline injection')
          .setValue(this.plugin.settings.defaultMocFormat)
          .onChange(async v => {
            if (v !== 'dedicated' && v !== 'inline') return;
            this.plugin.settings.defaultMocFormat = v;
            try { await this.plugin.saveSettings(); } catch (err) { console.error('KB Manager: failed to save settings', err); }
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
            this.plugin.settings.folderRules = parseFolderRules(v);
            try { await this.plugin.saveSettings(); } catch (err) { console.error('KB Manager: failed to save settings', err); }
          })
      );
  }
}
