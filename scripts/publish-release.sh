#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
REPO='mhasanbogura/motrixextension'
EXPECTED_VERSION='1.7.6'
NOTES='/home/ubuntu/motrix-1.7.6-release-notes.md'

VERSION=$(jq -r '.version' .output/chrome-mv3/manifest.json)
if [[ "$VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "Expected version ${EXPECTED_VERSION}, found ${VERSION}" >&2
  exit 1
fi

TAG="v${VERSION}"
PACKAGE="packages/MotrixExtension.zip"

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "${PACKAGE}#MotrixExtension.zip" --repo "$REPO" --clobber
  gh release edit "$TAG" --repo "$REPO" --title "Motrix Extension ${VERSION}" --notes-file "$NOTES"
else
  gh release create "$TAG" "${PACKAGE}#MotrixExtension.zip" \
    --repo "$REPO" \
    --title "Motrix Extension ${VERSION}" \
    --notes-file "$NOTES"
fi

echo "Published https://github.com/${REPO}/releases/tag/${TAG}"
