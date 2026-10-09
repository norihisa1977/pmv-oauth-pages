[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$ProductionDir = (Join-Path $env:LOCALAPPDATA "PMV\production_v1"),
    [string]$EvidenceDir = (Join-Path $env:TEMP "pmv-photo-catalog-dry-run")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $DryRun) {
    throw "BACKFILL_MUTATION_NOT_AUTHORIZED_USE_DRYRUN"
}

$expectedVaultId = "pmv-v1-production"
$expectedPhotoCount = 392
$expectedKeyGeneration = 1

$productionStatePath = Join-Path $ProductionDir "production_state.json"
$cloudStatePath = Join-Path $ProductionDir "migration\full_media_cloud_state.jsonl"
$mediaRoot = Join-Path $ProductionDir "media"

foreach ($required in @($productionStatePath, $cloudStatePath, $mediaRoot)) {
    if (-not (Test-Path $required)) {
        throw "REQUIRED_PRODUCTION_PATH_MISSING=$required"
    }
}

$productionState = Get-Content $productionStatePath -Raw | ConvertFrom-Json

if ([string]$productionState.vault_id -ne $expectedVaultId) {
    throw "VAULT_ID_MISMATCH=$($productionState.vault_id)"
}

if ([int64]$productionState.key_generation -ne $expectedKeyGeneration) {
    throw "KEY_GENERATION_MISMATCH=$($productionState.key_generation)"
}

$rows = @(
    Get-Content $cloudStatePath |
        Where-Object { $_.Trim() -ne "" } |
        ForEach-Object { $_ | ConvertFrom-Json }
)

$photoRows = @(
    $rows |
        Where-Object {
            [string]$_.status -eq "CLOUD_VERIFIED" -and
            [string]$_.kind -eq "PHOTO"
        }
)

$byMediaId = @{}
foreach ($row in $photoRows) {
    $mediaId = [string]$row.media_id
    if ([string]::IsNullOrWhiteSpace($mediaId)) {
        throw "PHOTO_MEDIA_ID_MISSING"
    }

    if ($byMediaId.ContainsKey($mediaId)) {
        throw "DUPLICATE_CANONICAL_MEDIA_ID=$mediaId"
    }

    $byMediaId[$mediaId] = $row
}

$photos = @(
    $byMediaId.GetEnumerator() |
        Sort-Object Name |
        ForEach-Object { $_.Value }
)

if ($photos.Count -ne $expectedPhotoCount) {
    throw "CANONICAL_PHOTO_COUNT_MISMATCH=$($photos.Count)"
}

$results = New-Object System.Collections.Generic.List[object]
$manifestIds = New-Object System.Collections.Generic.HashSet[string]
$photoIds = New-Object System.Collections.Generic.HashSet[string]

