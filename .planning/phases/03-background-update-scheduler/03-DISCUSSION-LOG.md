# Phase 3: Background Update Scheduler - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 3-Background Update Scheduler
**Areas discussed:** Tick scope, Mutex contention, Rebuild visibility, Settings → timer restart

---

## Tick scope — full vs dirty rebuild

| Option | Description | Selected |
|--------|-------------|----------|
| Dirty only | `rebuildDirty()` each tick. Fast. Vault events catch internal edits. Out-of-band edits picked up by manual rebuild or restart. | ✓ |
| Full every tick | `rebuild()` each tick. Catches all drift but heavier. Acceptable for small vaults; not for 5000+ notes. | |
| Hybrid — dirty + periodic full | `rebuildDirty()` most ticks; `rebuild()` every N ticks (e.g., every 12th = hourly if interval=5min). Catches drift without per-tick cost. More complexity. | |

**user's choice:** Dirty only
**Notes:** Vault events already mark dirty for internal changes; out-of-band drift is rare and recoverable via manual rebuild or restart. Avoids per-tick cost on large vaults.

---

## Mutex contention behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Queue — run manual after | Background completes, then manual full rebuild runs. user sees their click took effect. Slight delay. Notice 'Rebuild queued'. | ✓ |
| Drop — ignore manual | Log/notice 'Rebuild in progress, skipped'. Simpler. user has to retry. | |
| Block UI — await + run | Manual command awaits background, then runs. Looks like a slow click. Worst UX. | |

**user's choice:** Queue — run manual after
**Notes:** Manual click should take effect; background tick is short (incremental). Queue depth = 1 (coalesce duplicate clicks). Reverse case (background tick during running manual) is dropped — Claude's discretion.

---

## Rebuild visibility / feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Status bar + notice on manual only | Status bar shows 'KB: idle / rebuilding…'. Background = silent. Manual rebuild fires Notice on completion. | ✓ |
| Status bar only | Status bar shows state. No notices ever. Quietest. user must look at status bar. | |
| Notices for everything | Notice on every rebuild start/end including background. Noisy every 5 min. | |
| Fully silent | No visual feedback. Errors logged via `console.error` only. | |

**user's choice:** Status bar + notice on manual only
**Notes:** Background rebuilds stay invisible; manual rebuilds confirm action took effect. Background errors logged via `console.error` only (not silent).

---

## Settings change → timer restart

| Option | Description | Selected |
|--------|-------------|----------|
| Restart immediately | `onChange` handler clears old timer + starts new with fresh interval. user sees instant effect. ~10 lines extra. | ✓ |
| Wait until next tick | Old interval fires once more at old period, then restart. Simpler. user might wait up to 60min. | |
| Require plugin reload | Show notice 'Reload plugin to apply'. Simplest code. Worst UX. | |

**user's choice:** Restart immediately
**Notes:** New tick fires AFTER the new interval (not immediately on slider change), avoiding rebuild storm during slider drag.

---

## Claude's Discretion

- Method naming inside scheduler (`startScheduler`, `stopScheduler`, `restartScheduler`, `runScheduledTick`)
- Status bar update mechanism — direct `setText()` calls (acceptable for 2 states)
- Whether to extract a `RebuildMutex` class or inline the mutex — inline is acceptable per D-04
- Background tick during running manual rebuild = dropped (manual is full rebuild — incremental tick right after is redundant)
- Manual queue depth = 1 (duplicate clicks coalesce)
- Ribbon icon = `rotate-cw` (Lucide); Notice strings; command id `kb-manager-rebuild`

## Deferred Ideas

None — discussion stayed within phase scope.

(Possible future improvements: exponential backoff on rebuild failure, pause-while-typing, visual rebuild progress bar — all v2 territory.)
