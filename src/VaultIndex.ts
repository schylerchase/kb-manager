import { App, TFile, getAllTags } from 'obsidian';
import { FileRecord, FolderRecord, TagNode, HeadingRecord } from './lib/vault-index-types';
import { normalizeTags, buildTagTree, buildFlatTagMap, indexFolders } from './lib/tag-utils';
import { isExcluded } from './lib/exclusions';

/**
 * In-memory index of all vault files, folders, tags, and headings.
 * D-12: lives on the plugin instance (this.index). Created in onload(),
 * populated after onLayoutReady fires.
 *
 * All downstream generators (MOC, TOC, TagManager, Sidebar) query this
 * class — nothing reads MetadataCache directly.
 */
export default class VaultIndex {
  private files = new Map<string, FileRecord>();
  private folders = new Map<string, FolderRecord>();
  private tagTree = new Map<string, TagNode>();
  private flatTagMap = new Map<string, string[]>();
  private dirty = new Set<string>();

  /** D-11: single callback fired after every rebuild() and rebuildDirty(). */
  onRebuildComplete: (() => void | Promise<void>) | null = null;

  constructor(private app: App, private excludedPaths: string[]) {}

  // --- Mutation (called from main.ts vault events) ---

  /** D-08: mark a file dirty on modify/create/rename. */
  markDirty(filePath: string): void {
    this.dirty.add(filePath);
  }

  /** D-08: delete removes the file from the index immediately, not mark-dirty. */
  remove(filePath: string): void {
    this.files.delete(filePath);
    this.dirty.delete(filePath);
    // Rebuild derived maps to remove stale folder/tag entries.
    this._rebuildDerivedMaps();
  }

  // --- Rebuild ---

  /** Full rebuild — clears all maps and re-indexes every non-excluded vault file. */
  async rebuild(): Promise<void> {
    this.files.clear();
    this.folders.clear();
    this.tagTree.clear();
    this.flatTagMap.clear();
    this.dirty.clear();

    const allFiles = this.app.vault.getMarkdownFiles();
    for (const file of allFiles) {
      if (isExcluded(file.path, this.excludedPaths)) continue;
      this._indexFile(file);
    }
    this._rebuildDerivedMaps();
    await this.onRebuildComplete?.();
  }

  /**
   * D-09: re-index only dirty files, keep clean FileRecords in place,
   * then clear the dirty set. Called by Phase 3 scheduler on each tick.
   */
  async rebuildDirty(): Promise<void> {
    if (this.dirty.size === 0) return;
    const dirtyPaths = new Set(this.dirty);
    this.dirty.clear();

    for (const filePath of dirtyPaths) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        this._indexFile(file);
      } else {
        // File deleted or moved — remove stale record.
        this.files.delete(filePath);
      }
    }
    this._rebuildDerivedMaps();
    await this.onRebuildComplete?.();
  }

  // --- Query API (D-10) ---

  /** O(1) lookup of all FileRecords in a folder. D-03. */
  getFilesInFolder(folderPath: string): FileRecord[] {
    const folder = this.folders.get(folderPath);
    if (!folder) return [];
    return folder.files
      .map(p => this.files.get(p))
      .filter((r): r is FileRecord => r !== undefined);
  }

  /** O(1) lookup of file paths with an exact (normalized) tag. D-05. */
  getFilesWithTag(tag: string): string[] {
    return this.flatTagMap.get(tag) ?? [];
  }

  /** Return flat heading array for a file. D-01. */
  getHeadings(filePath: string): HeadingRecord[] {
    return this.files.get(filePath)?.headings ?? [];
  }

  /** All folder paths currently indexed. */
  getAllFolders(): string[] {
    return Array.from(this.folders.keys());
  }

  /** All indexed file records. */
  getAllFiles(): FileRecord[] {
    return Array.from(this.files.values());
  }

  /** Raw tag hierarchy tree. D-04/D-06. */
  getTagTree(): Map<string, TagNode> {
    return this.tagTree;
  }

  /** True if filePath is in the dirty set. D-07/D-09. */
  isDirty(filePath: string): boolean {
    return this.dirty.has(filePath);
  }

  // --- Private helpers ---

  /** Build or refresh a single FileRecord from MetadataCache. */
  private _indexFile(file: TFile): void {
    const cache = this.app.metadataCache.getFileCache(file);
    const rawTags = cache ? (getAllTags(cache) ?? []) : [];
    const tags = normalizeTags(rawTags);
    const headings: HeadingRecord[] = (cache?.headings ?? []).map(h => ({
      text: h.heading,
      level: h.level,
    }));
    const lastSlash = file.path.lastIndexOf('/');
    const folderPath = lastSlash === -1 ? '' : file.path.slice(0, lastSlash);
    this.files.set(file.path, { path: file.path, tags, headings, folderPath });
  }

  /** Rebuild folder map, tag tree, and flat tag map from the current files map. */
  private _rebuildDerivedMaps(): void {
    const pairs = Array.from(this.files.values()).map(r => ({
      filePath: r.path,
      tags: r.tags,
    }));
    this.tagTree = buildTagTree(pairs);
    this.flatTagMap = buildFlatTagMap(pairs);
    this.folders = indexFolders(Array.from(this.files.keys()));
  }
}
