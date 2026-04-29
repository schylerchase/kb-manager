---
phase: 03-background-update-scheduler
plan: "01"
subsystem: scheduler
tags: [obsidian-plugin, scheduler, mutex, status-bar]

requires:
  - "Phase 2 VaultIndex with rebuild() and rebuildDirty()"
provides:
  - "src/main.ts scheduler fields and lifecycle methods"
  - "Promise-based rebuild mutex shared by initial, scheduled, and manual rebuilds"
  - "Coalesced manual rebuild queue so duplicate clicks do not stack"
  - "Status bar text for idle/rebuilding state"
affects:
  - "03-02 ribbon and command callbacks call runManualRebuild()"
  - "Phase 7 sidebar can later observe VaultIndex.onRebuildComplete"

key-files:
  modified:
    - src/main.ts

requirements-completed: [SCHED-01, SCHED-02, SCHED-03]
completed: 2026-04-29
---

# Phase 3 Plan 01: Scheduler + Mutex Summary

## Accomplishments

- Added `schedulerHandle`, `rebuildLock`, and `statusBarItem` state to `KBManagerPlugin`.
- Added `queuedManualRebuild` so duplicate manual rebuild clicks share one queued rebuild.
- Added `startScheduler`, `stopScheduler`, `restartScheduler`, `runScheduledTick`, `runManualRebuild`, and shared lock helpers.
- Scheduled ticks use `VaultIndex.rebuildDirty()` and drop when another rebuild is active.
- Manual rebuilds queue behind an active rebuild; repeated clicks coalesce onto the same queued promise.
- Initial rebuild and vault event registration remain inside `onLayoutReady`; scheduler starts after the initial rebuild settles.
- Status bar now shows `KB: idle` and `KB: rebuilding...` around rebuild work.

## Verification

- `npm run build` passed.
- `npm run test` passed: 53 tests across 4 files.
- `src/main.ts` uses `window.setInterval`, not bare `setInterval`.
- `src/main.ts` has no `console.log`.

## Deviation

- While running the build, TypeScript surfaced a pre-existing `noUncheckedIndexedAccess` issue in `src/lib/tag-utils.ts`. Fixed it narrowly by iterating tag segments with `segments.entries()`.
