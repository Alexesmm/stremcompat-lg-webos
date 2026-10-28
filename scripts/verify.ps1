$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

$appInfo = Get-Content -LiteralPath (Join-Path $projectRoot 'app\appinfo.json') -Raw | ConvertFrom-Json
if ($appInfo.id -ne 'io.strem.tv' -or $appInfo.version -ne '1.2.5') { throw 'Manifesto do aplicativo inesperado.' }
if ($appInfo.type -ne 'web' -or $appInfo.main -ne 'index.html') { throw 'appinfo.json invalido.' }
$serviceInfo = Get-Content -LiteralPath (Join-Path $projectRoot 'service\package.json') -Raw | ConvertFrom-Json
if ($serviceInfo.name -ne 'io.strem.tv.server' -or $serviceInfo.version -ne $appInfo.version) { throw 'Versoes do app e servico nao coincidem.' }

$required = @(
    'app\index.html', 'app\icon.png', 'app\splash.png', 'app\services.json',
    'service\launch.js', 'service\profile.js', 'service\tvserver.js', 'service\beta.html', 'service\beta-app.js',
    'service\server.js', 'service\services.json', 'service\stremio-logo.png',
    'service\player\player.css', 'service\player\player-body.html', 'service\player\player-client.js',
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

foreach ($bootstrap in 'launch.js', 'profile.js') {
    & node.exe (Join-Path $PSScriptRoot 'verify-es5.js') (Join-Path $projectRoot "service\$bootstrap")
    if ($LASTEXITCODE -ne 0) { throw "$bootstrap nao e compativel com Node.js 0.12/ES5." }
}

foreach ($script in 'tvserver.js', 'server.js') {
    & node.exe --check (Join-Path $projectRoot "service\$script")
    if ($LASTEXITCODE -ne 0) { throw "$script contem erro de sintaxe." }
}

& node.exe (Join-Path $PSScriptRoot 'build-ui.js') --check
if ($LASTEXITCODE -ne 0) { throw 'service/beta-app.js esta desatualizado em relacao a src/ui.' }

& node.exe (Join-Path $PSScriptRoot 'verify-frontend.js') (Join-Path $projectRoot 'service') chrome38
if ($LASTEXITCODE -ne 0) { throw 'O shell nao e compativel com a sintaxe ES5 exigida pelo Chromium 38.' }

& npx.cmd --no-install eslint service scripts eslint.config.js
if ($LASTEXITCODE -ne 0) { throw 'ESLint encontrou nomes indefinidos, nao usados ou redeclarados.' }

& node.exe (Join-Path $PSScriptRoot 'verify-source.js') $projectRoot
if ($LASTEXITCODE -ne 0) { throw 'Recursos obrigatorios ausentes nas fontes.' }

Write-Host 'OK: shell, manifests, bootstrap ES5, runtime Node 18 e binarios ARMv7 validados.'
