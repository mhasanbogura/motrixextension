#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages"
STAGING_DIR="$ROOT_DIR/.release-staging"
ROOT_NAME="Motrix Extension"
VERSION=$(jq -r '.version' "$ROOT_DIR/.output/chrome-mv3/manifest.json")
PACKAGE_NAME="MotrixExtension.zip"
DOCUMENT_NAME="Motrix Extension.md"
PACKAGE_ROOT="$STAGING_DIR/$ROOT_NAME"
RESOLVER_ROOT="$STAGING_DIR/Media Picker"

rm -rf "$STAGING_DIR"
mkdir -p "$PACKAGE_ROOT/Chrome" "$PACKAGE_ROOT/Firefox" "$RESOLVER_ROOT" "$PACKAGE_DIR"

if [[ ! -f "$ROOT_DIR/.output/chrome-mv3/manifest.json" ]]; then
  echo "Missing Chrome build. Run: pnpm build" >&2
  exit 1
fi
if [[ ! -f "$ROOT_DIR/.output/firefox-mv2/manifest.json" ]]; then
  echo "Missing Firefox build. Run: pnpm exec wxt build -b firefox" >&2
  exit 1
fi

cp -a "$ROOT_DIR/.output/chrome-mv3/." "$PACKAGE_ROOT/Chrome/"
cp -a "$ROOT_DIR/.output/firefox-mv2/." "$PACKAGE_ROOT/Firefox/"
cp "$ROOT_DIR/media-picker/media_picker.py" "$RESOLVER_ROOT/"
cp "$ROOT_DIR/media-picker/install.sh" "$RESOLVER_ROOT/"
cp "$ROOT_DIR/media-picker/install-windows.ps1" "$RESOLVER_ROOT/"
cp "$ROOT_DIR/media-picker/README.md" "$RESOLVER_ROOT/"
cp "$ROOT_DIR/media-picker/cookies.txt" "$RESOLVER_ROOT/"
chmod +x "$RESOLVER_ROOT/install.sh" "$RESOLVER_ROOT/media_picker.py"
cp "$ROOT_DIR/Motrix Extension.md" "$STAGING_DIR/$DOCUMENT_NAME"
cp "$ROOT_DIR/README.md" "$STAGING_DIR/README.md"

rm -f "$PACKAGE_DIR/$PACKAGE_NAME"
(cd "$STAGING_DIR" && zip -qr "$PACKAGE_DIR/$PACKAGE_NAME" "$ROOT_NAME" "Media Picker" "$DOCUMENT_NAME" "README.md")

printf 'Created package:\n'
printf '%s\n' "$PACKAGE_NAME"
printf '\nPackage structure:\n'
unzip -Z1 "$PACKAGE_DIR/$PACKAGE_NAME" | sed -n '1,40p'
