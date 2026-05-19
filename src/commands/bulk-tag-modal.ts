import { App, Modal, Setting } from 'obsidian';
import type { BulkOpInput, BulkSelector } from './bulk-tag';

export type BulkModalResult =
  | { confirmed: false }
  | { confirmed: true; selector: BulkSelector; ops: BulkOpInput[] };

/**
 * Simple bulk-tag form. Selector is restricted to "all files in folder"
 * or "all files with tag" — the two most common bulk workflows. Power
 * users can compose multiple ops in one batch.
 */
export class BulkTagModal extends Modal {
  private resolveResult!: (r: BulkModalResult) => void;
  readonly result: Promise<BulkModalResult>;
  private selectorKind: 'folder' | 'tag' = 'folder';
  private selectorValue = '';
  private ops: BulkOpInput[] = [];

  constructor(
    app: App,
    private allTags: string[],
    private previewMatches: (selector: BulkSelector) => Promise<number>,
  ) {
    super(app);
    this.result = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Bulk tag' });

    new Setting(contentEl)
      .setName('Source')
      .setDesc('Pick files to apply tag ops to.')
      .addDropdown((dd) =>
        dd
          .addOption('folder', 'Files in folder')
          .addOption('tag', 'Files with tag')
          .setValue(this.selectorKind)
          .onChange((v) => {
            this.selectorKind = v as 'folder' | 'tag';
            this.render();
          }),
      )
      .addText((t) =>
        t
          .setPlaceholder(this.selectorKind === 'folder' ? 'kb/projects' : 'project')
          .setValue(this.selectorValue)
          .onChange((v) => {
            this.selectorValue = v;
          }),
      );

    contentEl.createEl('h3', { text: 'Operations' });
    if (this.ops.length === 0) {
      contentEl.createDiv({ text: 'No operations yet. Add at least one.' });
    }
    for (let i = 0; i < this.ops.length; i++) {
      this.renderOpRow(contentEl, i);
    }

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('+ Add').onClick(() => {
          this.ops.push({ kind: 'add', tag: '' });
          this.render();
        }),
      )
      .addButton((b) =>
        b.setButtonText('+ Remove').onClick(() => {
          this.ops.push({ kind: 'remove', tag: '' });
          this.render();
        }),
      )
      .addButton((b) =>
        b.setButtonText('+ Rename').onClick(() => {
          this.ops.push({ kind: 'rename', from: '', to: '' });
          this.render();
        }),
      );

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('Preview').onClick(async () => {
          const count = await this.previewMatches(this.buildSelector());
          contentEl.createDiv({
            text: `Selector matches ${count} file${count === 1 ? '' : 's'}.`,
            cls: 'kb-bulk-preview',
          });
        }),
      )
      .addButton((b) =>
        b.setButtonText('Cancel').onClick(() => {
          this.resolveResult({ confirmed: false });
          this.close();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText('Apply')
          .setCta()
          .onClick(() => {
            this.resolveResult({ confirmed: true, selector: this.buildSelector(), ops: this.ops });
            this.close();
          }),
      );
  }

  private renderOpRow(parent: HTMLElement, index: number): void {
    const op = this.ops[index]!;
    const row = parent.createDiv({ cls: 'kb-bulk-op-row' });
    row.addClass('kb-bulk-tag-row');

    const label = row.createSpan({ text: `${op.kind}: ` });
    label.addClass('kb-bulk-tag-row__label');

    if (op.kind === 'rename') {
      const fromInput = row.createEl('input', { type: 'text', placeholder: 'from' });
      fromInput.value = op.from;
      fromInput.addClass('kb-bulk-tag-row__input');
      fromInput.addEventListener('input', () => {
        this.ops[index] = { kind: 'rename', from: fromInput.value, to: (op as { to: string }).to };
      });
      const toInput = row.createEl('input', { type: 'text', placeholder: 'to' });
      toInput.value = op.to;
      toInput.addClass('kb-bulk-tag-row__input');
      toInput.addEventListener('input', () => {
        this.ops[index] = { kind: 'rename', from: (this.ops[index] as { from: string }).from, to: toInput.value };
      });
    } else {
      const tagInput = row.createEl('input', { type: 'text', placeholder: 'tag' });
      tagInput.value = op.tag;
      tagInput.addClass('kb-bulk-tag-row__input');
      tagInput.addEventListener('input', () => {
        this.ops[index] = { kind: op.kind, tag: tagInput.value };
      });
    }

    const remove = row.createEl('button', { text: '×' });
    remove.addEventListener('click', () => {
      this.ops.splice(index, 1);
      this.render();
    });
  }

  private buildSelector(): BulkSelector {
    if (this.selectorKind === 'folder') return { kind: 'folder', path: this.selectorValue.trim() };
    return { kind: 'tag', tag: this.selectorValue.trim() };
  }

  onClose(): void {
    this.resolveResult({ confirmed: false });
    this.contentEl.empty();
  }
}
