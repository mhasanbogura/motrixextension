# Motrix Extension

**Motrix Extension** routes browser downloads to Motrix through aria2 JSON-RPC and provides an IDM-style review picker, media and link capture, context-menu downloading, editable filenames, task management, retry actions, and an optional native Media Picker helper.

> Use this software only for files and media you are authorized to download, and follow the terms and policies of each website.

## Package contents

The release archive is named `MotrixExtension.zip`. After extraction, it contains the following top-level entries:

| Entry | Purpose |
|---|---|
| `Motrix Extension/Chrome/` | Chrome/Chromium MV3 extension build. |
| `Motrix Extension/Firefox/` | Firefox MV2 extension build. |
| `Media Picker/` | Native media helper, Windows and Linux/macOS installers, and optional `cookies.txt` template. |
| `Motrix Extension.md` | Versioned package summary. |
| `README.md` | This complete installation and usage guide. |

## Requirements

You need Motrix running locally with its aria2 JSON-RPC endpoint enabled. The extension’s default connection is `127.0.0.1:16800/jsonrpc`. If your Motrix installation uses a different host, port, path, or RPC secret, update those values in the extension’s **Settings** page. aria2 supports JSON-RPC over HTTP and WebSocket; this extension uses the configured HTTP JSON-RPC endpoint. [3]

For social-media page resolution, install Python 3 and run the native resolver installer once. The installer creates its own environment and installs yt-dlp with the required JavaScript runtime support. The native helper is launched by the browser on demand; you do not start a server for every download.

## Step 1: Extract the archive

Extract the ZIP to a permanent local folder. Do not load the extension directly from inside the ZIP. Keep the extracted folder in a stable location because the browser loads files from the selected directory.

The extension and resolver are both inside the same archive:

```text
MotrixExtension.zip/
├── Motrix Extension/
│   ├── Chrome/
│   └── Firefox/
├── Media Picker/
├── Motrix Extension.md
└── README.md
```

## Step 2: Install in Chrome or Chromium

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select:

```text
Motrix Extension/Chrome/
```

Select the directory containing `manifest.json`, not the parent archive folder. Pin Motrix to the toolbar if desired. These are the standard Chrome local-extension steps. [1]

After replacing the extension files with a newer release, return to `chrome://extensions` and click the extension’s reload button. Reload the page being captured as well when content-script behavior changed. [1]

### Chrome persistence after browser restart

A Chrome or Chromium extension loaded with **Load unpacked** should remain installed after the browser restarts, but the selected folder must remain at the same permanent path. Do not load it from a temporary directory, an extracted folder that is later moved, or a build directory that is deleted and recreated.

If Chrome asks you to load it again, remove the old entry from `chrome://extensions`, extract the release to a stable folder such as `C:\\Motrix Extension\\` or `~/Motrix Extension/`, and load `Motrix Extension/Chrome/` again. If Chrome still removes it, check `chrome://extensions` for an error or a managed-browser policy. A browser extension cannot force Chrome to keep an unpacked developer extension installed. For automatic persistent installation and updates, the supported options are a Chrome Web Store installation or a managed Chrome Enterprise policy. [4] [5]

## Step 3: Install in Firefox

For testing or local use, open `about:debugging`, select **This Firefox**, click **Load Temporary Add-on**, and select `manifest.json` inside:

```text
Motrix Extension/Firefox/
```

Firefox temporary add-ons remain installed until removed or Firefox restarts. A permanent end-user installation requires a Mozilla-signed add-on; the temporary workflow is intended for testing and debugging. [2]

To keep the Firefox extension across restarts in the normal Release or Beta browser, the add-on must be submitted to Mozilla for signing and then installed as a signed package. An unsigned local build can remain persistent only in supported development-oriented Firefox editions with the required unsigned-extension preference enabled. [2]

## Step 4: Install the native social resolver

Open a terminal or PowerShell in the extracted folder:

### Linux or macOS

```bash
cd "Media Picker"
chmod +x install.sh
./install.sh
```

