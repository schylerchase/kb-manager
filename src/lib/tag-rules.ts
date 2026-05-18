/**
 * Pure tag-rules engine. Production wiring in main.ts subscribes to
 * vault create/modify events and calls {@link evaluateRules} to decide
 * which tags to apply.
 *
 * Rules execute in priority order; all matching actions accumulate
 * (so multiple rules can add tags to the same note).
 */

export type TagRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: 'on-create' | 'on-modify' | 'manual';
  /** Predicate. Empty fields are ignored (treated as wildcards). */
  match: {
    folderPath?: string;
    pathRegex?: string;
  };
  action: {
    addTags?: string[];
  };
};

export type RuleEvalInput = {
  filePath: string;
  trigger: 'on-create' | 'on-modify' | 'manual';
};

export type RuleEvalResult = {
  matchedRules: TagRule[];
  tagsToAdd: string[];
};

/**
 * Decide which rules fire for `input` and aggregate their tags.
 *
 * Returns the matched rules (for logging) and a deduplicated tag list.
 * Never throws — invalid regexes log via the optional `onError` callback
 * and the rule is skipped.
 */
export function evaluateRules(rules: ReadonlyArray<TagRule>, input: RuleEvalInput, onError?: (rule: TagRule, error: Error) => void): RuleEvalResult {
  const matched: TagRule[] = [];
  const tags = new Set<string>();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.trigger !== input.trigger && rule.trigger !== 'manual') continue;
    try {
      if (!ruleMatches(rule, input.filePath)) continue;
    } catch (err) {
      onError?.(rule, err instanceof Error ? err : new Error(String(err)));
      continue;
    }
    matched.push(rule);
    for (const tag of rule.action.addTags ?? []) tags.add(tag);
  }

  return { matchedRules: matched, tagsToAdd: [...tags] };
}

function ruleMatches(rule: TagRule, filePath: string): boolean {
  const { folderPath, pathRegex } = rule.match;
  if (folderPath) {
    const normalizedFolder = folderPath.replace(/\/+$/, '');
    const prefix = normalizedFolder === '' ? '' : `${normalizedFolder}/`;
    if (prefix !== '' && !filePath.startsWith(prefix)) return false;
  }
  if (pathRegex) {
    const re = new RegExp(pathRegex);
    if (!re.test(filePath)) return false;
  }
  return true;
}

export const DEFAULT_RULES: TagRule[] = [];
