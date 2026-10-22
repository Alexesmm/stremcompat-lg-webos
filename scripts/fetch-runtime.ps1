param([switch]$Force)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serviceDir = Join-Path $projectRoot 'service'
$cacheDir = Join-Path $projectRoot '.cache'
$sourceIpk = Join-Path $cacheDir 'stremiobrew-1.0.0.ipk'
$sourceUrl = 'https://github.com/Alexesmm/stremio-universal-lg-tv-ports/releases/download/runtime-v1.0.0/stremiobrew-1.0.0.ipk'
$expectedSha256 = '36C81015D851BFD4B12C40372EDBE7B51FB67FE1D8CEC828D0AEFA6CE8343DF7'
$required = @(
    (Join-Path $serviceDir 'server.js'),
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
    Write-Host 'Downloading pinned StremioBrew runtime package...'
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $sourceUrl -OutFile $sourceIpk
    } catch {
        $gh = Get-Command gh -ErrorAction SilentlyContinue
        if (-not $gh) { throw }
        Write-Host 'Direct download unavailable; using authenticated GitHub CLI fallback...'
        & gh release download runtime-v1.0.0 --repo Alexesmm/stremio-universal-lg-tv-ports --pattern 'stremiobrew-1.0.0.ipk' --dir $cacheDir --clobber
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
