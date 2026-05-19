import { App, Modal, Setting } from 'obsidian';
import { normalizeNoteTag } from '../lib/note-metadata';

/**
 * Modal that asks for a destination tag and shows a live dry-run preview
 * before committing.
 *
 * Outcome resolves on close: { confirmed: false } if the user cancelled,
 * or { confirmed: true, destination } if they pressed Rename.
 */
export class RenameTagModal extends Modal {
  private inputEl!: HTMLInputElement;
  private previewEl!: HTMLDivElement;
  private resolveResult!: (result: { confirmed: boolean; destination: string }) => void;
  readonly result: Promise<{ confirmed: boolean; destination: string }>;
  private debounceHandle: number | null = null;

  constructor(
    app: App,
    private fromTag: string,
    private fileCount: number,
    private getPreview: (destination: string) => Promise<{ filesAffected: number; willMerge: boolean; invalid: boolean }>,
  ) {
    super(app);
    this.result = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Rename tag' });
    contentEl.createEl('p', {
      text: `Renaming #${this.fromTag} (${this.fileCount} note${this.fileCount === 1 ? '' : 's'}). Type the new tag below.`,
    });

    this.inputEl = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'new-tag',
    });
    this.inputEl.addClass('kb-rename-modal__input');
    this.inputEl.addEventListener('input', () => this.schedulePreview());
    this.inputEl.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        void this.confirm();
      }
    });

    this.previewEl = contentEl.createDiv();
    this.previewEl.addClass('kb-rename-modal__preview');
    this.previewEl.setText('Enter a destination tag to see the preview.');

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.resolveResult({ confirmed: false, destination: '' });
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText('Rename')
          .setCta()
          .onClick(() => {
            void this.confirm();
          }),
      );

    setTimeout(() => this.inputEl.focus(), 0);
  }

  private schedulePreview(): void {
    if (this.debounceHandle !== null) window.clearTimeout(this.debounceHandle);
    this.debounceHandle = window.setTimeout(() => {
      this.debounceHandle = null;
      void this.updatePreview();
    }, 150);
  }

  private async updatePreview(): Promise<void> {
    const to = normalizeNoteTag(this.inputEl.value);
    if (to === '' || to === this.fromTag) {
      this.previewEl.setText(to === this.fromTag ? 'Destination is the same as source.' : 'Enter a destination tag.');
      return;
    }
    const preview = await this.getPreview(to);
    if (preview.invalid) {
      this.previewEl.setText('Invalid destination.');
      return;
    }
    const verb = preview.willMerge ? 'Merge into existing' : 'Rename to';
    this.previewEl.setText(`${verb} #${to}. Will rewrite ${preview.filesAffected} note${preview.filesAffected === 1 ? '' : 's'}.`);
  }

  private async confirm(): Promise<void> {
    const to = normalizeNoteTag(this.inputEl.value);
    if (to === '' || to === this.fromTag) return;
    this.resolveResult({ confirmed: true, destination: to });
    this.close();
  }

  onClose(): void {
    if (this.debounceHandle !== null) {
      window.clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
    this.resolveResult({ confirmed: false, destination: '' });
    this.contentEl.empty();
  }
}
