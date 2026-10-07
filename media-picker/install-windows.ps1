$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallDir = Join-Path $env:LOCALAPPDATA 'Media Picker'
$OldInstallDir = Join-Path $env:LOCALAPPDATA 'Motrix Social Resolver'
$HostName = 'com.motrix.media_picker'
$ChromeExtensionId = 'ffamkaafaenbpmjeflbjkncogmkbcmnn'
$FirefoxExtensionId = 'motrixextension@mhasanbogura'

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
# Migrate the previous Social Resolver install (cookies + venv) once.
if ((Test-Path $OldInstallDir) -and (-not (Test-Path (Join-Path $InstallDir '.migrated')))) {
  Copy-Item (Join-Path $OldInstallDir '*') $InstallDir -Recurse -Force
  New-Item -ItemType File -Force -Path (Join-Path $InstallDir '.migrated') | Out-Null
}
Copy-Item (Join-Path $ScriptDir 'media_picker.py') (Join-Path $InstallDir 'media_picker.py') -Force
Remove-Item (Join-Path $InstallDir 'social_resolver.py') -ErrorAction SilentlyContinue
$CookieFile = Join-Path $InstallDir 'cookies.txt'
if (-not (Test-Path $CookieFile)) {
  Copy-Item (Join-Path $ScriptDir 'cookies.txt') $CookieFile
}

$PythonLauncher = (Get-Command py -ErrorAction SilentlyContinue).Source
$Python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $PythonLauncher -and -not $Python) {
  throw 'Python 3 is required. Install Python 3 and run this installer again.'
}

$VenvPath = Join-Path $InstallDir '.venv'
if ($PythonLauncher) {
  & $PythonLauncher -3 -m venv $VenvPath
} else {
  & $Python -m venv $VenvPath
}
$VenvPython = Join-Path $InstallDir '.venv\Scripts\python.exe'
& $VenvPython -m pip install --upgrade pip 'yt-dlp[default,deno]'

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Warning 'ffmpeg was not found on PATH. Social thumbnails will not be embedded until ffmpeg is installed.'
}

$Launcher = Join-Path $InstallDir 'run-native.bat'
"@echo off`r`n`"$VenvPython`" `"$(Join-Path $InstallDir 'media_picker.py')`"" | Set-Content -Path $Launcher -Encoding ascii

function Register-Host($Path, $Browser) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  if ($Browser -eq 'firefox') {
    $Manifest = [ordered]@{
      name = $HostName
      description = 'Media Picker native media resolver'
      path = $Launcher
      type = 'stdio'
      allowed_extensions = @($FirefoxExtensionId)
    }
  } else {
    $Manifest = [ordered]@{
      name = $HostName
      description = 'Media Picker native media resolver'
      path = $Launcher
      type = 'stdio'
      allowed_origins = @("chrome-extension://$ChromeExtensionId/")
    }
  }
  $Manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $Path -Encoding utf8
}

$ChromeManifest = Join-Path $InstallDir "$HostName.chrome.json"
$FirefoxManifest = Join-Path $InstallDir "$HostName.firefox.json"
Register-Host $ChromeManifest 'chrome'
Register-Host $FirefoxManifest 'firefox'

$ChromeKeys = @(
  'HKCU:\Software\Google\Chrome\NativeMessagingHosts',
  'HKCU:\Software\Chromium\NativeMessagingHosts'
)
foreach ($Root in $ChromeKeys) {
  $Key = Join-Path $Root $HostName
  New-Item -Path $Key -Force | Out-Null
  Set-ItemProperty -Path $Key -Name '(default)' -Value $ChromeManifest
}
$FirefoxKey = "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
New-Item -Path $FirefoxKey -Force | Out-Null
Set-ItemProperty -Path $FirefoxKey -Name '(default)' -Value $FirefoxManifest

Write-Output 'Media Picker installed for on-demand native messaging with yt-dlp EJS and Deno support.'
Write-Output 'Restart Chrome or Firefox once. No resolver command is needed for each download.'
