param(
    [string]$Profile = 'um4-armv7',
    [switch]$SkipPackage
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$profileFile = Join-Path $projectRoot "profiles\$Profile.json"
if (-not (Test-Path -LiteralPath $profileFile -PathType Leaf)) { throw "Unknown profile: $Profile" }
$config = Get-Content -LiteralPath $profileFile -Raw | ConvertFrom-Json
$distDir = Join-Path $projectRoot 'dist'
$buildRoot = Join-Path $projectRoot ".build\$Profile"
$stageApp = Join-Path $buildRoot 'app'
$stageService = Join-Path $buildRoot 'service'

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

& powershell.exe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'fetch-runtime.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Runtime preparation failed.' }

Write-Host "Validating shared sources and ARMv7 runtime for $Profile..."
& powershell.exe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Source validation failed.' }

& node.exe (Join-Path $PSScriptRoot 'build-stage.js') $Profile
if ($LASTEXITCODE -ne 0) { throw 'Profile staging failed.' }

& node.exe (Join-Path $PSScriptRoot 'verify-stage.js') $buildRoot $profileFile
if ($LASTEXITCODE -ne 0) { throw 'Profile staging validation failed.' }

if ($SkipPackage) {
    Write-Host "Profile $Profile staged and validated at $buildRoot."
    exit 0
}

$pattern = "$($config.appId)_$($config.version)*.ipk"
Get-ChildItem -LiteralPath $distDir -Filter $pattern -ErrorAction SilentlyContinue | Remove-Item -Force
Push-Location $projectRoot
try {
    & npx.cmd --no-install ares-package --no-minify $stageApp $stageService -o $distDir
    if ($LASTEXITCODE -ne 0) { throw 'ares-package failed.' }
} finally {
    Pop-Location
}

$ipk = Get-ChildItem -LiteralPath $distDir -Filter $pattern | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $ipk) { throw 'ares-package completed without creating an IPK.' }

& node.exe (Join-Path $PSScriptRoot 'fix-ipk-modes.js') $ipk.FullName
if ($LASTEXITCODE -ne 0) { throw 'Failed to set executable modes in IPK.' }
& node.exe (Join-Path $PSScriptRoot 'verify-ipk.js') $ipk.FullName $profileFile
if ($LASTEXITCODE -ne 0) { throw 'Packaged IPK validation failed.' }

$sha = [System.Security.Cryptography.SHA256]::Create()
$stream = [System.IO.File]::OpenRead($ipk.FullName)
try { $hash = ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
finally { $stream.Dispose(); $sha.Dispose() }
Write-Host "IPK ready: $($ipk.FullName)"
Write-Host "SHA256: $hash"
