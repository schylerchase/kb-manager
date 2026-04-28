---
phase: 01-plugin-scaffold-settings-file-safety
plan: 03
type: execute
wave: 2
depends_on:
  - 01-01-PLAN-pure-logic
files_modified:
  - src/main.ts
  - src/settings.ts
autonomous: true
requirements:
  - FOUND-01
  - FOUND-02
  - SET-01
  - SET-02
  - SET-03
  - SET-04
must_haves:
  truths:
    - "Plugin loads in Obsidian without console errors"
    - "Plugin unloads cleanly (enable/disable cycle works)"
    - "Settings tab opens and shows three sections: General, Exclusions, MOC Format"
    - "Update interval slider persists value across reload (writes to settings.updateIntervalMinutes)"
    - "Auto-injection toggle persists value across reload (writes to settings.autoInject)"
    - "Exclusion patterns textarea persists value across reload (writes to settings.excludedPaths)"
    - "Default MOC format dropdown persists value across reload (writes to settings.defaultMocFormat)"
    - "Per-folder rules textarea persists value across reload (writes to settings.folderRules via parseFolderRules)"
    - "vault events registered inside onLayoutReady, not onload"
  artifacts:
    - path: "src/main.ts"
      provides: "KBManagerPlugin class — plugin entry point"
      exports: ["default KBManagerPlugin"]
      contains: "onLayoutReady"
    - path: "src/settings.ts"
      provides: "KBManagerSettings interface + DEFAULT_SETTINGS + KBSettingsTab class"
      exports: ["KBManagerSettings", "DEFAULT_SETTINGS", "KBSettingsTab"]
      contains: "updateIntervalMinutes"
  key_links:
    - from: "src/main.ts"
      to: "src/settings.ts"
      via: "import KBManagerSettings, DEFAULT_SETTINGS, KBSettingsTab"
      pattern: "from.*settings"
    - from: "src/settings.ts"
      to: "src/lib/settings-parser.ts"
      via: "import parseFolderRules, parseExclusionPatterns"
      pattern: "from.*settings-parser"
    - from: "src/main.ts KBManagerPlugin.onload()"
      to: "app.workspace.onLayoutReady"
      via: "vault event registration deferred here"
      pattern: "onLayoutReady"
---

<objective>
Create src/main.ts (KBManagerPlugin) and src/settings.ts (KBManagerSettings + KBSettingsTab).
Together these make the plugin loadable in Obsidian with a working settings panel.

Purpose: Deliver FOUND-01 (plugin loads/unloads cleanly) and FOUND-02 (settings persist across
restarts) plus all four settings requirements (SET-01 through SET-04). All five settings fields
are stored, all onChange handlers call saveSettings(), all values survive Obsidian restart.

Output: src/main.ts, src/settings.ts
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/01-plugin-scaffold-settings-file-safety/01-UI-SPEC.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/research/STACK.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/research/ARCHITECTURE.md

<interfaces>
<!-- Contracts from Wave 1 (01-01-PLAN-pure-logic) that this plan consumes -->
<!-- These files exist after Wave 1 executes. Import as shown. -->

// src/lib/settings-parser.ts (created in Wave 1)
import { parseFolderRules, parseExclusionPatterns } from 'lib/settings-parser';
// parseFolderRules(text: string): Record<string, 'dedicated' | 'inline'>
// parseExclusionPatterns(text: string): string[]

// src/lib/exclusions.ts (created in Wave 1) — NOT imported in Phase 1 source
// (consumed directly in Phase 4+ VaultIndex; settings.ts does not call isExcluded)

// src/lib/delimiter.ts (created in Wave 1) — NOT imported in Phase 1 source
// (consumed directly in Phase 4+ generators; settings.ts does not call isWriteSafe)

