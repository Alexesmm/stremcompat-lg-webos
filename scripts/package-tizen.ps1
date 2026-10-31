# Builds and signs the Samsung package with the local Tizen tools and author certificate.
# The certificate lives outside the repository: an update must be signed by the same one.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$tizen = 'C:\tizen-studio\tools\ide\bin\tizen.bat'
if (-not (Test-Path $tizen)) { throw "Tizen CLI not found at $tizen" }

Push-Location $projectRoot
try {
    & node .\scripts\build-ui.js
    if ($LASTEXITCODE -ne 0) { throw 'build-ui failed' }
    & node .\scripts\build-tizen.js
    if ($LASTEXITCODE -ne 0) { throw 'build-tizen failed' }

    $stage = Join-Path $projectRoot '.build\tizen-armv7'
    $version = (Get-Content (Join-Path $projectRoot 'profiles\tizen-armv7.json') -Raw | ConvertFrom-Json).version
    & $tizen package -t wgt -s stremcompat -- $stage | Out-Null
    $built = Get-ChildItem $stage -Filter '*.wgt' | Select-Object -First 1
    if (-not $built) { throw 'tizen package did not produce a .wgt' }

    $dist = Join-Path $projectRoot 'dist\tizen'
    New-Item -ItemType Directory -Force $dist | Out-Null
    $target = Join-Path $dist "StremCompat-Tizen-armv7-$version.wgt"
    Move-Item -LiteralPath $built.FullName -Destination $target -Force
    $sizeMb = [math]::Round((Get-Item $target).Length / 1MB, 2)
    "Package ready: $target ($sizeMb MB)"
} finally {
    Pop-Location
}
