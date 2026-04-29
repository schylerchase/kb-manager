/**
 * A single heading extracted from a file's MetadataCache.
 * D-01: flat array per file — no nested tree. level 1=h1 ... 6=h6.
 */
export interface HeadingRecord {
  text: string;
  level: number;
}

/**
 * Indexed representation of a single vault file.
 * D-02: tags are normalized (# stripped, lowercased, deduplicated per file).
 * D-03: folderPath is the parent directory path; '' for root-level files.
 */
export interface FileRecord {
  path: string;
  tags: string[];
  headings: HeadingRecord[];
  folderPath: string;
}

/**
 * Indexed representation of a vault folder.
 * D-03: separate map alongside FileRecord map for O(1) getFilesInFolder().
 * files contains vault-relative paths of files directly in this folder.
 */
export interface FolderRecord {
  path: string;
  name: string;
  files: string[];
}

/**
 * One node in the tag hierarchy tree.
 * D-04: TagNode = { files, children }. Root Map<string, TagNode> holds top-level
 * tag segments; children recurse for #parent/child patterns.
 */
export interface TagNode {
  files: string[];
  children: Map<string, TagNode>;
}
