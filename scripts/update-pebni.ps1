<#
.SYNOPSIS
    Checks GitHub Releases for the latest version of Pebni and updates the installed Windows app.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\update-pebni.ps1
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\update-pebni.ps1 -Repo "your-user/pebni" -CheckOnly
#>
[CmdletBinding()]
param(
	[string]$Repo = "Elamin-svg/pebni",
	[switch]$CheckOnly,
	[switch]$Force
)

$ErrorActionPreference = "Stop"

$apiUrl = "https://api.github.com/repos/$Repo/releases/latest"
$directExeUrl = "https://github.com/$Repo/releases/latest/download/Pebni-Setup.exe"
$manifestUrl = "https://github.com/$Repo/releases/latest/download/stable-win-x64-update.json"
$headers = @{
	"Accept"     = "application/vnd.github+json"
	"User-Agent" = "Pebni-Updater"
}

function Get-InstalledVersion {
	$candidates = @(
		(Join-Path $env:LOCALAPPDATA "app.pebni.desktop\stable\app\Resources\version.json"),
		(Join-Path $env:LOCALAPPDATA "Pebni\Resources\version.json")
	)
	foreach ($path in $candidates) {
		if (Test-Path $path) {
			try {
				$json = Get-Content -Raw $path | ConvertFrom-Json
				if ($json.version) { return [string]$json.version }
			} catch {}
		}
	}
	return $null
}

Write-Host "Checking latest Pebni release from $Repo..." -ForegroundColor Cyan

$latestVersion = $null
$downloadUrl = $directExeUrl
$assetName = "Pebni-Setup.exe"

try {
	$release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 20
	if ($release.tag_name) {
		$latestVersion = ($release.tag_name -replace '^v', '')
	}
	$exeAsset = $release.assets | Where-Object { $_.name -match '^Pebni-Setup\.exe$' -or $_.name -match '\.exe$' } | Select-Object -First 1
	$zipAsset = $release.assets | Where-Object { $_.name -match 'win-x64.*Pebni.*\.zip$' } | Select-Object -First 1
	if ($exeAsset) {
		$downloadUrl = $exeAsset.browser_download_url
		$assetName = $exeAsset.name
	} elseif ($zipAsset) {
		$downloadUrl = $zipAsset.browser_download_url
		$assetName = $zipAsset.name
	}
} catch {
	try {
		$manifest = Invoke-RestMethod -Uri $manifestUrl -Headers $headers -TimeoutSec 15
		if ($manifest.version) { $latestVersion = [string]$manifest.version }
	} catch {
		throw "Could not fetch release info from GitHub ($Repo). Make sure a published release exists."
	}
}

$installedVersion = Get-InstalledVersion
if ($installedVersion) {
	Write-Host "Installed version : v$installedVersion"
} else {
	Write-Host "Installed version : not detected (fresh install)"
}
if ($latestVersion) {
	Write-Host "Latest release    : v$latestVersion"
}

if (-not $Force -and $installedVersion -and $latestVersion -and ($installedVersion -eq $latestVersion)) {
	Write-Host "Pebni is already up to date (v$installedVersion)." -ForegroundColor Green
	exit 0
}

if ($CheckOnly) {
	if ($latestVersion) {
		Write-Host "Update available: v$latestVersion ($downloadUrl)" -ForegroundColor Yellow
	}
	exit 0
}

# Stop running Pebni processes cleanly before replacing files.
Get-Process -ErrorAction SilentlyContinue | Where-Object {
	$_.ProcessName -match '^Pebni$' -or ($_.Path -and $_.Path -like "*app.pebni.desktop*")
} | ForEach-Object {
	Write-Host "Stopping running Pebni (PID $($_.Id))..."
	Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("pebni-update-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
	$targetFile = Join-Path $tempDir $assetName
	Write-Host "Downloading $assetName..." -ForegroundColor Cyan
	Invoke-WebRequest -Uri $downloadUrl -OutFile $targetFile -Headers $headers -UseBasicParsing

	if ($assetName.EndsWith(".zip")) {
		$extractDir = Join-Path $tempDir "extracted"
		Expand-Archive -Path $targetFile -DestinationPath $extractDir -Force
		$setupExe = Get-ChildItem -Path $extractDir -Recurse -Filter "*.exe" | Select-Object -First 1
		if (-not $setupExe) { throw "No installer .exe found inside $assetName." }
		$installerPath = $setupExe.FullName
	} else {
		$installerPath = $targetFile
	}

	Write-Host "Launching installer ($installerPath)..." -ForegroundColor Green
	Start-Process -FilePath $installerPath -Wait
	Write-Host "Pebni update complete." -ForegroundColor Green
} finally {
	Start-Sleep -Milliseconds 500
	Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
