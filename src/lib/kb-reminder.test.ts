import { describe, expect, it } from 'vitest';
import {
  buildReminderDraft,
  buildReviewReminderText,
  buildReviewTaskLine,
  getReviewDueAt,
} from './kb-reminder';

describe('kb reminder helpers', () => {
  it('builds a vault-level reminder label', () => {
    expect(buildReviewReminderText('')).toBe('Review KB updates for vault');
  });

  it('builds a scoped reminder label', () => {
    expect(buildReviewReminderText('Projects/HaloMCP')).toBe('Review KB updates for Projects/HaloMCP');
  });

  it('calculates due dates at least one day out', () => {
    const now = new Date(2026, 3, 30, 10);
    expect(getReviewDueAt(0, now)).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });

  it('builds quick reminder draft shape', () => {
    const now = new Date(2026, 3, 30, 10);
    const draft = buildReminderDraft('Projects/HaloMCP', now.getTime() + 1000, now);
    expect(draft).toMatchObject({
      text: 'Review KB updates for Projects/HaloMCP',
      createdAt: now.getTime(),
      notified: false,
    });
    expect(draft.id).toMatch(/^kb_/);
  });

  it('builds fallback task line', () => {
    const dueAt = new Date(2026, 4, 7).getTime();
    expect(buildReviewTaskLine('', dueAt)).toContain('Review KB updates for vault');
    expect(buildReviewTaskLine('', dueAt)).toContain('#kb/update');
  });
});
