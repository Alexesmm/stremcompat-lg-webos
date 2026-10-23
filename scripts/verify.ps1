$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

$appInfo = Get-Content -LiteralPath (Join-Path $projectRoot 'app\appinfo.json') -Raw | ConvertFrom-Json
if ($appInfo.id -ne 'io.strem.tv' -or $appInfo.version -ne '1.2.5') { throw 'Manifesto do aplicativo inesperado.' }
if ($appInfo.type -ne 'web' -or $appInfo.main -ne 'index.html') { throw 'appinfo.json invalido.' }
$serviceInfo = Get-Content -LiteralPath (Join-Path $projectRoot 'service\package.json') -Raw | ConvertFrom-Json
if ($serviceInfo.name -ne 'io.strem.tv.server' -or $serviceInfo.version -ne $appInfo.version) { throw 'Versoes do app e servico nao coincidem.' }

$required = @(
    'app\index.html', 'app\icon.png', 'app\splash.png', 'app\services.json',
    'service\launch.js', 'service\tvserver.js', 'service\beta.html', 'service\beta-app.js',
    'service\server.js', 'service\services.json', 'service\stremio-logo.png',
    'service\bin\node18', 'service\bin\ffmpeg', 'service\bin\ffprobe',
    'service\bin\lib\libcrypto.so.3', 'service\bin\lib\libssl.so.3',
    'service\bin\lib\libstdc++.so.6', 'service\bin\lib\libuv.so.1'
)
foreach ($relative in $required) {
    $file = Join-Path $projectRoot $relative
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo ausente: $relative" }
    if ((Get-Item -LiteralPath $file).Length -eq 0) { throw "Arquivo vazio: $relative" }
}

foreach ($binary in 'node18', 'ffmpeg', 'ffprobe') {
    $file = Join-Path $projectRoot "service\bin\$binary"
    $header = New-Object byte[] 52
    $stream = [System.IO.File]::OpenRead($file)
    try {
        if ($stream.Read($header, 0, $header.Length) -ne $header.Length) { throw "$binary truncado." }
    } finally {
        $stream.Dispose()
    }
    if ($header[0] -ne 0x7F -or $header[1] -ne 0x45 -or $header[2] -ne 0x4C -or $header[3] -ne 0x46) { throw "$binary nao e ELF." }
    if ($header[4] -ne 1 -or $header[5] -ne 1) { throw "$binary nao e ELF 32-bit little-endian." }
    $machine = $header[18] + (256 * $header[19])
    if ($machine -ne 40) { throw "$binary nao e ARM32 (e_machine=$machine)." }
}

& node.exe (Join-Path $PSScriptRoot 'verify-es5.js') (Join-Path $projectRoot 'service\launch.js')
if ($LASTEXITCODE -ne 0) { throw 'O bootstrap nao e compativel com Node.js 0.12/ES5.' }

& node.exe --check (Join-Path $projectRoot 'service\tvserver.js')
if ($LASTEXITCODE -ne 0) { throw 'tvserver.js contem erro de sintaxe.' }
& node.exe --check (Join-Path $projectRoot 'service\server.js')
if ($LASTEXITCODE -ne 0) { throw 'server.js contem erro de sintaxe.' }

& node.exe (Join-Path $PSScriptRoot 'verify-frontend.js') (Join-Path $projectRoot 'service') chrome38
if ($LASTEXITCODE -ne 0) { throw 'O shell nao e compativel com a sintaxe ES5 exigida pelo Chromium 38.' }

if ((Get-Content -LiteralPath (Join-Path $projectRoot 'service\tvserver.js') -Raw) -match 'io\.strem\.tv\.beta') {
    throw 'tvserver.js ainda contem o ID beta antigo.'
}

$launchSource = Get-Content -LiteralPath (Join-Path $projectRoot 'service\launch.js') -Raw
$serverSource = Get-Content -LiteralPath (Join-Path $projectRoot 'service\tvserver.js') -Raw
$shellSource = Get-Content -LiteralPath (Join-Path $projectRoot 'service\beta.html') -Raw
$applicationSource = Get-Content -LiteralPath (Join-Path $projectRoot 'service\beta-app.js') -Raw
$appSource = Get-Content -LiteralPath (Join-Path $projectRoot 'app\index.html') -Raw
if ($launchSource -notmatch "APP_PORT = 8082" -or $serverSource -notmatch "PORT = 8082" -or $appSource -notmatch "127\.0\.0\.1:8082") { throw 'Porta local 8082 inconsistente.' }
if ($serverSource -notmatch "APP_VERSION = '1\.2\.5'" -or $launchSource -notmatch "APP_VERSION = '1\.2\.5'") { throw 'Health/versionamento do runtime inconsistente.' }
if ($appSource -notmatch '<html lang="en">' -or $appSource -notmatch 'beta\?v=1\.2\.5') { throw 'Bootstrap inicial em ingles ou versao do shell inconsistente.' }
if ($serverSource -notmatch "p === '/streamref'" -or $serverSource -notmatch "p === '/addon'" -or $applicationSource -notmatch "postJson\('/streamref'") { throw 'Ponte segura de addons/player ausente.' }
if ($applicationSource -notmatch 'rowReady:function' -or $applicationSource -notmatch 'findRow:function' -or $applicationSource -notmatch 'catalogRowsCap') { throw 'Navegacao tolerante a falhas de catalogo ausente.' }
if ($applicationSource -notmatch 'streamCompatibility' -or $applicationSource -notmatch 'webkitvisibilitychange' -or $applicationSource -notmatch 'PalmServiceBridge') { throw 'Avisos de codec ou recuperacao do runtime ausentes.' }
if ($serverSource -notmatch 'player_resume_recovered' -or $serverSource -notmatch 'process\.memoryUsage' -or $serverSource -notmatch "dbg\('\[clientlog\]") { throw 'Diagnosticos ou recuperacao do player ausentes.' }
if ($shellSource -notmatch '@media \(max-height:800px\)') { throw 'Layout compacto para a superficie 720p ausente.' }

Write-Host 'OK: shell, manifests, bootstrap ES5, runtime Node 18 e binarios ARMv7 validados.'
