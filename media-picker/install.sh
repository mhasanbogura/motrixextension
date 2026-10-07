#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"
INSTALL_DIR="${MEDIA_PICKER_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/media-picker}"
OLD_INSTALL_DIR="${MOTRIX_RESOLVER_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/motrix-social-resolver}"
HOST_NAME='com.motrix.media_picker'
CHROME_EXTENSION_ID='ffamkaafaenbpmjeflbjkncogmkbcmnn'
LOCAL_EXTENSION_ID='pccpgknpkdeomcalpemihaaffcfmfjok'
FIREFOX_EXTENSION_ID='motrixextension@mhasanbogura'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$INSTALL_DIR"

# Migrate the previous Social Resolver install (cookies + venv) once.
if [[ "$OLD_INSTALL_DIR" != "$INSTALL_DIR" && -d "$OLD_INSTALL_DIR" && ! -f "$INSTALL_DIR/.migrated" ]]; then
  cp -a "$OLD_INSTALL_DIR/." "$INSTALL_DIR/"
  touch "$INSTALL_DIR/.migrated"
  echo "Migrated previous install: $OLD_INSTALL_DIR -> $INSTALL_DIR"
fi

cp "$SCRIPT_DIR/media_picker.py" "$INSTALL_DIR/media_picker.py"
rm -f "$INSTALL_DIR/social_resolver.py"
if [[ ! -f "$INSTALL_DIR/cookies.txt" ]]; then
  cp "$SCRIPT_DIR/cookies.txt" "$INSTALL_DIR/cookies.txt"
fi
chmod 600 "$INSTALL_DIR/cookies.txt"

"$PYTHON_BIN" -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/python" -m pip install --upgrade pip 'yt-dlp[default,deno]'

if ! command -v ffmpeg >/dev/null 2>&1; then
  printf '%s\n' 'Warning: ffmpeg was not found on PATH. Social thumbnails will not be embedded until ffmpeg is installed.' >&2
fi

cat > "$INSTALL_DIR/run-native.sh" <<EOF
#!/usr/bin/env bash
exec "$INSTALL_DIR/.venv/bin/python" "$INSTALL_DIR/media_picker.py"
EOF
chmod 755 "$INSTALL_DIR/run-native.sh"

write_manifest() {
  local path="$1"
  local browser="$2"
  mkdir -p "$(dirname "$path")"
  if [[ "$browser" == 'firefox' ]]; then
    cat > "$path" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Media Picker native media resolver",
  "path": "$INSTALL_DIR/run-native.sh",
  "type": "stdio",
  "allowed_extensions": ["$FIREFOX_EXTENSION_ID"]
}
EOF
  else
    cat > "$path" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Media Picker native media resolver",
  "path": "$INSTALL_DIR/run-native.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$CHROME_EXTENSION_ID/", "chrome-extension://$LOCAL_EXTENSION_ID/"]
}
EOF
  fi
}

case "$(uname -s)" in
  Darwin)
    write_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json" chrome
    write_manifest "$HOME/Library/Application Support/Chromium/NativeMessagingHosts/$HOST_NAME.json" chrome
    write_manifest "$HOME/Library/Application Support/Firefox/NativeMessagingHosts/$HOST_NAME.json" firefox
    ;;
  Linux*)
    write_manifest "$HOME/.config/google-chrome/NativeMessagingHosts/$HOST_NAME.json" chrome
    write_manifest "$HOME/.config/chromium/NativeMessagingHosts/$HOST_NAME.json" chrome
    write_manifest "$HOME/.mozilla/native-messaging-hosts/$HOST_NAME.json" firefox
    ;;
  *)
    printf '%s\n' "Unsupported Unix platform: $(uname -s)" >&2
    exit 1
    ;;
esac

printf '%s\n' 'Media Picker installed for on-demand native messaging with yt-dlp EJS and Deno support.'
printf '%s\n' "Installed helper: $INSTALL_DIR"
printf '%s\n' 'Restart the browser once after installation. No resolver command is needed for each download.'
