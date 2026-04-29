import { FolderRecord, TagNode } from './vault-index-types';

export function normalizeTag(rawTag: string): string {
  return rawTag.replace(/^#/, '').toLowerCase();
}

export function normalizeTags(rawTags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of rawTags) {
    const normalized = normalizeTag(raw);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

export function buildTagTree(
  fileTagPairs: Array<{ filePath: string; tags: string[] }>
): Map<string, TagNode> {
  const root = new Map<string, TagNode>();
  for (const { filePath, tags } of fileTagPairs) {
    for (const tag of tags) {
      const segments = tag.split('/');
      let current = root;
      for (const [i, segment] of segments.entries()) {
        if (!current.has(segment)) {
          current.set(segment, { files: [], children: new Map() });
        }
        const node = current.get(segment)!;
        if (i === segments.length - 1) {
          node.files.push(filePath);
        }
        current = node.children;
      }
    }
  }
  return root;
}

export function buildFlatTagMap(
  fileTagPairs: Array<{ filePath: string; tags: string[] }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { filePath, tags } of fileTagPairs) {
    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)!.push(filePath);
    }
  }
  return map;
}

export function indexFolders(filePaths: string[]): Map<string, FolderRecord> {
  const map = new Map<string, FolderRecord>();
  for (const filePath of filePaths) {
    const lastSlash = filePath.lastIndexOf('/');
    const folderPath = lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
    const name = folderPath === '' ? '' : folderPath.split('/').pop() ?? '';
    if (!map.has(folderPath)) {
      map.set(folderPath, { path: folderPath, name, files: [] });
    }
    map.get(folderPath)!.files.push(filePath);
  }
  return map;
}
