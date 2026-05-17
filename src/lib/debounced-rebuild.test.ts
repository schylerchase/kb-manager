import { describe, it, expect } from 'vitest';
import { DebouncedRebuild } from './debounced-rebuild';
import type { TimerHost } from './debounced-rebuild';

describe('DebouncedRebuild', () => {
  it('flushes a pending rebuild instead of dropping it', () => {
    const timers = new FakeTimers();
    const calls: string[] = [];
    const rebuild = new DebouncedRebuild(
      async () => {
        calls.push('run');
      },
      error => {
        throw error;
      },
      600,
      timers,
    );

    rebuild.schedule();
    rebuild.flush();

    expect(calls).toEqual(['run']);
    expect(timers.pendingCount()).toBe(0);
  });

  it('coalesces multiple schedules into the last pending rebuild', () => {
    const timers = new FakeTimers();
    const calls: string[] = [];
    const rebuild = new DebouncedRebuild(
      async () => {
        calls.push('run');
      },
      error => {
        throw error;
      },
      600,
      timers,
    );

    rebuild.schedule();
    rebuild.schedule();
    timers.runPending();

    expect(calls).toEqual(['run']);
    expect(timers.pendingCount()).toBe(0);
  });
});

class FakeTimers implements TimerHost {
  private nextHandle = 1;
  private callbacks = new Map<number, () => void>();

  setTimeout(callback: () => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  clearTimeout(handle: number): void {
    this.callbacks.delete(handle);
  }

  runPending(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback();
  }

  pendingCount(): number {
    return this.callbacks.size;
  }
}
