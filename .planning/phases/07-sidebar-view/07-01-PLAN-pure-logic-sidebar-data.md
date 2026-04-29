---
phase: 07-sidebar-view
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/sidebar-data.ts
autonomous: true
requirements:
  - SIDE-01
  - SIDE-02
must_haves:
  truths:
    - "src/lib/sidebar-data.ts exports buildFolderTree, buildTagViewTree, FolderTreeNode, TagTreeViewNode with no Obsidian imports"
    - "buildFolderTree filters out folders matching isExcluded against excludedPaths"
    - "buildFolderTree filters out files marked kbManaged: true"
    - "buildFolderTree sorts childFolders before childFiles at every level; both alphabetical case-insensitive"
    - "buildFolderTree assembles nested FolderTreeNode tree from flat folder path list"
    - "buildFolderTree sets hasMoc per FolderTreeNode by calling resolveFormat(folderPath) === 'dedicated'"
    - "buildTagViewTree mirrors the input TagNode hierarchy with counts attached at each node"
    - "buildTagViewTree fullPath of nested nodes joins ancestors with '/' (e.g. 'project/alpha')"
    - "buildTagViewTree sorts children alphabetically at every level"
  artifacts:
    - path: "src/lib/sidebar-data.ts"
      provides: "Pure-logic data prep for sidebar tree rendering"
      exports: ["buildFolderTree", "buildTagViewTree", "FolderTreeNode", "TagTreeViewNode"]
  key_links:
    - from: "src/KBSidebarView.ts"
      to: "src/lib/sidebar-data.ts"
      via: "import { buildFolderTree, buildTagViewTree, FolderTreeNode, TagTreeViewNode } from './lib/sidebar-data'"
      pattern: "from.*sidebar-data"
---

<objective>
Pure-logic data preparation for the sidebar's two trees. Decouples filtering, sorting,
and view-model construction from DOM rendering. Same pattern as Phase 4
`moc-builder.ts` and Phase 5 `toc-builder.ts`.

Output: src/lib/sidebar-data.ts.
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/06-tagmanager-tag-hierarchy/06-CONTEXT.md

<interfaces>
// src/lib/sidebar-data.ts (no Obsidian imports)

import { TagNode } from './vault-index-types';

export interface FolderTreeNode {
  type: 'folder';
  path: string;           // '' for root
  name: string;           // segment label, '' for root → caller renders as 'Vault'
  childFolders: FolderTreeNode[];
  childFiles: { path: string; basename: string }[];
  hasMoc: boolean;        // true when resolveFormat(path) === 'dedicated'
}

export interface FileEntry { path: string; basename: string; kbManaged: boolean; }

export function buildFolderTree(
  allFolderPaths: string[],
  filesByFolder: Map<string, FileEntry[]>,
  excludedPaths: string[],
  resolveFormat: (folderPath: string) => 'dedicated' | 'inline',
  isExcluded: (filePath: string, patterns: string[]) => boolean,
): FolderTreeNode;

export interface TagTreeViewNode {
  name: string;
  fullPath: string;
  count: number;
  children: TagTreeViewNode[];
}

export function buildTagViewTree(
  hierarchy: Map<string, TagNode>,
  countForTag: (fullPath: string) => number,
): TagTreeViewNode[];
</interfaces>

<!-- The functions take their dependencies as params (isExcluded, resolveFormat, countForTag)
     so they stay pure-logic with no transitive Obsidian or VaultIndex import. -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/lib/sidebar-data.ts</name>
  <files>src/lib/sidebar-data.ts</files>
  <read_first>
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/moc-builder.ts (sibling pure-logic style)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/toc-builder.ts (sibling pure-logic style)
    - /Users/schylerryan/Desktop/Github/kb-manager/src/lib/vault-index-types.ts (TagNode shape)
    - /Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/07-sidebar-view/07-CONTEXT.md (D-08..D-13, D-15..D-19)
  </read_first>
  <behavior>
    - buildFolderTree([''], Map([['', []]]), [], () => 'dedicated', isExcluded) → root FolderTreeNode with name '', path '', no children, hasMoc=true
    - buildFolderTree includes nested folders as childFolders
    - buildFolderTree filters folders matched by isExcluded
    - buildFolderTree filters files with kbManaged=true
    - buildFolderTree sets hasMoc=false when resolveFormat returns 'inline'
    - buildFolderTree sorts childFolders alphabetically before childFiles
    - buildFolderTree sorts childFiles alphabetically by basename case-insensitive
    - buildTagViewTree empty hierarchy → []
    - buildTagViewTree single top-level tag with count 5 → [{name:'api', fullPath:'api', count:5, children:[]}]
    - buildTagViewTree nested tag → fullPath joins ancestors with '/'
    - buildTagViewTree children sorted alphabetically
  </behavior>
  <action>
