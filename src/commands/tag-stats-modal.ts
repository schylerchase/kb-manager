import { App, Modal } from 'obsidian';
import type { TagStats } from '../lib/tag-analytics';

/**
 * Read-only modal showing per-tag statistics: note count, co-occurring
 * tags, and folder distribution. Opened from the sidebar tag context menu.
 */
export class TagStatsModal extends Modal {
  constructor(
    app: App,
    private stats: TagStats,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: `Stats for #${this.stats.tag}` });

    contentEl.createEl('p', {
      text: `${this.stats.noteCount} note${this.stats.noteCount === 1 ? '' : 's'} use this tag.`,
    });

    if (this.stats.coOccurring.length > 0) {
      contentEl.createEl('h3', { text: 'Co-occurring tags' });
      const list = contentEl.createEl('ul');
      for (const item of this.stats.coOccurring.slice(0, 10)) {
        list.createEl('li', { text: `#${item.tag} — ${item.count} note${item.count === 1 ? '' : 's'}` });
      }
    }

    if (this.stats.folderDistribution.length > 0) {
      contentEl.createEl('h3', { text: 'Folder distribution' });
      const list = contentEl.createEl('ul');
      for (const item of this.stats.folderDistribution.slice(0, 10)) {
        const folder = item.folder === '/' ? '(vault root)' : item.folder;
        list.createEl('li', { text: `${folder} — ${item.count} note${item.count === 1 ? '' : 's'}` });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
