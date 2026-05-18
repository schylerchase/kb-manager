import { App, FuzzySuggestModal } from 'obsidian';

/**
 * Fuzzy-search picker over the vault's tag set. Used by command-palette
 * entries (delete tag, rename tag, merge tag) so the user can search for
 * the tag they want to operate on instead of typing the full path.
 */
export class TagPickerModal extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    placeholder: string,
    private tags: string[],
    private onPick: (tag: string) => void,
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): string[] {
    return this.tags;
  }

  getItemText(item: string): string {
    return `#${item}`;
  }

  onChooseItem(item: string): void {
    this.onPick(item);
  }
}
