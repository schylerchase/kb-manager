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