<!-- Obsidian API types used in these files -->
// import { Plugin, PluginSettingTab, App, Setting } from 'obsidian';
// Plugin: extends Component; provides loadData(), saveData(), addSettingTab(), addCommand(),
//         addRibbonIcon(), registerView(), registerEvent(), registerInterval()
// PluginSettingTab: constructor(app, plugin); display(): void — build UI in containerEl
// Setting: new Setting(containerEl).setName(str).setDesc(str).addSlider/Toggle/TextArea/Dropdown(cb)
// SliderComponent: setLimits(min, max, step).setValue(n).setDynamicTooltip().onChange(cb)
// ToggleComponent: setValue(bool).onChange(cb)
// TextAreaComponent: setValue(str).setPlaceholder(str).onChange(cb)
// DropdownComponent: addOption(value, display).setValue(str).onChange(cb)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create src/settings.ts — settings schema and PluginSettingTab</name>
  <files>src/settings.ts</files>
  <read_first>
    - .planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md (D-05 through D-09)
    - .planning/phases/01-plugin-scaffold-settings-file-safety/01-UI-SPEC.md (Settings Tab Structure, Copywriting Contract)
    - .planning/research/STACK.md (section "PluginSettingTab")
  </read_first>
  <action>
Create `src/settings.ts`. This file has TWO responsibilities:
1. The `KBManagerSettings` interface + `DEFAULT_SETTINGS` constant (schema only)
2. The `KBSettingsTab` class (PluginSettingTab subclass) that renders the settings UI

**Settings schema (D-05 through D-09):**
```typescript
export interface KBManagerSettings {
  updateIntervalMinutes: number;   // SET-01; default 5 (D-05)
  autoInject: boolean;             // SET-04; default false (D-07)
  excludedPaths: string[];         // SET-02; default [] (D-06)
  defaultMocFormat: 'dedicated' | 'inline';  // SET-03; default 'dedicated' (D-08)
  folderRules: Record<string, 'dedicated' | 'inline'>;  // SET-03 per-folder; default {} (D-08)
}

export const DEFAULT_SETTINGS: KBManagerSettings = {
  updateIntervalMinutes: 5,
  autoInject: false,
  excludedPaths: [],
  defaultMocFormat: 'dedicated',
  folderRules: {},
};
```

**KBSettingsTab class** — must implement `display()` with exactly THREE sections in this order
(per UI-SPEC §Section order in display()):

Section 1 "General":
- Heading: `containerEl.createEl('h3', { text: 'General' })`
- Setting: Update interval slider
  - `.setName('Update interval')`
  - `.setDesc('How often KB Manager rebuilds MOC files and TOC sections in the background. Range: 1–60 minutes.')`
  - `.addSlider(s => s.setLimits(1, 60, 1).setValue(plugin.settings.updateIntervalMinutes).setDynamicTooltip().onChange(async v => { plugin.settings.updateIntervalMinutes = v; await plugin.saveSettings(); }))`
- Setting: Auto-injection toggle
  - `.setName('Auto-injection')`
  - `.setDesc('When enabled, automatically injects MOC sections into all notes in folders configured for inline format. Disabled by default — enable after reviewing per-folder rules.')`
  - `.addToggle(t => t.setValue(plugin.settings.autoInject).onChange(async v => { plugin.settings.autoInject = v; await plugin.saveSettings(); }))`

Section 2 "Exclusions":
- Heading: `containerEl.createEl('h3', { text: 'Exclusions' })`
- Setting: Exclusion patterns textarea
  - `.setName('Exclusion patterns')`
  - `.setDesc('Folders and files to skip entirely — no indexing, no MOC or TOC writes. One name per line. A pattern matches any path segment: "templates" excludes notes/templates/foo.md and templates/bar.md.')`
  - `.addTextArea(ta => ta.setPlaceholder('templates\narchive\ndaily-notes').setValue(plugin.settings.excludedPaths.join('\n')).onChange(async v => { plugin.settings.excludedPaths = parseExclusionPatterns(v); await plugin.saveSettings(); }))`

Section 3 "MOC Format":
- Heading: `containerEl.createEl('h3', { text: 'MOC Format' })`
- Setting: Default MOC format dropdown
  - `.setName('Default MOC format')`
  - `.setDesc('How MOC content is delivered when no per-folder rule applies. "Dedicated file" creates a MOC.md in each folder. "Inline injection" updates sections inside existing notes that contain delimiter markers.')`
  - `.addDropdown(dd => dd.addOption('dedicated', 'Dedicated file').addOption('inline', 'Inline injection').setValue(plugin.settings.defaultMocFormat).onChange(async v => { plugin.settings.defaultMocFormat = v as 'dedicated' | 'inline'; await plugin.saveSettings(); }))`
