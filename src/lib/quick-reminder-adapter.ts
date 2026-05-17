import type { App } from 'obsidian';

const QUICK_REMINDER_PLUGIN_ID = 'quick-reminder';
const QUICK_REMINDER_OPEN_COMMAND = `${QUICK_REMINDER_PLUGIN_ID}:open-view`;

export interface QuickReminderReminder {
  id: string;
  text: string;
  rawInput: string;
  dueAt: number;
  createdAt: number;
  notified: boolean;
}

export interface QuickReminderAdapter {
  /**
   * Persists the reminder via Quick Reminder's store, then schedules its
   * native notification. If scheduling fails after the store write succeeded,
   * we roll back the store write so the caller can safely fall back to the
   * markdown task path without producing a duplicate reminder.
   */
  addAndSchedule(reminder: QuickReminderReminder): Promise<void>;
  openManager(): void;
}

type QuickReminderPluginShape = {
  store?: {
    add(reminder: QuickReminderReminder): Promise<void>;
    remove?(id: string): Promise<void>;
  };
  scheduler?: { schedule(reminder: QuickReminderReminder): void };
};

type AppWithPluginRegistry = App & {
  commands?: { executeCommandById(id: string): unknown };
  plugins?: { plugins?: Record<string, unknown> };
};

export function getQuickReminderAdapter(app: App): QuickReminderAdapter | null {
  const host = app as AppWithPluginRegistry;
  const plugin = host.plugins?.plugins?.[QUICK_REMINDER_PLUGIN_ID];
  if (!plugin || typeof plugin !== 'object') return null;

  const shape = plugin as QuickReminderPluginShape;
  const addReminder = shape.store?.add?.bind(shape.store);
  const schedule = shape.scheduler?.schedule?.bind(shape.scheduler);
  const removeReminder = shape.store?.remove?.bind(shape.store);
  if (!addReminder || !schedule) return null;

  return {
    addAndSchedule: async (reminder) => {
      await addReminder(reminder);
      try {
        // Wrap in Promise.resolve so both synchronous throws AND async
        // rejections (in case Quick Reminder makes schedule async in a
        // future version) hit the catch block.
        await Promise.resolve(schedule(reminder));
      } catch (err) {
        // Best-effort rollback so the caller's fallback path doesn't
        // produce a duplicate reminder (one in Quick Reminder, one in
        // the markdown task file).
        if (removeReminder) {
          await removeReminder(reminder.id).catch(() => {});
        }
        throw err;
      }
    },
    openManager: () => {
      host.commands?.executeCommandById(QUICK_REMINDER_OPEN_COMMAND);
    },
  };
}
