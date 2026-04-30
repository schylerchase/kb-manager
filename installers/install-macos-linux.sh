#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VAULT_PATH=${1:-}

if [ -z "$VAULT_PATH" ]; then
  printf "Obsidian vault path: "
  IFS= read -r VAULT_PATH
fi

if [ -z "$VAULT_PATH" ]; then
  echo "No vault path provided."
  exit 1
fi

OBSIDIAN_DIR="$VAULT_PATH/.obsidian"
if [ "$(basename "$VAULT_PATH")" = ".obsidian" ]; then
  OBSIDIAN_DIR="$VAULT_PATH"
fi

if [ ! -d "$OBSIDIAN_DIR" ]; then
  echo "Could not find .obsidian at: $OBSIDIAN_DIR"
  echo "Open this vault in Obsidian once, then run the installer again."
  exit 1
fi

PLUGIN_DIR="$OBSIDIAN_DIR/plugins/kb-manager"
mkdir -p "$PLUGIN_DIR"

for file in main.js manifest.json styles.css; do
  if [ ! -f "$SCRIPT_DIR/$file" ]; then
    echo "Missing installer file: $file"
    exit 1
  fi
  cp "$SCRIPT_DIR/$file" "$PLUGIN_DIR/$file"
done

echo "KB Manager installed to:"
echo "$PLUGIN_DIR"
echo "Reload Obsidian, then enable KB Manager in Community plugins."
