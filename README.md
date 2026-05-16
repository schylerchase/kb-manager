# KB Manager

KB Manager is an Obsidian plugin for maintaining a MOC-first knowledge base.
It keeps folder MOCs, inline MOC sections, note TOCs, section indexes, and tag navigation in sync with your vault.

## What It Does

- Builds a live index of vault folders, notes, headings, and tags
- Generates dedicated `MOC.md` files for folders
- Injects inline MOC sections into configured notes
- Injects per-note TOC sections from note headings
- Generates folder-level `INDEX.md` files from note headings
- Shows a sidebar with the MOC tree and scoped tag navigation
- Runs background updates on a configurable interval
- Provides a manual rebuild command and ribbon action

## Safety Model

KB Manager only overwrites files or sections it owns:

- Dedicated generated MOC files are marked with `kb-managed: true`
- Inline sections are bounded by:
  - `<!-- kb-manager:moc:start -->`
  - `<!-- kb-manager:moc:end -->`
  - `<!-- kb-manager:toc:start -->`
  - `<!-- kb-manager:toc:end -->`
- Files without valid delimiters are skipped for inline updates

The plugin is intended for local vaults and does not make network calls.

## Integrations

KB Manager owns KB structure, MOCs, TOCs, metadata, and review workflows. It can optionally hand off "review this KB area" signals to a companion reminder plugin.

- **Quick Reminder (optional).** If the [Quick Reminder](https://github.com/schylerchase/quick-reminder) plugin is installed and enabled, **Create KB update reminder** schedules a native-notification reminder in Quick Reminder.
- **Fallback (always available).** If Quick Reminder is missing, disabled, or its API is unavailable, KB Manager writes a plain Markdown task to the note configured under **Settings -> KB Manager -> KB update task file** (default `KB Updates.md`). Review tasks are never lost.

Integration is resilient. KB Manager does not crash, fail, or block any of its core MOC, TOC, sidebar, or rebuild features if Quick Reminder is absent. KB Manager does not bundle or copy any Quick Reminder code.

## Commands

KB Manager registers these commands. Obsidian shows each one prefixed with `KB Manager:` in the command palette.

| Command | What it does |
|---|---|
| Rebuild now | Manually re-index the vault and run generators. |
| Insert MOC here | Insert MOC delimiters at the cursor in the active note. |
| Insert note TOC here | Insert note TOC delimiters at the cursor in the active note. |
| Open sidebar | Open the KB Manager sidebar view. |
| New KB note here | Create a new note in the active folder. |
| New MOC note here | Create a new note seeded as a folder MOC. |
| New TOC note here | Create a new note seeded as a per-note TOC. |
| Add tags to current note | Append tags to the active note. |
| Initialize properties for current note | Add KB property frontmatter to the active note. |
| Create KB update reminder | Schedule a KB review via Quick Reminder, or write a Markdown review task fallback. |

## Install From GitHub With BRAT

For beta installs from GitHub, use [BRAT](https://github.com/TfTHacker/obsidian42-brat).

1. In Obsidian, install and enable **BRAT** from Community plugins.
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Enter:
   ```text
   https://github.com/schylerchase/kb-manager
   ```
4. Enable **KB Manager** in **Settings -> Community plugins**.

BRAT installs the latest GitHub release into the current vault and can check for updates later.

## Install From Installer Package

Build the installer package:

```sh
npm run package:installer
```

This creates:

```text
dist/kb-manager-installer/
dist/kb-manager-installer.zip
```

Send `dist/kb-manager-installer.zip` to someone who wants to install the plugin.
After unzipping it, they can run one of the included installers.

macOS or Linux:

```sh
sh install-macos-linux.sh "/path/to/Obsidian Vault"
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 "C:\path\to\Obsidian Vault"
```

After installing, reload Obsidian and enable `KB Manager` in:

```text
Settings -> Community plugins -> Installed plugins
```

On first enable, KB Manager starts in preview mode. It indexes the vault and opens the sidebar, but it does not create `MOC.md`, create `INDEX.md`, or update managed sections until `Generated content writes` is enabled in the plugin settings.

## Manual Install

Build the plugin:

```sh
npm run build
```

Copy these files into:

```text
<vault>/.obsidian/plugins/kb-manager/
```

Files:

- `main.js`
- `manifest.json`
- `styles.css`

Reload Obsidian, then enable the plugin.

## Development

Install dependencies:

```sh
npm install
```

Run tests:

```sh
npm test
```

Build production plugin files:

```sh
npm run build
```

Watch during development:

```sh
npm run dev
```

Package a friend-friendly installer:

```sh
npm run package:installer
```

## Current Status

Version: `0.1.0`

This is an early personal-use release. Back up important vaults before trying any plugin that writes generated content.

KB Manager does not include an in-app self-updater. Updates are installed by BRAT or by replacing `main.js`, `manifest.json`, and `styles.css` in the vault's plugin folder and reloading the plugin.

## Release Process

1. Update `version` in `manifest.json` and `package.json`.
2. If `minAppVersion` changes, update `versions.json`.
3. Run tests and build locally:
   ```sh
   npm test
   npm run build
   ```
4. Push a matching tag:
   ```sh
   git tag v0.1.1
   git push origin v0.1.1
   ```
5. GitHub Actions publishes a release containing:
   - `main.js`
   - `manifest.json`
   - `versions.json`
   - `styles.css`
   - `kb-manager-installer.zip`

Friends using BRAT can update with **BRAT: Check for updates to beta plugins and UPDATE**.