$ordinal = 0
foreach ($row in $photos) {
    $mediaId = [string]$row.media_id
    $manifestFileId = [string]$row.manifest_file_id
    $photoFileId = [string]$row.media_file_id

    if ([string]::IsNullOrWhiteSpace($manifestFileId)) {
        throw "MANIFEST_FILE_ID_MISSING=$mediaId"
    }
    if ([string]::IsNullOrWhiteSpace($photoFileId)) {
        throw "PHOTO_FILE_ID_MISSING=$mediaId"
    }
    if (-not $manifestIds.Add($manifestFileId)) {
        throw "DUPLICATE_MANIFEST_FILE_ID=$manifestFileId"
    }
    if (-not $photoIds.Add($photoFileId)) {
        throw "DUPLICATE_PHOTO_FILE_ID=$photoFileId"
    }

    $mediaDir = Join-Path $mediaRoot $mediaId
    $recordPath = Join-Path $mediaDir "production_record.json"
    if (-not (Test-Path $recordPath -PathType Leaf)) {
        throw "PRODUCTION_RECORD_MISSING=$mediaId"
    }

    $record = Get-Content $recordPath -Raw | ConvertFrom-Json

    if ([string]$record.vault_id -ne $expectedVaultId) {
        throw "RECORD_VAULT_ID_MISMATCH=$mediaId"
    }
    if ([string]$record.media_id -ne $mediaId) {
        throw "RECORD_MEDIA_ID_MISMATCH=$mediaId"
    }
    if ([int64]$record.key_generation -ne $expectedKeyGeneration) {
        throw "RECORD_KEY_GENERATION_MISMATCH=$mediaId"
    }
    if (-not $record.PSObject.Properties.Name.Contains("wrapped_media_dek")) {
        throw "WRAPPED_MEDIA_DEK_MISSING=$mediaId"
    }

    $manifestObjectName = [string]$record.manifest_object_name
    $photoObjectName = [string]$record.photo_object_name

    if ([string]::IsNullOrWhiteSpace($manifestObjectName)) {
        throw "MANIFEST_OBJECT_NAME_MISSING=$mediaId"
    }
    if ([string]::IsNullOrWhiteSpace($photoObjectName)) {
        throw "PHOTO_OBJECT_NAME_MISSING=$mediaId"
    }

    $manifestPath = Join-Path $mediaDir $manifestObjectName
    $photoPath = Join-Path $mediaDir $photoObjectName

    if (-not (Test-Path $manifestPath -PathType Leaf)) {
        throw "LOCAL_MANIFEST_MISSING=$mediaId"
    }
    if (-not (Test-Path $photoPath -PathType Leaf)) {
        throw "LOCAL_PHOTO_BLOB_MISSING=$mediaId"
    }

    $manifestItem = Get-Item $manifestPath
    $photoItem = Get-Item $photoPath

    if ([int64]$row.manifest_bytes -ne [int64]$manifestItem.Length) {
        throw "MANIFEST_SIZE_MISMATCH=$mediaId"
    }
    if ([int64]$row.media_bytes -ne [int64]$photoItem.Length) {
        throw "PHOTO_SIZE_MISMATCH=$mediaId"
    }

    $results.Add([pscustomobject][ordered]@{
        ordinal = $ordinal
        media_id = $mediaId
        manifest_file_id = $manifestFileId
        photo_file_id = $photoFileId
        manifest_object_name = $manifestObjectName
        photo_object_name = $photoObjectName
        manifest_bytes = [int64]$manifestItem.Length
        photo_bytes = [int64]$photoItem.Length
        manifest_sha256 = (Get-FileHash $manifestPath -Algorithm SHA256).Hash.ToLower()
        photo_sha256 = (Get-FileHash $photoPath -Algorithm SHA256).Hash.ToLower()
        record_sha256 = (Get-FileHash $recordPath -Algorithm SHA256).Hash.ToLower()
    })

    $ordinal++
}

if ($results.Count -ne $expectedPhotoCount) {
    throw "DRYRUN_RESULT_COUNT_MISMATCH=$($results.Count)"
}

New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null

$inventoryPath = Join-Path $EvidenceDir "photo-catalog-backfill-dry-run-inventory.json"
$evidencePath = Join-Path $EvidenceDir "photo-catalog-backfill-dry-run-evidence.json"

$results |
    ConvertTo-Json -Depth 6 |
    Set-Content -Path $inventoryPath -Encoding UTF8

$inventoryHash = (Get-FileHash $inventoryPath -Algorithm SHA256).Hash.ToLower()
$cloudStateHash = (Get-FileHash $cloudStatePath -Algorithm SHA256).Hash.ToLower()
$productionStateHash = (Get-FileHash $productionStatePath -Algorithm SHA256).Hash.ToLower()

$evidence = [ordered]@{
    format = "PMV-PHOTO-CATALOG-BACKFILL-DRYRUN-V1"
    dry_run = $true
    production_mutation = $false
    media_body_decrypted = $false
    thumbnail_generated = $false
    cloud_upload_performed = $false
    vault_id = $expectedVaultId
    key_generation = $expectedKeyGeneration
    photo_count = $results.Count
    unique_manifest_file_id_count = $manifestIds.Count
    unique_photo_file_id_count = $photoIds.Count
    production_state_sha256 = $productionStateHash
    full_media_cloud_state_sha256 = $cloudStateHash
    inventory_sha256 = $inventoryHash
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
}

$evidence |
    ConvertTo-Json -Depth 6 |
    Set-Content -Path $evidencePath -Encoding UTF8

Write-Output "PHOTO_CATALOG_BACKFILL_DRYRUN=PASS"
Write-Output "VAULT_ID=$expectedVaultId"
Write-Output "KEY_GENERATION=$expectedKeyGeneration"
Write-Output "PHOTO_COUNT=$($results.Count)"
Write-Output "UNIQUE_MANIFEST_FILE_ID_COUNT=$($manifestIds.Count)"
Write-Output "UNIQUE_PHOTO_FILE_ID_COUNT=$($photoIds.Count)"
Write-Output "MEDIA_BODY_DECRYPTED=NO"
Write-Output "THUMBNAIL_GENERATED=NO"
Write-Output "CLOUD_UPLOAD_PERFORMED=NO"
Write-Output "PRODUCTION_MUTATION=NO"
Write-Output "INVENTORY_SHA256=$inventoryHash"
Write-Output "EVIDENCE=$evidencePath"
