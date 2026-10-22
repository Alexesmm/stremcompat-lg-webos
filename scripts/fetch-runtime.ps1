param([switch]$Force)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serviceDir = Join-Path $projectRoot 'service'
$cacheDir = Join-Path $projectRoot '.cache'
$sourceIpk = Join-Path $cacheDir 'stremiobrew-1.0.0.ipk'
$sourceUrl = 'https://raw.githubusercontent.com/simussu9-wq/stremiobrew/main/io.strem.tv.beta_1.0.0_all.ipk'
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
    Invoke-WebRequest -UseBasicParsing -Uri $sourceUrl -OutFile $sourceIpk
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
