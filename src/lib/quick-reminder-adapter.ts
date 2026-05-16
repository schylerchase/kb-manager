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
  addAndSchedule(reminder: QuickReminderReminder): Promise<void>;
  openManager(): void;
}

type QuickReminderPluginShape = {
  store?: { add(reminder: QuickReminderReminder): Promise<void> };
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
  if (!addReminder || !schedule) return null;

  return {
    addAndSchedule: async (reminder) => {
      await addReminder(reminder);
      schedule(reminder);
    },
    openManager: () => {
      host.commands?.executeCommandById(QUICK_REMINDER_OPEN_COMMAND);
    },
  };
}
