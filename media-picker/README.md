# Media Picker

This helper provides the Snaptube-like download path used by the Motrix Extension for public or user-authorized Facebook, YouTube, Dailymotion, and Pornhub page URLs. It uses `yt-dlp` to discover an available direct media format and returns the URL, filename, thumbnail, and required request headers to the extension. 

## One-time installation

On Linux or macOS, open a terminal in this folder and run:

```bash
./install.sh
```

On Windows, right-click `install-windows.ps1`, choose **Run with PowerShell**, or run it from PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-windows.ps1
```

The installer creates a private Python environment, installs `yt-dlp` with its default EJS components and Deno JavaScript runtime, registers the native-messaging host for Chrome/Chromium and Firefox, and installs an on-demand launcher. Install `ffmpeg` separately and keep it available on your system PATH to embed social thumbnails as cover artwork inside completed MP4, M4V, MOV, M4A, or 3GP files. If ffmpeg is unavailable or the media format does not support embedded artwork, the download remains untouched. If the resolver was installed before this release, run the installer again once so the new files and dependencies are installed. Restart the browser once after installation. You do not need to start a server or run a command for each download.

## Optional cookies.txt file

The package includes an empty `cookies.txt` template. The installer copies it to the resolver’s per-user directory and never overwrites an existing file. If YouTube or another supported site requires account access, replace that installed template with your own Netscape-format cookie export containing only the domains you need.

On Linux and macOS, the file is:

```text
~/.local/share/media-picker/cookies.txt
```

On Windows, the file is:

```text
%LOCALAPPDATA%\Media Picker\cookies.txt
```

The resolver automatically uses this file when it contains valid Netscape cookie rows. Otherwise, it falls back to the browser cookies passed by the extension. Close the browser or export cookies using a trusted method before replacing the file, and never send, publish, commit, or share `cookies.txt`; it contains active account credentials and may grant access to your social-media accounts. Delete or replace it when the cookies expire or are no longer needed.

The extension’s stable native-helper registration uses host name `com.motrix.media_picker`. No resolver URL needs to be entered in settings.

The helper accepts only HTTP(S) page URLs on Facebook, fb.watch, YouTube, youtu.be, Dailymotion, dai.ly, or Pornhub. After a social download completes, the helper uses the page thumbnail as embedded cover artwork when the downloaded container and local ffmpeg support it. Use it only for media you are authorized to download and in accordance with the platform’s terms.

DRM-protected, encrypted, login-only, private, or segment-only streams may not produce a direct downloadable format. The helper does not bypass DRM, authentication, paywalls, or other access controls. YouTube may still require a signed-in account or a PO Token for particular videos.
