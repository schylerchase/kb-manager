import { TagNode } from './vault-index-types';

export const DEDICATED_FRONTMATTER_KEYS = ['kb-managed', 'kb-type', 'kb-folder'] as const;

const MAX_HEADING_LEVEL = 6;
const UNTAGGED_HEADING = '## Untagged';

export interface MocBuildInput {
  tagTree: Map<string, TagNode>;
  untaggedFiles: string[];
}

function basename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  const tail = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
  return tail.endsWith('.md') ? tail.slice(0, -3) : tail;
}

function sortByBasename(paths: string[]): string[] {
  return [...paths].sort((a, b) =>
    basename(a).toLowerCase().localeCompare(basename(b).toLowerCase())
  );
}

function compareCaseInsensitive(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function renderTagNode(name: string, node: TagNode, depth: number, lines: string[]): void {
  const level = Math.min(depth, MAX_HEADING_LEVEL);
  lines.push(`${'#'.repeat(level)} ${name}`);
  for (const filePath of sortByBasename(node.files)) {
    lines.push(`- [[${basename(filePath)}]]`);
  }
  const childNames = [...node.children.keys()].sort(compareCaseInsensitive);
  for (const childName of childNames) {
    const child = node.children.get(childName);
    if (child) renderTagNode(childName, child, depth + 1, lines);
  }
}

export function buildMocBody(input: MocBuildInput): string {
  const lines: string[] = [];
  const topLevelNames = [...input.tagTree.keys()].sort(compareCaseInsensitive);
  for (const name of topLevelNames) {
    const node = input.tagTree.get(name);
    if (node) renderTagNode(name, node, 2, lines);
  }
  if (input.untaggedFiles.length > 0) {
    lines.push(UNTAGGED_HEADING);
    for (const filePath of sortByBasename(input.untaggedFiles)) {
      lines.push(`- [[${basename(filePath)}]]`);
    }
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

export function buildDedicatedMocFile(folderPath: string, body: string): string {
  const folderLabel = folderPath === '' ? 'vault root' : folderPath;
  const frontmatter = [
    '---',
    'kb-managed: true',
    'kb-type: moc',
    `kb-folder: ${folderPath}`,
    '---',
  ].join('\n');
  return `${frontmatter}\n\n# Folder map: ${folderLabel}\n\n${body}`;
}
