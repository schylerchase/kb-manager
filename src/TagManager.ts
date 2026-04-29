import VaultIndex from './VaultIndex';
import { findClusterMatchedFiles } from './lib/tag-cluster';
import { TagNode } from './lib/vault-index-types';

/**
 * Stateless query facade for VaultIndex tag data.
 * Callers must pass normalized tags: lowercase, no leading '#'.
 */
export default class TagManager {
  constructor(private index: VaultIndex) {}

  getNotesWithTagCluster(tags: string[], minMatches: number = 2): string[] {
    const flatTagMap = new Map<string, string[]>();
    for (const tag of tags) {
      flatTagMap.set(tag, this.index.getFilesWithTag(tag));
    }
    return findClusterMatchedFiles(flatTagMap, tags, minMatches);
  }

  getFilesWithTag(tag: string): string[] {
    return this.index.getFilesWithTag(tag);
  }

  getTagHierarchy(): Map<string, TagNode> {
    return this.index.getTagTree();
  }

  getAllTags(): string[] {
    return [...this.index.getTagTree().keys()].sort();
  }
}
