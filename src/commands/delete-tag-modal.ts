import { App, Modal, Setting } from 'obsidian';

/**
 * Confirmation modal for deleting a tag across all notes. Construct,
 * open it, and await {@link DeleteTagConfirmModal.confirmed} to learn
 * whether the user pressed Delete.
 *
 * Lives in its own file (separate from the handler) so the testable
 * handler module can avoid importing Obsidian's value-level Modal/Setting
 * exports — vitest cannot resolve those without an Obsidian shim.
 */
export class DeleteTagConfirmModal extends Modal {
  private resolveResult!: (confirmed: boolean) => void;
  readonly confirmed: Promise<boolean>;

  constructor(app: App, private tag: string, private fileCount: number) {
    super(app);
    this.confirmed = new Promise<boolean>((resolve) => {
      this.resolveResult = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Delete tag' });
    contentEl.createEl('p', {
      text: `Strip #${this.tag} from ${this.fileCount} note${this.fileCount === 1 ? '' : 's'}? This cannot be undone.`,
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.resolveResult(false);
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText('Delete')
          .setWarning()
          .onClick(() => {
            this.resolveResult(true);
            this.close();
          }),
      );
  }

  onClose(): void {
    // Close without confirmation (Esc, click-outside) resolves as cancelled.
    this.resolveResult(false);
    this.contentEl.empty();
  }
}
