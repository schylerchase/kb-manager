# KB Manager Installer

This folder installs KB Manager into an Obsidian vault.

## macOS or Linux

Open a terminal in this folder and run:

```sh
sh install-macos-linux.sh "/path/to/your/vault"
```

If you omit the path, the script will ask for it.

## Windows

Open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 "C:\path\to\your\vault"
```

If you omit the path, the script will ask for it.

## After Installing

Restart Obsidian, or reload the app, then enable `KB Manager` under:

Settings -> Community plugins -> Installed plugins.

KB Manager starts in preview mode and indexes the vault without writing generated files or managed sections until `Generated content writes` is enabled in the plugin settings. Open the sidebar from the ribbon network icon or the `KB Manager: Open sidebar` command.
