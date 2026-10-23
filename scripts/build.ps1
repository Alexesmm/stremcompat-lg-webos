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

if (Test-Path -LiteralPath $buildRoot) { Remove-Item -LiteralPath $buildRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'app') -Destination $stageApp -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'service') -Destination $stageService -Recurse
Get-ChildItem -LiteralPath $stageService -Filter '*.log' -File -ErrorAction SilentlyContinue | Remove-Item -Force

$appInfoPath = Join-Path $stageApp 'appinfo.json'
$appInfo = Get-Content -LiteralPath $appInfoPath -Raw | ConvertFrom-Json
$templateVersion = [string]$appInfo.version
$appInfo.id = $config.appId
$appInfo.version = $config.version
$appInfo.resolution = [string]$config.graphicsResolution
if ($config.PSObject.Properties.Name -contains 'title') { $appInfo.title = [string]$config.title }
[System.IO.File]::WriteAllText($appInfoPath, ($appInfo | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))

$appServicesPath = Join-Path $stageApp 'services.json'
$appServices = Get-Content -LiteralPath $appServicesPath -Raw | ConvertFrom-Json
$appServices[0].name = $config.serviceId
[System.IO.File]::WriteAllText($appServicesPath, ($appServices | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))

$servicePackagePath = Join-Path $stageService 'package.json'
$servicePackage = Get-Content -LiteralPath $servicePackagePath -Raw | ConvertFrom-Json
$servicePackage.name = $config.serviceId
$servicePackage.version = $config.version
[System.IO.File]::WriteAllText($servicePackagePath, ($servicePackage | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))

$serviceManifestPath = Join-Path $stageService 'services.json'
$serviceManifest = Get-Content -LiteralPath $serviceManifestPath -Raw | ConvertFrom-Json
$serviceManifest.id = $config.serviceId
$serviceManifest.services[0].name = $config.serviceId
[System.IO.File]::WriteAllText($serviceManifestPath, ($serviceManifest | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))

$textFiles = @(
    (Join-Path $stageApp 'index.html'),
    (Join-Path $stageService 'launch.js'),
    (Join-Path $stageService 'tvserver.js'),
    (Join-Path $stageService 'beta.html'),
    (Join-Path $stageService 'beta-app.js')
)
foreach ($file in $textFiles) {
    $text = [System.IO.File]::ReadAllText($file)
    $text = $text.Replace('io.strem.tv.server', '__PROFILE_SERVICE_ID__')
    $text = $text.Replace('io.strem.tv', [string]$config.appId)
    $text = $text.Replace('__PROFILE_SERVICE_ID__', [string]$config.serviceId)
    $text = $text.Replace($templateVersion, [string]$config.version)
    $text = $text.Replace('8082', [string]$config.port)
    $text = $text.Replace('LG 50UM7500PSB / webOS 4.x', [string]$config.targetLabel)
    if ($file.EndsWith('tvserver.js')) {
        $text = $text.Replace('bgzActive >= 2', "bgzActive >= $($config.backdropWorkers)")
        $text = $text.Replace('scale=960:-2', "scale=$($config.backdropWidth):-2")
        $text = $text.Replace('bgzOrder.length > 24', "bgzOrder.length > $($config.backdropCache)")
    }
    [System.IO.File]::WriteAllText($file, $text, (New-Object System.Text.UTF8Encoding($false)))
}

$lowMemory = if ($config.lowMemory) { 'true' } else { 'false' }
$profileJs = "var TV_PROFILE={id:'$($config.profile)',lowMemory:$lowMemory,sourceCap:$($config.sourceCap),libraryCap:$($config.libraryCap),catalogCap:$($config.catalogCap)};"
$shellPath = Join-Path $stageService 'beta-app.js'
$shell = [System.IO.File]::ReadAllText($shellPath)
$shell = [regex]::Replace($shell, "var TV_PROFILE=\{id:'[^']+'.*?\};", $profileJs, 1)
[System.IO.File]::WriteAllText($shellPath, $shell, (New-Object System.Text.UTF8Encoding($false)))

$shellHtmlPath = Join-Path $stageService 'beta.html'
$serverPath = Join-Path $stageService 'tvserver.js'
$embeddedHtml = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($shellHtmlPath))
$embeddedApp = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($shellPath))
$serverText = [System.IO.File]::ReadAllText($serverPath)
$serverText = $serverText.Replace('__EMBEDDED_BETA_HTML_B64__', $embeddedHtml)
$serverText = $serverText.Replace('__EMBEDDED_BETA_APP_B64__', $embeddedApp)
[System.IO.File]::WriteAllText($serverPath, $serverText, (New-Object System.Text.UTF8Encoding($false)))

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
