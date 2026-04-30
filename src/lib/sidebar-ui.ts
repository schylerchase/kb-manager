import { setIcon } from 'obsidian';

interface TagScopeView {
  label: string;
  noteCount: number;
  tagCount: number;
  canClear: boolean;
  clear: () => void;
}

export function renderTagScope(section: HTMLElement, scopeView: TagScopeView): void {
  const scope = section.createDiv({ cls: 'kb-scope-bar' });
  scope.createSpan({ cls: 'kb-scope-label', text: scopeView.label });
  scope.createSpan({ cls: 'kb-scope-meta', text: `${scopeView.noteCount} notes | ${scopeView.tagCount} tags` });
  if (!scopeView.canClear) return;
  const action = scope.createSpan({ cls: 'kb-row-action kb-scope-clear' });
  setIcon(action, 'x');
  action.setAttribute('role', 'button');
  action.setAttribute('tabindex', '0');
  action.setAttribute('aria-label', 'Show all vault tags');
  action.setAttribute('title', 'Show all vault tags');
  action.addEventListener('click', scopeView.clear);
  action.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    scopeView.clear();
  });
}
