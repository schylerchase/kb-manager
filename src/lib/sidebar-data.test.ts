import { describe, it, expect } from 'vitest';
import { buildFolderTree, buildTagViewTree, FileEntry } from './sidebar-data';
import { TagNode } from './vault-index-types';

const isExcluded = (path: string, patterns: string[]): boolean => {
  const segments = path.split('/').filter(Boolean);
  return patterns.some(pattern => segments.includes(pattern));
};

describe('buildFolderTree', () => {
  const dedicated = (): 'dedicated' => 'dedicated';

  it('builds root folder when input is empty', () => {
    const root = buildFolderTree([], new Map(), [], dedicated, isExcluded);
    expect(root.path).toBe('');
    expect(root.name).toBe('');
    expect(root.hasMoc).toBe(true);
  });

  it('assembles nested folders and ancestors', () => {
    const root = buildFolderTree(['notes/projects'], new Map(), [], dedicated, isExcluded);
    expect(root.childFolders[0]?.path).toBe('notes');
    expect(root.childFolders[0]?.childFolders[0]?.path).toBe('notes/projects');
  });

  it('filters excluded folders and kb-managed files', () => {
    const files: FileEntry[] = [
      { path: 'notes/a.md', basename: 'a', kbManaged: false },
      { path: 'notes/MOC.md', basename: 'MOC', kbManaged: true },
    ];
    const root = buildFolderTree(['notes', 'archive'], new Map([['notes', files]]), ['archive'], dedicated, isExcluded);
    expect(root.childFolders.map(f => f.path)).toEqual(['notes']);
    expect(root.childFolders[0]?.childFiles).toEqual([{ path: 'notes/a.md', basename: 'a' }]);
  });

  it('sets hasMoc from resolveFormat', () => {
    const root = buildFolderTree(['notes'], new Map(), [], () => 'inline', isExcluded);
    expect(root.hasMoc).toBe(false);
    expect(root.childFolders[0]?.hasMoc).toBe(false);
  });

  it('sorts folders and files case-insensitively', () => {
    const files: FileEntry[] = [
      { path: 'notes/cherry.md', basename: 'cherry', kbManaged: false },
      { path: 'notes/Banana.md', basename: 'Banana', kbManaged: false },
    ];
    const root = buildFolderTree(['zeta', 'Alpha', 'notes'], new Map([['notes', files]]), [], dedicated, isExcluded);
    expect(root.childFolders.map(f => f.name)).toEqual(['Alpha', 'notes', 'zeta']);
    expect(root.childFolders[1]?.childFiles.map(f => f.basename)).toEqual(['Banana', 'cherry']);
  });
});

describe('buildTagViewTree', () => {
  it('returns empty array for empty hierarchy', () => {
    expect(buildTagViewTree(new Map(), () => 0)).toEqual([]);
  });

  it('attaches counts and nested full paths', () => {
    const child: TagNode = { files: ['a.md'], children: new Map() };
    const rootNode: TagNode = { files: [], children: new Map([['alpha', child]]) };
    const tree = buildTagViewTree(new Map([['project', rootNode]]), tag => tag.length);
    expect(tree[0]).toMatchObject({ name: 'project', fullPath: 'project', count: 7 });
    expect(tree[0]?.children[0]).toMatchObject({
      name: 'alpha',
      fullPath: 'project/alpha',
      count: 13,
    });
  });

  it('sorts children alphabetically', () => {
    const node: TagNode = {
      files: [],
      children: new Map([
        ['zeta', { files: [], children: new Map() }],
        ['Alpha', { files: [], children: new Map() }],
      ]),
    };
    const tree = buildTagViewTree(new Map([['root', node]]), () => 0);
    expect(tree[0]?.children.map(child => child.name)).toEqual(['Alpha', 'zeta']);
  });
});
