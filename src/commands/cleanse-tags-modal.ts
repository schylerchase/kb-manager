import { App, Modal, Setting } from 'obsidian';
import type { CleansePlan } from './cleanse-tags';

/**
 * Preview modal listing every planned rewrite and every unfixable tag
 * before the sweep commits. User explicitly confirms — apply is destructive
 * (rewrites many files) and we want a hard gate.
 */
export class CleanseTagsModal extends Modal {
  private resolveResult!: (confirmed: boolean) => void;
  readonly confirmed: Promise<boolean>;

  constructor(app: App, private plan: CleansePlan) {
    super(app);
    this.confirmed = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Cleanse invalid tags' });

    if (this.plan.rewriteCount === 0 && this.plan.unfixableCount === 0) {
      contentEl.createEl('p', { text: 'No invalid tags found. Nothing to do.' });
      new Setting(contentEl).addButton((btn) =>
        btn.setButtonText('Close').onClick(() => {
          this.resolveResult(false);
          this.close();
        }),
      );
      return;
    }

    contentEl.createEl('p', {
      text: `Found ${this.plan.rewriteCount} rewritable tag${this.plan.rewriteCount === 1 ? '' : 's'} and ${this.plan.unfixableCount} unfixable tag${this.plan.unfixableCount === 1 ? '' : 's'} across ${this.plan.affectedNoteCount} note${this.plan.affectedNoteCount === 1 ? '' : 's'}.`,
    });

    const rewrites = this.plan.items.filter((i) => i.kind === 'rewrite');
    if (rewrites.length > 0) {
      contentEl.createEl('h3', { text: 'Rewrites' });
      const list = contentEl.createEl('ul');
      for (const item of rewrites) {
        if (item.kind !== 'rewrite') continue;
        list.createEl('li', { text: `#${item.from} → #${item.to}  (${item.noteCount} note${item.noteCount === 1 ? '' : 's'})` });
      }
    }

    const unfixable = this.plan.items.filter((i) => i.kind === 'unfixable');
    if (unfixable.length > 0) {
      contentEl.createEl('h3', { text: 'Unfixable (skipped)' });
      contentEl.createEl('p', {
        cls: 'setting-item-description',
        text: 'These tags cleanse to nothing (e.g. pure-numeric). Delete them manually if you want them gone.',
      });
      const list = contentEl.createEl('ul');
      for (const item of unfixable) {
        list.createEl('li', { text: `#${item.from}  (${item.noteCount} note${item.noteCount === 1 ? '' : 's'})` });
      }
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.resolveResult(false);
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText('Apply rewrites')
          .setCta()
          .onClick(() => {
            this.resolveResult(true);
            this.close();
          }),
      );
  }

  onClose(): void {
    this.resolveResult(false);
    this.contentEl.empty();
  }
}
