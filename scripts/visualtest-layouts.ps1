$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputDir = Join-Path $projectRoot '.build\visual-tests'

$cases = @(
    @{ Profile = 'lg-armv7'; Port = 8082; Width = 1280; Height = 720 },
    @{ Profile = 'lg-armv7-1080'; Port = 8082; Width = 1920; Height = 1080 }
)

foreach ($case in $cases) {
    & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build.ps1') -Profile $case.Profile -SkipPackage
    if ($LASTEXITCODE -ne 0) { throw "Build failed for $($case.Profile)." }
    $stage = Join-Path $projectRoot ".build\$($case.Profile)"
    $look = if ($case.Look) { $case.Look } else { 'standard' }
    $image = Join-Path $outputDir "$($case.Profile)-$($case.Width)x$($case.Height)-$look.png"
    & node.exe (Join-Path $PSScriptRoot 'visualtest-layout.js') $stage $case.Port $case.Width $case.Height $image $look
    if ($LASTEXITCODE -ne 0) { throw "Visual test failed for $($case.Profile)." }
}

Write-Host "Visual layout screenshots: $outputDir"
