# Phase 8: Preview / Apply UX - Context

**Gathered:** 2026-04-30
**Status:** Backfilled — implementation already shipped inline; this doc captures the decisions for traceability

<domain>
## Phase Boundary

A safe-by-default first-run experience. On a fresh install (or upgrade from v1), KB Manager
indexes the vault and shows the sidebar but does NOT write any generated content — no
`MOC.md`, no `INDEX.md`, no managed-section updates. The user sees the inferred structure
in the sidebar, decides whether they want it materialised, and toggles `Generated content
writes` in settings to opt in. Toggling on triggers an immediate manual rebuild so the
vault reflects the previewed structure right away.

Requirements in scope: PREV-01, PREV-02, PREV-03 (new — see Requirements addendum below)

</domain>

<decisions>
## Implementation Decisions

### Setting Shape (PREV-01)
- **D-01:** New setting field: `generatedWritesEnabled: boolean`. Default `false`.
  Persists with the rest of `KBManagerSettings` via the existing `loadData/saveData`
  pipeline — no migration needed; missing key reads as `false` for existing installs.
- **D-02:** Setting label: `Generated content writes`. Description:
  `Off by default. Preview the MOC tree and tags without creating MOC.md, INDEX.md,
  or updating managed sections.` Lives at the top of the settings tab — it is the
  master gate that conditions every other write-touching setting below it.
- **D-03:** Toggle handler: on flip-to-true, call `plugin.runManualRebuild()` so the
  user sees writes happen the moment they opt in (no waiting for the next interval).
  On flip-to-false, do nothing — existing `MOC.md`/`INDEX.md` files are left in place;
  next rebuild simply skips updating them.

### Write Gate (PREV-02)
- **D-04:** Single chokepoint: `runGenerators()` in `src/main.ts`. When
  `settings.generatedWritesEnabled === false`, the function calls
  `notifySidebarRefresh()` and returns BEFORE invoking `mocGenerator.run()` or
  `tocGenerator.run()`. This guarantees the sidebar still updates from the fresh
  index while no `vault.process()` write is issued.
- **D-05:** No per-generator opt-out flag. Both MOC and TOC writes are gated together
  — preview mode is all-or-nothing in v1. Per-feature gates (e.g., MOC on, TOC off)
  are deferred to v2 as they multiply the test matrix without solving a real first-run
  problem.
- **D-06:** Auto-injection (`autoInject`, MOC-06) and dedicated MOC writes (MOC-01)
  are both downstream of the gate. The existing settings descriptions are reworded
  to make the dependency explicit (e.g., `When writes are enabled, automatically
  injects...`) so the user understands those switches do nothing while the master
  gate is off.

### Surfacing Preview State (PREV-03)
- **D-07:** Status bar text: `KB: preview` when `generatedWritesEnabled === false`
  and the rebuild mutex is idle. `KB: idle` when writes are enabled and idle.
  `KB: rebuilding…` during a rebuild regardless of mode (no need to surface the
  gate while work is in flight). Implemented via `private statusText()` helper so
  every place that resets the status bar (after rebuild, after manual trigger) calls
  the same source of truth.
- **D-08:** Manual-rebuild Notice: `KB Manager: rebuild complete` when writes on,
  `KB Manager: preview refreshed - generated writes are off` when writes off.
  Same Notice site (`runManualRebuild` success branch); branch on the setting.
- **D-09:** README and `installers/README.md` get a one-paragraph note explaining
  that the plugin starts in preview mode on first enable and how to opt in. No
  in-app modal or first-run popup — the status bar text + the explicit toggle are
  enough surface area for v1.

### Claude's Discretion
- Exact wording of the Notice / status bar text — kept short, no emoji.
- Whether the toggle handler awaits `runManualRebuild()` — yes, so the toast lands
  after the first apply finishes; users don't see "preview refreshed" overlap with
  the new "rebuild complete".