Create `src/lib/sidebar-data.ts`:

```typescript
import { TagNode } from './vault-index-types';

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

/** Last segment of a slash-separated path. '' for root path ''. */
function lastSegment(path: string): string {
  if (path === '') return '';
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Parent of a slash-separated path. '' for root or single-segment path. */
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
  isExcluded: (filePath: string, patterns: string[]) => boolean,
): FolderTreeNode {
  // Filter folders by exclusion.
  const includedFolders = allFolderPaths.filter(p => !isExcluded(p, excludedPaths));
  // Build a lookup so we can attach children efficiently.
  const nodes = new Map<string, FolderTreeNode>();
  for (const folderPath of includedFolders) {
    nodes.set(folderPath, {
      type: 'folder',
      path: folderPath,
      name: lastSegment(folderPath),
      childFolders: [],
      childFiles: [],
      hasMoc: resolveFormat(folderPath) === 'dedicated',
    });
  }
  // Ensure root '' exists even if not in input — caller may not include it.
  if (!nodes.has('')) {
    nodes.set('', {
      type: 'folder', path: '', name: '', childFolders: [], childFiles: [],
      hasMoc: resolveFormat('') === 'dedicated',
    });
  }
  // Wire parent → child folder links.
  for (const folderPath of nodes.keys()) {
    if (folderPath === '') continue;
    const parent = parentPath(folderPath);
    const parentNode = nodes.get(parent);
    if (parentNode) parentNode.childFolders.push(nodes.get(folderPath)!);
  }
  // Attach files (filtered).
  for (const [folderPath, files] of filesByFolder) {
    const node = nodes.get(folderPath);
    if (!node) continue;
    for (const file of files) {
      if (file.kbManaged) continue;
      if (isExcluded(file.path, excludedPaths)) continue;
      node.childFiles.push({ path: file.path, basename: file.basename });
    }
  }
  // Sort all collections.
  for (const node of nodes.values()) {
    node.childFolders.sort((a, b) => compareCaseInsensitive(a.name, b.name));
    node.childFiles.sort((a, b) => compareCaseInsensitive(a.basename, b.basename));
  }
  return nodes.get('')!;
}

export function buildTagViewTree(
  hierarchy: Map<string, TagNode>,
  countForTag: (fullPath: string) => number,
): TagTreeViewNode[] {
  return buildTagLevel(hierarchy, '', countForTag);
}

function buildTagLevel(
  level: Map<string, TagNode>,
  prefix: string,
  countForTag: (fullPath: string) => number,
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
```

Constraints:
- Zero Obsidian imports
- File ≤ 200 lines (target ~140)
- Functions ≤ 30 lines (recursive `buildTagLevel` kept tight)
- No console
- Named exports only
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build 2>&1 | tail -3 && grep -c "from 'obsidian'" src/lib/sidebar-data.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0
    - `grep -c "from 'obsidian'" src/lib/sidebar-data.ts` outputs 0
    - `grep -c "^import" src/lib/sidebar-data.ts` outputs 1
    - `grep "from './vault-index-types'" src/lib/sidebar-data.ts | grep -c "TagNode"` outputs 1
    - `grep -c "^export function buildFolderTree" src/lib/sidebar-data.ts` outputs 1
    - `grep -c "^export function buildTagViewTree" src/lib/sidebar-data.ts` outputs 1
    - `grep -c "^export interface FolderTreeNode" src/lib/sidebar-data.ts` outputs 1
    - `grep -c "^export interface TagTreeViewNode" src/lib/sidebar-data.ts` outputs 1
    - `grep -c "^export interface FileEntry" src/lib/sidebar-data.ts` outputs 1
    - `grep -c "console" src/lib/sidebar-data.ts` outputs 0
    - `wc -l src/lib/sidebar-data.ts` outputs ≤ 200
  </acceptance_criteria>
  <done>buildFolderTree assembles a filtered, sorted folder tree from flat input. buildTagViewTree mirrors VaultIndex tag hierarchy with full paths and counts attached.</done>
</task>

</tasks>

<verification>
After tasks complete:
```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm run build
```
Vitest unit tests in Plan 07-04.
</verification>
