param(
  [string]$VaultPath
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrWhiteSpace($VaultPath)) {
  $VaultPath = Read-Host "Obsidian vault path"
}

if ([string]::IsNullOrWhiteSpace($VaultPath)) {
  throw "No vault path provided."
}

$ObsidianDir = Join-Path $VaultPath ".obsidian"
if ((Split-Path -Leaf $VaultPath) -eq ".obsidian") {
  $ObsidianDir = $VaultPath
}

if (!(Test-Path -Path $ObsidianDir -PathType Container)) {
  throw "Could not find .obsidian at: $ObsidianDir. Open this vault in Obsidian once, then run the installer again."
}

$PluginDir = Join-Path $ObsidianDir "plugins\kb-manager"
New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null

foreach ($File in @("main.js", "manifest.json", "styles.css")) {
  $Source = Join-Path $ScriptDir $File
  if (!(Test-Path -Path $Source -PathType Leaf)) {
    throw "Missing installer file: $File"
  }
  Copy-Item -Force -Path $Source -Destination (Join-Path $PluginDir $File)
}

Write-Host "KB Manager installed to:"
Write-Host $PluginDir
Write-Host "Reload Obsidian, then enable KB Manager in Community plugins."
