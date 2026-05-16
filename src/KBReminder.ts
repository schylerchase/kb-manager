import { App, Notice, Plugin, TFile, normalizePath } from 'obsidian';
import type { KBManagerSettings } from './settings';
import {
  buildReminderDraft,
  buildReviewTaskLine,
  getReviewDueAt,
} from './lib/kb-reminder';
import { getQuickReminderAdapter } from './lib/quick-reminder-adapter';

export default class KBReminder {
  constructor(
    private app: App,
    private settings: KBManagerSettings,
  ) {}

  addCommands(plugin: Plugin): void {
    plugin.addCommand({
      id: 'create-update-reminder',
      name: 'Create KB update reminder',
      callback: () => {
        this.createUpdateReminder('').catch(err => this.reportError(err));
      },
    });
  }

  async createUpdateReminder(scopePath: string): Promise<void> {
    const now = new Date();
    const dueAt = getReviewDueAt(this.settings.kbReviewReminderDays, now);
    const reminder = buildReminderDraft(scopePath, dueAt, now);

    const adapter = getQuickReminderAdapter(this.app);
    if (adapter) {
      try {
        await adapter.addAndSchedule(reminder);
        new Notice(
          `KB Manager: reminder set for ${new Date(dueAt).toLocaleDateString()}`,
        );
        return;
      } catch (err) {
        console.warn(
          'KB Manager: Quick Reminder integration failed, falling back to Markdown task',
          err,
        );
      }
    }

    await this.writeFallbackTask(scopePath, dueAt);
    new Notice(
      `KB Manager: review task added to ${this.settings.kbReviewTaskPath}`,
    );
  }

  openReminderManager(): void {
    const adapter = getQuickReminderAdapter(this.app);
    if (adapter) {
      adapter.openManager();
      return;
    }
    new Notice(
      'KB Manager: Quick Reminder is not installed or enabled. Review tasks are written to your KB update task file.',
    );
  }

  private async writeFallbackTask(
    scopePath: string,
    dueAt: number,
  ): Promise<void> {
    const path = normalizePath(
      this.settings.kbReviewTaskPath || 'KB Updates.md',
    );
    const line = buildReviewTaskLine(scopePath, dueAt);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.process(
        file,
        content => `${content.trimEnd()}\n${line}\n`,
      );
      return;
    }
    await this.app.vault.create(path, `# KB Updates\n\n${line}\n`);
  }

  private reportError(err: unknown): void {
    console.error('KB Manager: create update reminder failed', err);
    new Notice('KB Manager: could not create update reminder - see console');
  }
}
