param([switch]$Force)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serviceDir = Join-Path $projectRoot 'service'
$cacheDir = Join-Path $projectRoot '.cache'
$sourceIpk = Join-Path $cacheDir 'stremcompat-runtime-2.0.0.tar.gz'
$sourceUrl = 'https://github.com/Alexesmm/stremcompat-lg-webos/releases/download/runtime-v2.0.0/stremcompat-runtime-2.0.0.tar.gz'
$expectedSha256 = '3A63BA8CE3C3A6CAFC3FD1EB6D0187231C8261150B06868A0B67835224AD246B'
$required = @(
    (Join-Path $serviceDir 'bin\node18'),
    (Join-Path $serviceDir 'bin\ffmpeg'),
    (Join-Path $serviceDir 'bin\ffprobe')
)

if (-not $Force) {
    $missing = $required | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) }
    if (-not $missing) { Write-Host 'Runtime components are already present.'; exit 0 }
}

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
if (-not (Test-Path -LiteralPath $sourceIpk -PathType Leaf) -or $Force) {
    Write-Host 'Downloading pinned runtime archive...'
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $sourceUrl -OutFile $sourceIpk
    } catch {
        $gh = Get-Command gh -ErrorAction SilentlyContinue
        if (-not $gh) { throw }
        Write-Host 'Direct download unavailable; using authenticated GitHub CLI fallback...'
        & gh release download runtime-v2.0.0 --repo Alexesmm/stremcompat-lg-webos --pattern 'stremcompat-runtime-2.0.0.tar.gz' --dir $cacheDir --clobber
        if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI runtime download failed.' }
    }
}

$sha = [System.Security.Cryptography.SHA256]::Create()
$stream = [System.IO.File]::OpenRead($sourceIpk)
try { $actual = ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
finally { $stream.Dispose(); $sha.Dispose() }
if ($actual -ne $expectedSha256) {
    throw "Runtime checksum mismatch. Expected $expectedSha256, received $actual."
}

& node.exe (Join-Path $PSScriptRoot 'extract-runtime.js') $sourceIpk $serviceDir
if ($LASTEXITCODE -ne 0) { throw 'Runtime extraction failed.' }
Write-Host 'Pinned ARMv7 runtime is ready.'