- Setting: Per-folder rules textarea
  - `.setName('Per-folder rules')`
  - `.setDesc('Override the default MOC format for specific folders. One rule per line. Lines that don\'t match the expected format are ignored.')`
  - `.addTextArea(ta => ta.setPlaceholder('notes/projects = inline\ndailies = dedicated').setValue(Object.entries(plugin.settings.folderRules).map(([k,v]) => `${k} = ${v}`).join('\n')).onChange(async v => { plugin.settings.folderRules = parseFolderRules(v); await plugin.saveSettings(); }))`

Additional rules:
- Import: `import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';`
- Import: `import { parseFolderRules, parseExclusionPatterns } from 'lib/settings-parser';`
- Class: `export class KBSettingsTab extends PluginSettingTab`
- Constructor: `constructor(app: App, private plugin: KBManagerPlugin)` — but plugin type
  comes from main.ts; to avoid circular import, type the plugin as
  `{ settings: KBManagerSettings; saveSettings(): Promise<void> }` in settings.ts
  (structural typing — avoids circular dependency)
- `display()`: call `this.containerEl.empty()` first, then build sections
- No console.log anywhere in this file
- File must stay under 300 lines; split helper functions out if approaching limit
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "export.*KBManagerSettings\|export.*DEFAULT_SETTINGS\|export.*KBSettingsTab" src/settings.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export.*KBManagerSettings\|export.*DEFAULT_SETTINGS\|export.*KBSettingsTab" src/settings.ts` outputs `3`
    - `grep -c "updateIntervalMinutes.*5" src/settings.ts` outputs `1` (default value is 5, per D-05)
    - `grep -c "autoInject.*false" src/settings.ts` outputs `1` (default is false, per D-07)
    - `grep -c "defaultMocFormat.*dedicated" src/settings.ts` outputs `1` (default is 'dedicated', per D-08)
    - `grep -c "parseFolderRules\|parseExclusionPatterns" src/settings.ts` outputs `2` (both imported and used)
    - `grep -c "console\.log" src/settings.ts` outputs `0`
    - `grep -c "General\|Exclusions\|MOC Format" src/settings.ts` outputs `3` (all three section headings)
    - `grep -v "^//" src/settings.ts | grep -v "^$" | wc -l` outputs less than 300 (file under line limit)
  </acceptance_criteria>
  <done>src/settings.ts exports KBManagerSettings, DEFAULT_SETTINGS, KBSettingsTab; three sections with exact copywriting; parseFolderRules and parseExclusionPatterns wired to onChange handlers</done>
</task>

<task type="auto">
  <name>Task 2: Create src/main.ts — KBManagerPlugin entry point</name>
  <files>src/main.ts</files>
  <read_first>
    - .planning/research/ARCHITECTURE.md (section "Plugin Lifecycle", section "Vault Event Pattern", "Standard onload skeleton")
    - .planning/research/PITFALLS.md (Pitfall 6: blocking onload, Gotcha 8: views registered before onLayoutReady)
    - .planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md (D-12, D-15, D-16)
    - CLAUDE.md (Critical Obsidian Plugin Rules — onLayoutReady, window.setInterval, normalizePath, no console.log)
  </read_first>
  <action>
Create `src/main.ts`. This is the plugin entry point — extends Plugin from the obsidian API.

**Skeleton structure (strictly follow this pattern — from ARCHITECTURE.md §Standard onload skeleton):**

```typescript
import { Plugin } from 'obsidian';
import { KBManagerSettings, DEFAULT_SETTINGS, KBSettingsTab } from 'settings';

export default class KBManagerPlugin extends Plugin {
  settings!: KBManagerSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register settings tab immediately (before onLayoutReady)
    this.addSettingTab(new KBSettingsTab(this.app, this));

    // Defer ALL vault work and event registration to onLayoutReady
    // (PITFALLS.md Pitfall 6: never do vault work in onload)
    this.app.workspace.onLayoutReady(() => {
      this.registerVaultEvents();
    });
  }

  onunload(): void {
    // registerEvent() and registerInterval() auto-clean on unload.
    // No manual cleanup needed for Phase 1 — nothing registered yet beyond settings tab.
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private registerVaultEvents(): void {
    // Phase 1: no vault events yet — placeholder for Phase 2+.
    // All vault event registration belongs inside this method (per ARCHITECTURE.md).
    // Registered here (inside onLayoutReady callback) to avoid startup event burst.
    // (PITFALLS.md Pitfall 6 + ARCHITECTURE.md §Vault Event Pattern)
  }
}
```

