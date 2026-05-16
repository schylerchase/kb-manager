import { App, Notice, Plugin, TFile, normalizePath } from "obsidian";
import type { KBManagerSettings } from "./settings";
import {
  buildReminderDraft,
  buildReviewTaskLine,
  getReviewDueAt,
} from "./lib/kb-reminder";

type QuickReminder = {
  store?: { add(reminder: unknown): Promise<void> };
  scheduler?: { schedule(reminder: unknown): void };
};

type AppWithPlugins = App & {
  commands?: { executeCommandById(id: string): unknown };
  plugins?: { plugins?: Record<string, unknown> };
};

export default class KBReminder {
  constructor(
    private app: App,
    private settings: KBManagerSettings,
  ) {}

  addCommands(plugin: Plugin): void {
    plugin.addCommand({
      id: "kb-manager-create-update-reminder",
      name: "KB Manager: Create KB update reminder",
      callback: () => {
        this.createUpdateReminder("").catch((err) => this.reportError(err));
      },
    });
  }

  async createUpdateReminder(scopePath: string): Promise<void> {
    const now = new Date();
    const dueAt = getReviewDueAt(this.settings.kbReviewReminderDays, now);
    const reminder = buildReminderDraft(scopePath, dueAt, now);
    if (await this.tryQuickReminder(reminder)) {
      new Notice(
        `KB Manager: reminder set for ${new Date(dueAt).toLocaleDateString()}`,
      );
      return;
    }
    await this.writeFallbackTask(scopePath, dueAt);
    new Notice(
      `KB Manager: review task added to ${this.settings.kbReviewTaskPath}`,
    );
  }

  openReminderManager(): void {
    const app = this.app as AppWithPlugins;
    app.commands?.executeCommandById("quick-reminder:open-view");
  }

  private async tryQuickReminder(reminder: unknown): Promise<boolean> {
    const quickReminder = this.getQuickReminder();
    if (!quickReminder?.store?.add || !quickReminder.scheduler?.schedule)
      return false;
    await quickReminder.store.add(reminder);
    quickReminder.scheduler.schedule(reminder);
    return true;
  }

  private getQuickReminder(): QuickReminder | null {
    const app = this.app as AppWithPlugins;
    const plugin = app.plugins?.plugins?.["quick-reminder"];
    return plugin && typeof plugin === "object"
      ? (plugin as QuickReminder)
      : null;
  }

  private async writeFallbackTask(
    scopePath: string,
    dueAt: number,
  ): Promise<void> {
    const path = normalizePath(
      this.settings.kbReviewTaskPath || "KB Updates.md",
    );
    const line = buildReviewTaskLine(scopePath, dueAt);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.process(
        file,
        (content) => `${content.trimEnd()}\n${line}\n`,
      );
      return;
    }
    await this.app.vault.create(path, `# KB Updates\n\n${line}\n`);
  }

  private reportError(err: unknown): void {
    console.error("KB Manager: create update reminder failed", err);
    new Notice("KB Manager: could not create update reminder - see console");
  }
}
