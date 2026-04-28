import { Plugin } from 'obsidian';
import { KBManagerSettings, DEFAULT_SETTINGS, KBSettingsTab } from 'settings';

export default class KBManagerPlugin extends Plugin {
  settings!: KBManagerSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register settings tab immediately — safe to do in onload
    this.addSettingTab(new KBSettingsTab(this.app, this));

    // Defer ALL vault work and event registration — vault is not fully indexed
    // at load time; registering events early causes startup event bursts.
    this.app.workspace.onLayoutReady(() => {
      this.registerVaultEvents();
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
    // Phase 1: no vault events yet — placeholder for Phase 2+.
    // All vault event registration belongs inside this method (ARCHITECTURE.md).
  }
}
