import { describe, it, expect } from 'vitest';
import {
  DEDICATED_FRONTMATTER_KEYS,
  MocBuildInput,
  buildDedicatedMocFile,
  buildMocBody,
} from './moc-builder';
import { TagNode } from './vault-index-types';

function buildTree(pairs: Array<{ file: string; tags: string[] }>): Map<string, TagNode> {
  const root = new Map<string, TagNode>();
  for (const { file, tags } of pairs) {
    for (const tag of tags) addTag(root, file, tag);
  }
  return root;
}

function addTag(root: Map<string, TagNode>, file: string, tag: string): void {
  let current = root;
  const segments = tag.split('/');
  for (const [i, segment] of segments.entries()) {
    if (!current.has(segment)) current.set(segment, { files: [], children: new Map() });
    const node = current.get(segment)!;
    if (i === segments.length - 1) node.files.push(file);
    current = node.children;
  }
}

describe('buildMocBody', () => {
  it('returns empty string for empty input', () => {
    const input: MocBuildInput = { tagTree: new Map(), untaggedFiles: [] };
    expect(buildMocBody(input)).toBe('');
  });

  it('renders single tag with single file', () => {
    const tagTree = buildTree([{ file: 'note.md', tags: ['api'] }]);
    expect(buildMocBody({ tagTree, untaggedFiles: [] })).toBe('## api\n- [[note]]\n');
  });

  it('renders nested tag with incremented heading levels', () => {
    const tagTree = buildTree([{ file: 'spec.md', tags: ['project/alpha'] }]);
    expect(buildMocBody({ tagTree, untaggedFiles: [] })).toBe(
      '## project\n### alpha\n- [[spec]]\n'
    );
  });

  it('lists multi-tag file under each tag section', () => {
    const tagTree = buildTree([{ file: 'note.md', tags: ['x', 'y'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result).toContain('## x\n- [[note]]');
    expect(result).toContain('## y\n- [[note]]');
  });

  it('clamps heading depth at h6', () => {
    const tagTree = buildTree([{ file: 'deep.md', tags: ['a/b/c/d/e/f/g'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result).toContain('##### d');
    expect(result).toContain('###### e');
    expect(result).toContain('###### f');
    expect(result).toContain('###### g');
  });

  it('renders untagged section last', () => {
    const tagTree = buildTree([{ file: 'tagged.md', tags: ['api'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: ['untagged.md'] });
    expect(result.indexOf('## api')).toBeLessThan(result.indexOf('## Untagged'));
    expect(result).toContain('- [[untagged]]');
  });

  it('omits untagged section when no untagged files exist', () => {
    const tagTree = buildTree([{ file: 'note.md', tags: ['api'] }]);
    expect(buildMocBody({ tagTree, untaggedFiles: [] })).not.toContain('## Untagged');
  });

  it('renders untagged-only input', () => {
    const result = buildMocBody({ tagTree: new Map(), untaggedFiles: ['note.md'] });
    expect(result).toBe('## Untagged\n- [[note]]\n');
  });

  it('uses basename-only wikilinks', () => {
    const tagTree = buildTree([{ file: 'notes/projects/spec.md', tags: ['api'] }]);
    const result = buildMocBody({ tagTree, untaggedFiles: [] });
    expect(result).toContain('- [[spec]]');
    expect(result).not.toContain('notes/projects');
  });

  it('sorts files within a section case-insensitively', () => {
    const tagTree = buildTree([
      { file: 'cherry.md', tags: ['fruit'] },
      { file: 'Banana.md', tags: ['fruit'] },
      { file: 'apple.md', tags: ['fruit'] },
    ]);
    const lines = buildMocBody({ tagTree, untaggedFiles: [] })
      .split('\n')
      .filter(line => line.startsWith('- '));
    expect(lines).toEqual(['- [[apple]]', '- [[Banana]]', '- [[cherry]]']);
  });
});

describe('buildDedicatedMocFile', () => {
  it('emits expected frontmatter keys', () => {
    expect(DEDICATED_FRONTMATTER_KEYS).toEqual(['kb-managed', 'kb-type', 'kb-folder']);
  });

  it('uses folder path in frontmatter and h1', () => {
    const result = buildDedicatedMocFile('notes/projects', '## api\n- [[a]]\n');
    expect(result).toContain('kb-managed: true\nkb-type: moc\nkb-folder: notes/projects');
    expect(result).toContain('# MOC: notes/projects');
  });

  it('uses vault root label for root folder', () => {
    expect(buildDedicatedMocFile('', '')).toContain('# MOC: vault root');
  });

  it('places body after the title', () => {
    const result = buildDedicatedMocFile('notes', '## api\n- [[a]]\n');
    expect(result.endsWith('# MOC: notes\n\n## api\n- [[a]]\n')).toBe(true);
  });
});