### Windows PowerShell

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-windows.ps1
```

The installer registers the native-messaging host for the stable Chrome/Chromium and Firefox extension IDs. Restart the browser after installation. The resolver is used for supported Facebook, YouTube, Dailymotion, and Pornhub page URLs; ordinary downloads continue to work without it.

If the resolver was installed by an earlier package, run the latest installer again after upgrading so its helper files and yt-dlp dependencies are current.

## Step 5: Configure Motrix RPC

Start Motrix before testing a download. Open the extension popup and check the connection indicator. If it remains in **Checking** or shows offline:

1. Confirm that Motrix is running.
2. Open the extension **Settings** page.
3. Verify the host, port, RPC path, and secret.
4. Confirm that the RPC endpoint is reachable from the browser.
5. Click **Test connection**.
6. Reload the extension after changing its manifest or permissions.

The default endpoint is:

```text
http://127.0.0.1:16800/jsonrpc
```

## Optional cookies.txt setup

The package contains an empty `Media Picker/cookies.txt` template. It contains no real credentials. If a supported site requires authenticated access, provide your own Netscape-format cookie export.

After running the installer, replace the installed template at one of these locations:

| Operating system | Installed cookie-file path |
|---|---|
| Linux/macOS | `~/.local/share/media-picker/cookies.txt` |
| Windows | `%LOCALAPPDATA%\Media Picker\cookies.txt` |

The resolver uses the local file when it contains valid Netscape cookie rows and otherwise falls back to browser cookies passed by the extension. Never upload, publish, commit, or share a real cookies file. It can grant access to your accounts. Delete it when it is no longer needed and export a fresh file when the cookies expire.

## Download workflows

### Browser download interception

With **Download capture** enabled, supported browser downloads are intercepted and routed to Motrix. If **Review before sending** is enabled, the compact IDM-style picker opens first. Review or edit the filename, then choose **Send to Motrix**. The picker does not expose a Save directory field; the destination is controlled by Motrix or the extension’s configured default directory.

### Media and link capture

On supported pages, hover over a media element and use the Motrix capture overlay, or use the page/link context menu. The context menu contains only **Download with Motrix**. Capture behavior can be controlled in Settings under **Download capture** and **Extension filters**, including audio, video, image, document, archive, and other file types.

### Paste a link

Open the extension popup, use the paste-link panel, enter an HTTP(S), magnet, ed2k, or supported browser download URL, and submit it. If picker review is enabled, confirm the task in the picker before sending it to Motrix.

### Social-media pages

For Facebook, YouTube, Dailymotion, and Pornhub pages, the native resolver obtains a direct media format and a cleaned title when the website exposes an authorized downloadable stream. Facebook capture prefers one direct reel/video candidate instead of listing page, thumbnail, and variant URLs, and uses the social-page title as the picker filename when available. For Pornhub, this prevents a small HLS manifest or segment from being treated as the video file. The title is used as the default picker filename and remains editable. Direct media URLs may expire, so the picker refreshes a resolved social-media URL when you confirm the download.

The resolver does not bypass DRM, paywalls, private access controls, or platform restrictions. Private, age-restricted, bot-protected, or PO-Token-protected videos may require you to be signed in or may remain unavailable.

## Task management

The popup displays **Active**, **Error**, and **Finished** lanes. Active includes both running and waiting aria2 tasks while retaining each task’s actual status. Error contains failed tasks. Finished contains completed and other non-error stopped results.

Every task row supports filename editing. For active or waiting tasks, the new name is sent to aria2. For completed files, the native helper renames the actual local file on disk and the popup immediately refreshes the displayed name. If you enter a base name without an extension, the original extension is preserved.

Error rows provide two additional actions:

| Action | Result |
|---|---|
| **Retry** | Re-resolves the original source URL when available, refreshes expiring social-media URLs, and opens the picker again when review mode is enabled. |
| **Open link** | Opens the original source URL in a new browser tab. Older tasks fall back to an HTTP(S) URI reported by aria2 when available. |

## Settings and filters

The Settings page controls interception, prompt-before-download behavior, automatic Motrix launching, cookie/header forwarding, default directory, capture types, allowed and blocked extensions, blocked site URL patterns, theme, density, and RPC connection details.

To prevent capture on a site, add its URL pattern under **Extension filters → Blocked sites**. Changes apply to future capture events; reload the page if a content script was already active before the rule changed.

When a normal website is open, the popup also shows a compact **Site File Picker** switch. Turn it off to hide and disable the in-page purple **Download with Motrix** button for the current host. Turning it on shows the button again. This site-button preference is stored as a cross-scheme base-domain wildcard such as `*://*.example.com/*`, so it covers HTTP and HTTPS pages on the base domain’s subdomains; it does not change the global picker setting for other capture paths. To block capture completely, add a separate URL pattern under **Extension filters → Blocked sites**. Browser-internal pages and extension pages do not show this control.

## Troubleshooting

| Symptom | Recommended action |
|---|---|
| Popup stays on **Checking** | Start Motrix, verify the RPC host/port/path/secret, and run **Test connection**. |
| Chrome will not load the extension | Select `Motrix Extension/Chrome/`, the folder containing `manifest.json`, not the parent archive folder. |
| Firefox cannot load the extension | Use `about:debugging → This Firefox → Load Temporary Add-on` and select the Firefox `manifest.json`. |
| Media Picker is unavailable | Run the latest installer once, restart the browser, and confirm the native helper folder was installed. |
| Media Picker reports no direct format | Try the latest resolver installer, keep the site signed in if required, and use your own local cookies.txt only when authorized. Some videos remain unavailable. |
| A download fails after the picker | Open the **Error** lane and use **Retry**. Retry resolves the original page again instead of reusing an expired direct stream. |
| Rename appears unchanged | Install the latest extension package, ensure Motrix/aria2 still reports the task, and enter a filename without folders. The original extension is preserved automatically. |
| The Site File Picker switch appears ineffective | Install the latest extension, toggle **Site File Picker** off, and refresh the page. The in-page purple **Download with Motrix** button should disappear for that host. |

## Privacy and security

The extension stores settings, diagnostics, task-name overrides, and recent source URLs locally in browser storage. It does not place real social-media cookies in the GitHub repository or release archive. Keep any personal `cookies.txt` outside source control and protect it with operating-system file permissions.

The native resolver accepts only supported HTTP(S) page URLs and does not bypass DRM, authentication, paywalls, or other access controls.

## Development and release builds

The project uses WXT, React, TypeScript, and pnpm. To build from source:

```bash
pnpm install
pnpm build
pnpm exec wxt build -b firefox
```

To create the combined versioned ZIP after both browser builds complete:

```bash
scripts/package-release.sh
```

The archive is written to `packages/MotrixExtension.zip` and includes the Chrome build, Firefox build, Media Picker helper, package summary, and this README.

## References

[1]: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world "Chrome for Developers — Hello World extension"

[2]: https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/ "Mozilla Extension Workshop — Temporary installation in Firefox"

[3]: https://aria2.github.io/manual/en/html/aria2c.html "aria2 1.37.0 Manual — aria2c and RPC documentation"

[4]: https://developer.chrome.com/docs/chromedriver/extensions "Chrome for Developers — Chrome Extensions: packed and unpacked extensions"

[5]: https://support.google.com/chrome/a/answer/7532015?hl=en "Chrome Enterprise and Education Help — Set Chrome app and extension policies"
