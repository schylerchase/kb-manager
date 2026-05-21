import { describe, expect, it } from 'vitest';
import {
  getRibbonIconIndex,
  restoreRibbonIconIndex,
  shouldManageRibbonIconIndex,
} from './ribbon-order';

describe('ribbon-order', () => {
  it('moves a ribbon icon back to its saved position', () => {
    const parent = new MockParent();
    const first = new MockElement(parent);
    const sidebar = new MockElement(parent);
    const last = new MockElement(parent);
    parent.children.push(first, last, sidebar);

    restoreRibbonIconIndex(sidebar as never, 1);

    expect(parent.children).toEqual([first, sidebar, last]);
    expect(getRibbonIconIndex(sidebar as never)).toBe(1);
  });

  it('clamps positions past the end', () => {
    const parent = new MockParent();
    const sidebar = new MockElement(parent);
    const other = new MockElement(parent);
    parent.children.push(sidebar, other);

    restoreRibbonIconIndex(sidebar as never, 20);

    expect(parent.children).toEqual([other, sidebar]);
    expect(getRibbonIconIndex(sidebar as never)).toBe(1);
  });

  it('leaves mobile ribbon placement to Obsidian', () => {
    expect(shouldManageRibbonIconIndex(true)).toBe(false);
    expect(shouldManageRibbonIconIndex(false)).toBe(true);
  });
});

class MockParent {
  children: MockElement[] = [];

  insertBefore(element: MockElement, target: MockElement | null): void {
    this.children = this.children.filter((child) => child !== element);
    const targetIndex = target ? this.children.indexOf(target) : -1;
    if (targetIndex === -1) {
      this.children.push(element);
    } else {
      this.children.splice(targetIndex, 0, element);
    }
  }
}

class MockElement {
  constructor(public parentElement: MockParent) {}
}
