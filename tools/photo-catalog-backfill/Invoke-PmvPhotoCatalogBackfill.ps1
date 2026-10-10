[CmdletBinding()]
param(
    [switch]$Execute,
    [string]$RepoPath = "D:\Downloads\pmv-s2-v2\pmv-s2-v2",
    [string]$ProductionDir = (Join-Path $env:LOCALAPPDATA "PMV\production_v1")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $Execute) {
    throw "BACKFILL_BOOTSTRAP_NOT_AUTHORIZED_USE_EXECUTE"
}

$sourceCommit = "028603f55217d5e87b2c89263617eaae73acefa3"
$baseUrl = "https://raw.githubusercontent.com/norihisa1977/pmv-oauth-pages/$sourceCommit/tools/photo-catalog-backfill"
$tempDir = Join-Path $env:TEMP ("pmv-photo-catalog-bootstrap-" + [guid]::NewGuid().ToString("N"))

$files = @(
    "Prepare-PmvPhotoCatalogBackfill.ps1",
    "New-PmvPhotoThumbnail.ps1",
    "Install-PmvPhotoCatalogBackfillCore.ps1",
    "Run-PmvPhotoCatalogBackfill.ps1",
    "production_photo_catalog_backfill.rs"
)

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    foreach ($name in $files) {
        $uri = "$baseUrl/$name"
        $destination = Join-Path $tempDir $name

        Invoke-WebRequest `
            -Uri $uri `
            -OutFile $destination `
            -UseBasicParsing

        if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) {
            throw "BACKFILL_BOOTSTRAP_DOWNLOAD_MISSING=$name"
        }

        if ((Get-Item -LiteralPath $destination).Length -le 0) {
            throw "BACKFILL_BOOTSTRAP_DOWNLOAD_EMPTY=$name"
        }
    }

    $runner = Join-Path $tempDir "Run-PmvPhotoCatalogBackfill.ps1"

    & $runner `
        -Execute `
        -RepoPath $RepoPath `
        -ProductionDir $ProductionDir `
        -Generation 1

    if ($LASTEXITCODE -ne 0) {
        throw "PHOTO_CATALOG_BACKFILL_RUNNER_FAILED"
    }
}
finally {
    if (Test-Path -LiteralPath $tempDir) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path -LiteralPath $tempDir) {
        Write-Error "BACKFILL_BOOTSTRAP_TEMP_CLEANUP_FAILED"
    }
}
