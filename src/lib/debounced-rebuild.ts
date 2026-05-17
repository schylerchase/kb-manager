export interface TimerHost {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
}

export class DebouncedRebuild {
  private handle: number | null = null;

  constructor(
    private run: () => Promise<void>,
    private onError: (error: unknown) => void,
    private delayMs = 600,
    private timers: TimerHost = window,
  ) {}

  schedule(): void {
    if (this.handle !== null) {
      this.timers.clearTimeout(this.handle);
    }
    this.handle = this.timers.setTimeout(() => {
      this.handle = null;
      this.runNow();
    }, this.delayMs);
  }

  flush(): void {
    if (this.handle === null) return;
    this.timers.clearTimeout(this.handle);
    this.handle = null;
    this.runNow();
  }

  private runNow(): void {
    this.run().catch(this.onError);
  }
}