MANDATORY rules from CLAUDE.md and PITFALLS.md:
- `onload()` must NOT iterate the vault or read files
- `onload()` must NOT call `vault.getMarkdownFiles()` or `metadataCache.getFileCache()`
- `onload()` may call: `loadSettings()`, `addSettingTab()`, `registerView()`, `addCommand()`, `addRibbonIcon()`
- vault event registration ONLY inside `onLayoutReady` (even if empty in Phase 1)
- No `console.log` — only `console.warn`, `console.error`, `console.debug` if any logging is needed
- No `normalizePath()` calls needed in Phase 1 (no user-defined paths in main.ts)
- `export default` class (required by Obsidian plugin loader)

Phase 1 has no commands, no ribbon icon, no sidebar view — these ship in later phases.
Do not add placeholder commands from the sample plugin template (PITFALLS.md §Plugin Review:
"Template code left in from sample plugin" is a review rejection reason).

The file must be under 100 lines total.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && grep -c "onLayoutReady" src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "onLayoutReady" src/main.ts` outputs `1` (vault events deferred correctly)
    - `grep -c "export default class KBManagerPlugin" src/main.ts` outputs `1`
    - `grep -c "console\.log" src/main.ts` outputs `0`
    - `grep -c "loadSettings\|saveSettings" src/main.ts` outputs `2` or more (both implemented)
    - `grep -c "getMarkdownFiles\|getFileCache" src/main.ts` outputs `0` (no vault work in onload)
    - `grep -c "registerVaultEvents" src/main.ts` outputs `2` (defined AND called inside onLayoutReady)
    - `wc -l < src/main.ts` outputs less than 100
  </acceptance_criteria>
  <done>src/main.ts: KBManagerPlugin extends Plugin; onload only registers settings tab and defers to onLayoutReady; loadSettings/saveSettings implemented; no vault work in onload; no console.log; under 100 lines</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Obsidian data.json → loadData() | Plugin settings loaded from Obsidian's storage on startup |
| User settings UI → saveData() | User input written back to Obsidian's storage |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-06 | Tampering | loadSettings / DEFAULT_SETTINGS | mitigate | Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) ensures corrupted/missing keys fall back to safe defaults; no panic on missing field |
| T-01-07 | Elevation of Privilege | KBSettingsTab onChange handlers | accept | Settings are stored locally in Obsidian's data.json; no network calls; no code execution from settings values; parseFolderRules/parseExclusionPatterns produce typed output |
| T-01-08 | Denial of Service | textarea onChange | accept | onChange fires on every keystroke but only writes to settings object and calls saveData(); no vault writes, no heavy computation; acceptable cost |
</threat_model>

<verification>
After both tasks complete, verify the build chain end-to-end:

```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm install && npm run build
```
Must exit 0 and produce `main.js` in project root.

```bash
grep -c "onLayoutReady" /Users/schylerryan/Desktop/Github/kb-manager/src/main.ts
```
Must output `1`.

```bash
grep -rn "console\.log" /Users/schylerryan/Desktop/Github/kb-manager/src/
```
Must return zero matches.

```bash
grep -c "parseFolderRules\|parseExclusionPatterns" /Users/schylerryan/Desktop/Github/kb-manager/src/settings.ts
```
Must output `2` or more (both functions used in onChange handlers).
</verification>

<success_criteria>
- src/main.ts: exports default KBManagerPlugin; onload defers vault work to onLayoutReady; loadSettings uses Object.assign with DEFAULT_SETTINGS; no console.log; under 100 lines
- src/settings.ts: exports KBManagerSettings interface, DEFAULT_SETTINGS, KBSettingsTab; three sections (General, Exclusions, MOC Format) in correct order; exact copy from UI-SPEC; all onChange handlers call saveSettings(); parseFolderRules and parseExclusionPatterns wired to textarea handlers
- `npm run build` exits 0 and produces main.js
- No console.log anywhere in src/
</success_criteria>

<output>
After completion, create `.planning/phases/01-plugin-scaffold-settings-file-safety/01-03-SUMMARY.md`
using the summary template.
</output>