- Whether to log a `console.warn` when writes are off and a rebuild runs — no,
  the Notice is enough; warnings would spam every 5-min tick.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/REQUIREMENTS.md` §Settings — new PREV-01..03 entries (added by this phase)
- `.planning/ROADMAP.md` §Phase 8 — Success criteria (3 criteria, see ROADMAP)

### Project Rules (MANDATORY)
- `CLAUDE.md` §Critical Obsidian Plugin Rules — `vault.process()` only, no
  `console.log` in production
- `CLAUDE.md` §File Size Limits — Functions <30, Files <300, Nesting <3

### Prior Phase Decisions
- `.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md` §Settings
  schema (D-09..D-12): preserves the same `KBManagerSettings` interface + default
  pattern. New `generatedWritesEnabled` field added to both.
- `.planning/phases/03-background-update-scheduler/03-CONTEXT.md` §runManualRebuild
  notice + status bar conventions: this phase reuses both surfaces.
- `.planning/phases/05-toc-generator/05-03-PLAN-main-integration.md` §runGenerators
  ordering: gate is added at the top of `runGenerators` so the previously established
  `mocGenerator → tocGenerator → notifySidebarRefresh` order still holds when
  writes are enabled.
- `.planning/phases/07-sidebar-view/07-CONTEXT.md` §D-22 refresh ordering:
  sidebar refresh still fires in preview mode — that is the whole point of preview.

### Existing Code (consumed)
- `src/settings.ts` — `KBManagerSettings` interface, `DEFAULT_SETTINGS`,
  `KBSettingsTab.display()`. Adds the new field, default, and toggle UI at the top.
- `src/main.ts` — `runManualRebuild`, `runGenerators`, status bar updates. All three
  branches gain a setting check.
- `README.md`, `installers/README.md` — preview-mode paragraph appended.

### Obsidian API surfaces used
- No new Obsidian APIs. Reuses `Setting.addToggle`, existing `Notice`, existing
  `statusBarItem.setText`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `KBSettingsTab` already exposes `runManualRebuild()` via the `SettingsHost` type —
  toggle handler calls it directly, no new wiring.
- `notifySidebarRefresh()` already exists from Phase 7; preview mode reuses it as the
  no-write code path.

### Established Patterns
- Settings field add: extend interface + DEFAULT_SETTINGS + render in `display()`.
  Every prior phase that added a setting (interval, autoInject, defaultMocFormat) used
  this pattern.
- Status bar text: helper method returning the right string based on settings keeps
  call sites uniform. Mirrors the existing `STATUS_IDLE` / `STATUS_REBUILDING`
  constants — preview just adds `STATUS_PREVIEW`.

### Integration Points
- `src/settings.ts` interface `KBManagerSettings`: add `generatedWritesEnabled: boolean`.
- `src/settings.ts` `DEFAULT_SETTINGS`: add `generatedWritesEnabled: false`.
- `src/settings.ts` `SettingsHost` type: add `runManualRebuild(): Promise<void>` so the
  toggle handler can call it without `any` casts.
- `src/settings.ts` `display()`: new `Setting(...).addToggle(...)` block at top of the
  rendered settings, before the interval slider.
- `src/main.ts` constants: add `const STATUS_PREVIEW = 'KB: preview';` alongside the
  existing status constants.
- `src/main.ts` `runGenerators`: insert preview-mode short-circuit before generator calls.
- `src/main.ts` `runManualRebuild`: branch the success Notice text on the setting.
- `src/main.ts` status bar resets (`onLayoutReady` initial set, `runManualRebuild`
  finally): switch from `STATUS_IDLE` literal to `this.statusText()`.

</code_context>

<specifics>
## Specific Details

### Settings interface delta (Plan 08-01)
```typescript
export interface KBManagerSettings {
  generatedWritesEnabled: boolean;   // NEW — master gate, default false
  updateIntervalMinutes: number;
  autoInject: boolean;
  excludedPaths: string[];
  // ...existing fields unchanged
}

export const DEFAULT_SETTINGS: KBManagerSettings = {
  generatedWritesEnabled: false,     // NEW
  updateIntervalMinutes: 5,
  autoInject: false,
  excludedPaths: [],
  // ...
};

type SettingsHost = {
  // ...existing
  runManualRebuild(): Promise<void>; // NEW — used by toggle handler
};
```

### main.ts gate shape (Plan 08-01)
```typescript
const STATUS_PREVIEW = 'KB: preview';

private async runGenerators(): Promise<void> {
  if (!this.settings.generatedWritesEnabled) {
    this.notifySidebarRefresh();
    return;
  }
  await this.mocGenerator.run();
  await this.tocGenerator.run();
  this.notifySidebarRefresh();
}

private statusText(): string {
  return this.settings.generatedWritesEnabled ? STATUS_IDLE : STATUS_PREVIEW;
}
```

### Toggle handler shape (Plan 08-01)
```typescript
.addToggle(t =>
  t
    .setValue(this.plugin.settings.generatedWritesEnabled)
    .onChange(async v => {
      this.plugin.settings.generatedWritesEnabled = v;
      try {
        await this.plugin.saveSettings();
        if (v) await this.plugin.runManualRebuild();
      } catch (err) {
        console.error('KB Manager: failed to save settings', err);
      }
    })
);
```

### Manual UAT
1. Fresh install: status bar shows `KB: preview`. Sidebar populates after first
   index rebuild. No `MOC.md` / `INDEX.md` files created. No managed-section
   updates in user notes.
2. Manual rebuild ribbon click: Notice reads
   `KB Manager: preview refreshed - generated writes are off`. No writes occur.
3. Settings → toggle `Generated content writes` ON. Notice reads
   `KB Manager: rebuild complete`. `MOC.md` files appear in non-excluded folders;
   inline managed sections update where delimiters exist.
4. Status bar now shows `KB: idle`. Subsequent rebuilds keep the new behaviour.
5. Toggle OFF again: existing generated files remain on disk. Next rebuild does
   not modify them. Status bar returns to `KB: preview`.
6. Restart Obsidian: setting persists. Mode (on or off) survives.

### Requirements addendum (added by this phase)
Add to `.planning/REQUIREMENTS.md` §Settings:
```
- [x] **PREV-01**: Plugin ships with `generatedWritesEnabled` setting, default off, that
  gates all generated content writes (MOC.md, INDEX.md, managed sections)
- [x] **PREV-02**: With writes off, manual and scheduled rebuilds refresh the index
  and sidebar but do not invoke MOC or TOC generators
- [x] **PREV-03**: Status bar and rebuild Notice surface preview state to the user;
  README documents preview-mode default for first-run users
```

</specifics>

<deferred>
## Deferred Ideas

- **Per-feature gates**: separate toggles for MOC writes vs TOC writes vs auto-inject.
  v2 — multiplies the test matrix without solving a v1 first-run problem.
- **First-run modal / onboarding flow**: explicit "Welcome — preview mode is on" dialog
  with "Apply now" button. v2 — status bar + setting toggle is enough surface for v1.
- **Diff preview before apply**: show what writes WILL happen before the toggle flips
  on. v2 — meaningful but expensive; needs a new generator dry-run mode.
- **Apply-once command**: single rebuild with writes ON without flipping the persistent
  setting. v2 — niche; users wanting this can toggle on, rebuild, toggle off.
- **Cleanup on toggle-off**: optionally delete the generated `MOC.md` / `INDEX.md`
  files when writes are disabled. v2 — destructive; needs explicit confirmation UX.

</deferred>

---

*Phase: 8-Preview Apply UX*
*Context backfilled: 2026-04-30*
