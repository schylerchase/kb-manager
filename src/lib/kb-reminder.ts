export interface ReminderDraft {
  id: string;
  text: string;
  rawInput: string;
  dueAt: number;
  createdAt: number;
  notified: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getReviewDueAt(daysFromNow: number, now: Date): number {
  // Guard NaN/Infinity from corrupted settings so dueAt is always a finite
  // timestamp — otherwise downstream setTimeout(NaN) fires immediately and
  // markdown task lines show "due Invalid Date".
  const days = Number.isFinite(daysFromNow) ? Math.max(1, daysFromNow) : 1;
  return now.getTime() + days * DAY_MS;
}

export function buildReviewReminderText(scopePath: string): string {
  const scope = scopePath === '' ? 'vault' : scopePath;
  return `Review KB updates for ${scope}`;
}

export function buildReminderDraft(scopePath: string, dueAt: number, now: Date): ReminderDraft {
  const text = buildReviewReminderText(scopePath);
  return {
    id: `kb_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    rawInput: `${text} ${new Date(dueAt).toLocaleString()}`,
    dueAt,
    createdAt: now.getTime(),
    notified: false,
  };
}

export function buildReviewTaskLine(scopePath: string, dueAt: number): string {
  const due = new Date(dueAt).toLocaleDateString();
  return `- [ ] ${buildReviewReminderText(scopePath)} (due ${due}) #kb/update`;
}
