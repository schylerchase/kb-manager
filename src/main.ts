import { Plugin, TFile } from 'obsidian';
import { KBManagerSettings, DEFAULT_SETTINGS, KBSettingsTab } from 'settings';
import VaultIndex from './VaultIndex';

export default class KBManagerPlugin extends Plugin {
  settings!: KBManagerSettings;
  index!: VaultIndex;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.index = new VaultIndex(this.app, this.settings.excludedPaths);

    // Register settings tab immediately — safe to do in onload
    this.addSettingTab(new KBSettingsTab(this.app, this));

    // Defer ALL vault work and event registration — vault is not fully indexed
    // at load time; registering events early causes startup event bursts.
    this.app.workspace.onLayoutReady(() => {
      this.registerVaultEvents();
      this.index.rebuild().catch(err => {
        console.error('KB Manager: initial rebuild failed', err);
      });
    });
  }

  onunload(): void {
    // registerEvent() and registerInterval() auto-clean on unload.
    // No manual cleanup needed for Phase 1 — nothing heavy registered yet.
  }

  async loadSettings(): Promise<void> {
    // Object.assign ensures corrupted or missing keys fall back to safe
    // defaults (T-01-06 mitigation — no panic on missing field).
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
