param(
    [string]$RepoPath = "D:\Downloads\pmv-s2-v2\pmv-s2-v2"
)

$ErrorActionPreference = "Stop"

$sourcePath = Join-Path $PSScriptRoot "production_photo_catalog_backfill.rs"

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "BACKFILL_CORE_SOURCE_MISSING"
}

if (-not (Test-Path -LiteralPath $RepoPath -PathType Container)) {
    throw "PRODUCTION_REPO_MISSING=$RepoPath"
}

$cargoPath = Join-Path $RepoPath "Cargo.toml"
$normalAccessPath = Join-Path $RepoPath "src\normal_access.rs"
$windowsNormalAccessPath = Join-Path $RepoPath "src\windows_normal_access.rs"
$libPath = Join-Path $RepoPath "src\lib.rs"
$targetSourcePath = Join-Path $RepoPath "src\bin\production_photo_catalog_backfill.rs"

if (-not (Test-Path -LiteralPath $cargoPath -PathType Leaf)) {
    throw "PRODUCTION_CARGO_TOML_MISSING"
}

if (-not (Test-Path -LiteralPath $normalAccessPath -PathType Leaf)) {
    throw "NORMAL_ACCESS_CORE_MISSING"
}

if (-not (Test-Path -LiteralPath $windowsNormalAccessPath -PathType Leaf)) {
    throw "WINDOWS_NORMAL_ACCESS_HELPER_MISSING"
}

if (-not (Test-Path -LiteralPath $libPath -PathType Leaf)) {
    throw "PRODUCTION_LIB_RS_MISSING"
}

$libText = Get-Content -LiteralPath $libPath -Raw -Encoding UTF8

if ($libText -notmatch '(?m)^pub mod windows_normal_access;') {
    throw "WINDOWS_NORMAL_ACCESS_MODULE_NOT_EXPORTED"
}

$cargo = Get-Content -LiteralPath $cargoPath -Raw -Encoding UTF8

foreach ($dependency in @("serde", "serde_json", "hex", "zeroize")) {
    if ($cargo -notmatch ("(?m)^" + [regex]::Escape($dependency) + "\s*=")) {
        throw "REQUIRED_CARGO_DEPENDENCY_MISSING=$dependency"
    }
}

$source = Get-Content -LiteralPath $sourcePath -Raw -Encoding UTF8

foreach ($required in @(
    "unlock_production_kek_interactive",
    "unwrap_media_dek",
    "restore_photo_local",
    "encrypt_segment",
    "generate_key",
    "PHOTO_CATALOG_BACKFILL_STAGE=PASS",
    "PHOTO_CATALOG_ENCRYPT=PASS",
    "CATALOG_PLAINTEXT_PERSISTED=NO",
    "encrypt-catalog-from-env"
)) {
    if (-not $source.Contains($required)) {
        throw "BACKFILL_CORE_REQUIRED_MARKER_MISSING=$required"
    }
}

Copy-Item -LiteralPath $sourcePath -Destination $targetSourcePath -Force

Push-Location $RepoPath
try {
    & cargo build --release --bin production_photo_catalog_backfill

    if ($LASTEXITCODE -ne 0) {
        throw "BACKFILL_CORE_BUILD_FAILED"
    }
}
finally {
    Pop-Location
}

$exe = Join-Path $RepoPath "target\release\production_photo_catalog_backfill.exe"

if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "BACKFILL_CORE_BINARY_MISSING_AFTER_BUILD"
}

Write-Output "PHOTO_CATALOG_BACKFILL_CORE_INSTALL=PASS"
Write-Output "BACKFILL_CORE_EXE=$exe"
Write-Output "PRODUCTION_VAULT_MUTATION=NO"
