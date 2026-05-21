import { FileRecord, TagNode } from './vault-index-types';
import { buildTagTree } from './tag-utils';

export interface FolderTreeNode {
  type: 'folder';
  path: string;
  name: string;
  childFolders: FolderTreeNode[];
  childFiles: { path: string; basename: string }[];
  hasMoc: boolean;
}

export interface FileEntry {
  path: string;
  basename: string;
  kbManaged: boolean;
}

export interface TagTreeViewNode {
  name: string;
  fullPath: string;
  count: number;
  children: TagTreeViewNode[];
}

export function buildScopedTagHierarchy(
  files: FileRecord[],
  folderPath: string
): Map<string, TagNode> {
  return buildTagTree(files
    .filter(file => isFileInFolderScope(file.path, folderPath))
    .map(file => ({ filePath: file.path, tags: file.tags })));
}

export function isFileInFolderScope(filePath: string, folderPath: string): boolean {
  if (folderPath === '') return true;
  return filePath.startsWith(`${folderPath}/`);
}

export function countFilesInFolderScope(files: FileRecord[], folderPath: string): number {
  return files.filter(file => isFileInFolderScope(file.path, folderPath)).length;
}

export function countPathsInFolderScope(paths: string[], folderPath: string): number {
  return paths.filter(path => isFileInFolderScope(path, folderPath)).length;
}

export function filterUserFiles(files: FileRecord[]): FileRecord[] {
  return files.filter(file => !file.kbManaged);
}

function lastSegment(path: string): string {
  if (path === '') return '';
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function parentPath(path: string): string {
  if (path === '') return '';
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function compareCaseInsensitive(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

export function buildFolderTree(
  allFolderPaths: string[],
  filesByFolder: Map<string, FileEntry[]>,
  excludedPaths: string[],
  resolveFormat: (folderPath: string) => 'dedicated' | 'inline',
  isExcluded: (filePath: string, patterns: string[]) => boolean
): FolderTreeNode {
  const nodes = new Map<string, FolderTreeNode>();
  for (const folderPath of collectIncludedFolders(allFolderPaths, excludedPaths, isExcluded)) {
    nodes.set(folderPath, createFolderNode(folderPath, resolveFormat));
  }
  if (!nodes.has('')) nodes.set('', createFolderNode('', resolveFormat));
  wireFolderNodes(nodes);
  attachFiles(nodes, filesByFolder, excludedPaths, isExcluded);
  sortFolderNodes(nodes);
  return nodes.get('')!;
}

function collectIncludedFolders(
  paths: string[],
  excludedPaths: string[],
  isExcluded: (filePath: string, patterns: string[]) => boolean
): string[] {
  const folders = new Set<string>(['']);
  for (const path of paths) {
    if (isExcluded(path, excludedPaths)) continue;
    let current = path;
    while (current !== '') {
      if (isExcluded(current, excludedPaths)) break;
      folders.add(current);
      current = parentPath(current);
    }
  }
  return [...folders];
}

function createFolderNode(
  folderPath: string,
  resolveFormat: (folderPath: string) => 'dedicated' | 'inline'
): FolderTreeNode {
  return {
    type: 'folder',
    path: folderPath,
    name: lastSegment(folderPath),
    childFolders: [],
    childFiles: [],
    hasMoc: resolveFormat(folderPath) === 'dedicated',
  };
}

function wireFolderNodes(nodes: Map<string, FolderTreeNode>): void {
  for (const [folderPath, node] of nodes) {
    if (folderPath === '') continue;
    const parent = nodes.get(parentPath(folderPath));
    if (parent) parent.childFolders.push(node);
  }
}

function attachFiles(
  nodes: Map<string, FolderTreeNode>,
  filesByFolder: Map<string, FileEntry[]>,
  excludedPaths: string[],
  isExcluded: (filePath: string, patterns: string[]) => boolean
): void {
  for (const [folderPath, files] of filesByFolder) {
    const node = nodes.get(folderPath);
    if (!node) continue;
    for (const file of files) {
      if (!file.kbManaged && !isExcluded(file.path, excludedPaths)) {
        node.childFiles.push({ path: file.path, basename: file.basename });
      }
    }
  }
}

function sortFolderNodes(nodes: Map<string, FolderTreeNode>): void {
  for (const node of nodes.values()) {
    node.childFolders.sort((a, b) => compareCaseInsensitive(a.name, b.name));
    node.childFiles.sort((a, b) => compareCaseInsensitive(a.basename, b.basename));
  }
}

export function buildTagViewTree(
  hierarchy: Map<string, TagNode>,
  countForTag: (fullPath: string) => number
): TagTreeViewNode[] {
  return buildTagLevel(hierarchy, '', countForTag);
}

function buildTagLevel(
  level: Map<string, TagNode>,
  prefix: string,
  countForTag: (fullPath: string) => number
): TagTreeViewNode[] {
  const entries = [...level.entries()].sort(([a], [b]) => compareCaseInsensitive(a, b));
  return entries.map(([name, node]) => {
    const fullPath = prefix === '' ? name : `${prefix}/${name}`;
    return {
      name,
      fullPath,
      count: countForTag(fullPath),
      children: buildTagLevel(node.children, fullPath, countForTag),
    };
  });
}
