#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages"
STAGING_DIR="$ROOT_DIR/.media-picker-staging"
VERSION=$(jq -r '.version' "$ROOT_DIR/.output/chrome-mv3/manifest.json")
PACKAGE_NAME="MediaPicker.zip"
PACKAGE_ROOT="$STAGING_DIR/Media Picker"

rm -rf "$STAGING_DIR"
mkdir -p "$PACKAGE_ROOT"
cp "$ROOT_DIR/media-picker/media_picker.py" "$PACKAGE_ROOT/"
cp "$ROOT_DIR/media-picker/install.sh" "$PACKAGE_ROOT/"
cp "$ROOT_DIR/media-picker/install-windows.ps1" "$PACKAGE_ROOT/"
cp "$ROOT_DIR/media-picker/README.md" "$PACKAGE_ROOT/"
cp "$ROOT_DIR/media-picker/cookies.txt" "$PACKAGE_ROOT/"
chmod +x "$PACKAGE_ROOT/install.sh" "$PACKAGE_ROOT/media_picker.py"
rm -f "$PACKAGE_DIR/$PACKAGE_NAME"
(cd "$STAGING_DIR" && zip -qr "$PACKAGE_DIR/$PACKAGE_NAME" "Media Picker")
printf '%s\n' 'Created package:' "$PACKAGE_NAME"
unzip -Z1 "$PACKAGE_DIR/$PACKAGE_NAME"
