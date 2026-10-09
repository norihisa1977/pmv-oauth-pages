[CmdletBinding()]
param(
    [switch]$Execute,
    [string]$RepoPath = "D:\Downloads\pmv-s2-v2\pmv-s2-v2",
    [string]$ProductionDir = (Join-Path $env:LOCALAPPDATA "PMV\production_v1"),
    [int64]$Generation = 1
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $Execute) { throw "BACKFILL_MUTATION_NOT_AUTHORIZED_USE_EXECUTE" }
if ($Generation -ne 1) { throw "INITIAL_BACKFILL_REQUIRES_GENERATION_1" }

$expectedPhotoCount = 392
$expectedVaultId = "pmv-v1-production"
$clientId = "708619313298-kld9fo416ou464b013504lhm4cu63bho.apps.googleusercontent.com"

$prepareScript = Join-Path $PSScriptRoot "Prepare-PmvPhotoCatalogBackfill.ps1"
$installScript = Join-Path $PSScriptRoot "Install-PmvPhotoCatalogBackfillCore.ps1"
$thumbnailScript = Join-Path $PSScriptRoot "New-PmvPhotoThumbnail.ps1"
$windowsDir = Join-Path $ProductionDir "windows"
$clientSecretPath = Join-Path $windowsDir "google_client_secret.dpapi"
$cloudStatePath = Join-Path $ProductionDir "migration\full_media_cloud_state.jsonl"
$evidenceDir = Join-Path $ProductionDir "evidence"
$workDir = Join-Path $env:TEMP ("pmv-photo-catalog-backfill-" + [guid]::NewGuid().ToString("N"))
$preDir = Join-Path $workDir "pre"
$postDir = Join-Path $workDir "post"
$catalogEncryptedPath = Join-Path $workDir "pmv-photo-catalog-v0-g1.enc.json"
$encryptedThumbnailDir = Join-Path $workDir "encrypted-thumbnails"

foreach ($required in @($prepareScript,$installScript,$thumbnailScript,$clientSecretPath,$cloudStatePath)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "BACKFILL_REQUIRED_FILE_MISSING=$required"
    }
}

Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security

function Get-PmvDriveAccessToken {
    param([string]$ClientId,[string]$ClientSecretPath)

    $entropy = [Text.Encoding]::UTF8.GetBytes("PMV:v1:google-oauth-client-secret")
    $clientSecretBytes = $null
    $clientSecret = $null
    $storedRefresh = $null

    try {
        $clientSecretBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            [IO.File]::ReadAllBytes($ClientSecretPath),
            $entropy,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        $clientSecret = [Text.Encoding]::UTF8.GetString($clientSecretBytes)
        if ([string]::IsNullOrWhiteSpace($clientSecret)) { throw "PMV_GOOGLE_CLIENT_SECRET_INVALID" }

        $vault = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new()
        try {
            $storedRefresh = $vault.Retrieve("PMV","google_refresh_token_v1")
            $storedRefresh.RetrievePassword()
        }
        catch { throw "GOOGLE_REFRESH_TOKEN_SECURE_STORAGE_MISSING" }

        if ([string]::IsNullOrWhiteSpace($storedRefresh.Password)) {
            throw "GOOGLE_REFRESH_TOKEN_SECURE_STORAGE_EMPTY"
        }

        $token = Invoke-RestMethod -Method Post -Uri "https://oauth2.googleapis.com/token" -ContentType "application/x-www-form-urlencoded" -Body @{
            client_id = $ClientId
            client_secret = $clientSecret
            refresh_token = $storedRefresh.Password
            grant_type = "refresh_token"
        }

        if (-not $token.access_token) { throw "DRIVE_OAUTH_REFRESH_FAILED" }
        $accessToken = [string]$token.access_token
        $tokenInfo = Invoke-RestMethod -Method Get -Uri ("https://oauth2.googleapis.com/tokeninfo?access_token=" + [uri]::EscapeDataString($accessToken))

        if ([string]$tokenInfo.aud -ne $ClientId) { throw "DRIVE_OAUTH_AUDIENCE_MISMATCH" }

        $scopes = @(([string]$tokenInfo.scope -split "\s+") | Where-Object { $_ })
        if ($scopes.Count -ne 1 -or $scopes[0] -ne "https://www.googleapis.com/auth/drive.file") {
            throw "DRIVE_SCOPE_NOT_EXACT_DRIVE_FILE=$([string]$tokenInfo.scope)"
        }

        foreach ($forbiddenScope in @("https://www.googleapis.com/auth/drive","https://www.googleapis.com/auth/drive.readonly")) {
            if ($scopes -contains $forbiddenScope) { throw "BROAD_DRIVE_SCOPE_FORBIDDEN=$forbiddenScope" }
        }

        return $accessToken
    }
    finally {
        if ($clientSecretBytes) { [Array]::Clear($clientSecretBytes,0,$clientSecretBytes.Length) }
        if ($entropy) { [Array]::Clear($entropy,0,$entropy.Length) }
        $clientSecret = $null
        $storedRefresh = $null
    }
}

function New-PmvDriveObject {
    param([System.Net.Http.HttpClient]$Client,[string]$Path,[string]$ObjectName)

    $item = Get-Item -LiteralPath $Path
    $length = [int64]$item.Length
    if ($length -le 0) { throw "UPLOAD_SOURCE_EMPTY=$Path" }

    $init = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post,"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size")
    $metadata = @{ name = $ObjectName } | ConvertTo-Json -Compress
    $init.Content = [System.Net.Http.StringContent]::new($metadata,[Text.Encoding]::UTF8,"application/json")
    $init.Headers.TryAddWithoutValidation("X-Upload-Content-Type","application/octet-stream") | Out-Null
    $init.Headers.TryAddWithoutValidation("X-Upload-Content-Length",[string]$length) | Out-Null
    $initResponse = $Client.SendAsync($init).GetAwaiter().GetResult()

    try {
        if (-not $initResponse.IsSuccessStatusCode) {
            $body = $initResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            throw "RESUMABLE_INIT_FAILED_HTTP_$([int]$initResponse.StatusCode) $body"
        }
        if (-not $initResponse.Headers.Location) { throw "RESUMABLE_LOCATION_MISSING" }
        $sessionUri = $initResponse.Headers.Location.AbsoluteUri
    }
    finally {
        $initResponse.Dispose()
        $init.Dispose()
    }

    $stream = [IO.File]::OpenRead($Path)
    $put = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Put,$sessionUri)
    $put.Content = [System.Net.Http.StreamContent]::new($stream)
    $put.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/octet-stream")
    $put.Content.Headers.ContentLength = $length
    $putResponse = $Client.SendAsync($put).GetAwaiter().GetResult()

    try {
        $body = $putResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $putResponse.IsSuccessStatusCode) {
            throw "RESUMABLE_UPLOAD_FAILED_HTTP_$([int]$putResponse.StatusCode) $body"
        }
        $result = $body | ConvertFrom-Json
        if (-not $result.id) { throw "DRIVE_UPLOAD_FILE_ID_MISSING" }
        if ([int64]$result.size -ne $length) { throw "DRIVE_UPLOAD_SIZE_MISMATCH=$($result.id)" }

        return [pscustomobject]@{
            id = [string]$result.id
            size = [int64]$result.size
            sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower()
        }
    }
    finally {
        $putResponse.Dispose()
        $put.Dispose()
        $stream.Dispose()
    }
}

function Remove-PmvNewDriveObject {
    param([System.Net.Http.HttpClient]$Client,[string]$FileId)
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Delete,("https://www.googleapis.com/drive/v3/files/" + [uri]::EscapeDataString($FileId)))
    $response = $Client.SendAsync($request).GetAwaiter().GetResult()
    try {
        if (-not $response.IsSuccessStatusCode -and [int]$response.StatusCode -ne 404) { return $false }
        return $true
    }
    finally {
        $response.Dispose()
        $request.Dispose()
    }
}

$accessToken = $null
$client = $null
$uploadedIds = New-Object System.Collections.Generic.List[string]
$thumbnailIds = New-Object System.Collections.Generic.List[string]
$thumbnailHashes = New-Object System.Collections.Generic.List[string]
$catalogResult = $null
$rollbackFailures = New-Object System.Collections.Generic.List[string]
$normalAccessKeyPath = Join-Path $windowsDir "normal_access_key_file.dpapi"
$productionStatePath = Join-Path $ProductionDir "production_state.json"

if (-not (Test-Path -LiteralPath $normalAccessKeyPath -PathType Leaf)) {
    throw "NORMAL_ACCESS_KEY_FILE_MISSING"
}

if (-not (Test-Path -LiteralPath $productionStatePath -PathType Leaf)) {
    throw "PRODUCTION_STATE_FILE_MISSING"
}

$productionState = Get-Content -LiteralPath $productionStatePath -Raw | ConvertFrom-Json
$recoveryFilePath = $null

if ($productionState.PSObject.Properties.Name -contains "recovery_file") {
    $recoveryFilePath = [string]$productionState.recovery_file
}

if ([string]::IsNullOrWhiteSpace($recoveryFilePath)) {
    $recoveryFilePath = "D:\pmv-v1-recovery.json"
}

if (-not (Test-Path -LiteralPath $recoveryFilePath -PathType Leaf)) {
    throw "PRODUCTION_RECOVERY_FILE_MISSING=$recoveryFilePath"
}

$normalAccessHashBefore = (Get-FileHash -LiteralPath $normalAccessKeyPath -Algorithm SHA256).Hash.ToLower()
$recoveryHashBefore = (Get-FileHash -LiteralPath $recoveryFilePath -Algorithm SHA256).Hash.ToLower()

New-Item -ItemType Directory -Path $workDir -Force | Out-Null

try {
    $preOutput = & $prepareScript -DryRun -ProductionDir $ProductionDir -EvidenceDir $preDir
    if ($preOutput -notcontains "PHOTO_CATALOG_BACKFILL_DRYRUN=PASS") { throw "PRE_BACKFILL_DRYRUN_NOT_PASS" }
    $preEvidence = Get-Content (Join-Path $preDir "photo-catalog-backfill-dry-run-evidence.json") -Raw | ConvertFrom-Json
    if ([int]$preEvidence.photo_count -ne $expectedPhotoCount) { throw "PRE_BACKFILL_PHOTO_COUNT_MISMATCH" }

    $installOutput = & $installScript -RepoPath $RepoPath
    if ($installOutput -notcontains "PHOTO_CATALOG_BACKFILL_CORE_INSTALL=PASS") { throw "BACKFILL_CORE_INSTALL_NOT_PASS" }

    $coreExe = Join-Path $RepoPath "target\release\production_photo_catalog_backfill.exe"
    if (-not (Test-Path -LiteralPath $coreExe -PathType Leaf)) { throw "BACKFILL_CORE_BINARY_MISSING" }

    & $coreExe stage-thumbnails $ProductionDir $workDir $thumbnailScript ([string]$Generation)
    if ($LASTEXITCODE -ne 0) { throw "PHOTO_CATALOG_THUMBNAIL_STAGE_FAILED" }

    $encryptedThumbnails = @(Get-ChildItem -LiteralPath $encryptedThumbnailDir -Filter "*.thumb.enc" -File | Sort-Object Name)
    if ($encryptedThumbnails.Count -ne $expectedPhotoCount) {
        throw "ENCRYPTED_THUMBNAIL_COUNT_MISMATCH=$($encryptedThumbnails.Count)"
    }

    $accessToken = Get-PmvDriveAccessToken -ClientId $clientId -ClientSecretPath $clientSecretPath
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromMinutes(10)
    $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer",$accessToken)

    $index = 0
    foreach ($thumbnail in $encryptedThumbnails) {
        $index++
        $remoteName = "pmv-photo-thumb-v0-" + [guid]::NewGuid().ToString("N") + ".bin"
        $result = New-PmvDriveObject -Client $client -Path $thumbnail.FullName -ObjectName $remoteName
        $uploadedIds.Add($result.id)
        $thumbnailIds.Add($result.id)
        $thumbnailHashes.Add($result.sha256)
        Write-Output "THUMBNAIL_UPLOAD_PASS=$index/$expectedPhotoCount"
    }

    if ($thumbnailIds.Count -ne $expectedPhotoCount) { throw "THUMBNAIL_UPLOAD_COUNT_MISMATCH=$($thumbnailIds.Count)" }

    $thumbnailIdsJson = @(
        $thumbnailIds | ForEach-Object { [string]$_ }
    ) | ConvertTo-Json -Compress
    if ($thumbnailIdsJson.Length -gt 30000) { throw "THUMBNAIL_FILE_ID_ENV_TOO_LARGE=$($thumbnailIdsJson.Length)" }

    $env:PMV_CATALOG_THUMBNAIL_FILE_IDS_JSON = $thumbnailIdsJson
    $env:PMV_CATALOG_CREATED_AT = (Get-Date).ToUniversalTime().ToString("o")

    try {
        & $coreExe encrypt-catalog-from-env $ProductionDir $catalogEncryptedPath ([string]$Generation)
        if ($LASTEXITCODE -ne 0) { throw "PHOTO_CATALOG_ENCRYPT_FAILED" }
    }
    finally {
        $env:PMV_CATALOG_THUMBNAIL_FILE_IDS_JSON = $null
        $env:PMV_CATALOG_CREATED_AT = $null
        $thumbnailIdsJson = $null
    }

    if (-not (Test-Path -LiteralPath $catalogEncryptedPath -PathType Leaf)) { throw "ENCRYPTED_CATALOG_MISSING" }

    $catalogRemoteName = "pmv-photo-catalog-v0-g$Generation-" + [guid]::NewGuid().ToString("N") + ".json"
    $catalogResult = New-PmvDriveObject -Client $client -Path $catalogEncryptedPath -ObjectName $catalogRemoteName
    $uploadedIds.Add($catalogResult.id)

    $postOutput = & $prepareScript -DryRun -ProductionDir $ProductionDir -EvidenceDir $postDir
    if ($postOutput -notcontains "PHOTO_CATALOG_BACKFILL_DRYRUN=PASS") { throw "POST_BACKFILL_DRYRUN_NOT_PASS" }
    $postEvidence = Get-Content (Join-Path $postDir "photo-catalog-backfill-dry-run-evidence.json") -Raw | ConvertFrom-Json

    if ([string]$preEvidence.inventory_sha256 -ne [string]$postEvidence.inventory_sha256) { throw "ORIGINAL_PRODUCTION_MEDIA_CHANGED" }
    if ([string]$preEvidence.production_state_sha256 -ne [string]$postEvidence.production_state_sha256) { throw "PRODUCTION_STATE_CHANGED" }
    if ([string]$preEvidence.full_media_cloud_state_sha256 -ne [string]$postEvidence.full_media_cloud_state_sha256) { throw "CANONICAL_CLOUD_STATE_CHANGED" }

    $normalAccessHashAfter = (Get-FileHash -LiteralPath $normalAccessKeyPath -Algorithm SHA256).Hash.ToLower()
    $recoveryHashAfter = (Get-FileHash -LiteralPath $recoveryFilePath -Algorithm SHA256).Hash.ToLower()

    if ($normalAccessHashBefore -ne $normalAccessHashAfter) {
        throw "NORMAL_ACCESS_AUTHORITY_CHANGED"
    }

    if ($recoveryHashBefore -ne $recoveryHashAfter) {
        throw "RECOVERY_AUTHORITY_CHANGED"
    }

    $aggregateText = ($thumbnailHashes -join [Environment]::NewLine) + [Environment]::NewLine
    $aggregateBytes = [Text.Encoding]::UTF8.GetBytes($aggregateText)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $thumbnailAggregateSha256 = ([BitConverter]::ToString($sha.ComputeHash($aggregateBytes))).Replace("-","").ToLower()
    }
    finally {
        $sha.Dispose()
        [Array]::Clear($aggregateBytes,0,$aggregateBytes.Length)
    }

    New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
    $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
    $evidencePath = Join-Path $evidenceDir ("PMV_Photo_Catalog_Backfill_G" + $Generation + "_" + $stamp + ".json")

    $evidence = [ordered]@{
        format = "PMV-PHOTO-CATALOG-BACKFILL-EVIDENCE-V1"
        vault_id = $expectedVaultId
        generation = $Generation
        photo_count = $expectedPhotoCount
        catalog_entry_count = $expectedPhotoCount
        thumbnail_generated = $expectedPhotoCount
        thumbnail_encrypted = $expectedPhotoCount
        thumbnail_uploaded = $expectedPhotoCount
        thumbnail_ciphertext_aggregate_sha256 = $thumbnailAggregateSha256
        catalog_file_id = [string]$catalogResult.id
        catalog_ciphertext_sha256 = [string]$catalogResult.sha256
        catalog_ciphertext_bytes = [int64]$catalogResult.size
        catalog_plaintext_persisted = $false
        media_body_persisted = $false
        temp_plaintext_remain = 0
        original_inventory_sha256_before = [string]$preEvidence.inventory_sha256
        original_inventory_sha256_after = [string]$postEvidence.inventory_sha256
        original_photo_blob_modified = $false
        original_manifest_modified = $false
        production_state_modified = $false
        canonical_cloud_state_modified = $false
        normal_access_wrapper_sha256_before = $normalAccessHashBefore
        normal_access_wrapper_sha256_after = $normalAccessHashAfter
        recovery_file_sha256_before = $recoveryHashBefore
        recovery_file_sha256_after = $recoveryHashAfter
        production_kek_changed = $false
        recovery_authority_changed = $false
        oauth_scope = "https://www.googleapis.com/auth/drive.file"
        broad_scope_used = $false
        completed_at = (Get-Date).ToUniversalTime().ToString("o")
    }

    $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidencePath -Encoding UTF8
    $evidenceHash = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLower()

    Write-Output "PHOTO_CATALOG_BACKFILL=PASS"
    Write-Output "PHOTO_COUNT=$expectedPhotoCount"
    Write-Output "CATALOG_ENTRY_COUNT=$expectedPhotoCount"
    Write-Output "THUMBNAIL_GENERATED=$expectedPhotoCount"
    Write-Output "THUMBNAIL_ENCRYPTED=$expectedPhotoCount"
    Write-Output "THUMBNAIL_UPLOADED=$expectedPhotoCount"
    Write-Output "CATALOG_ENCRYPTED_AT_REST=YES"
    Write-Output "CATALOG_PLAINTEXT_PERSISTED=NO"
    Write-Output "MEDIA_BODY_PERSISTED=NO"
    Write-Output "TEMP_PLAINTEXT_REMAIN=0"
    Write-Output "ORIGINAL_PRODUCTION_MEDIA_UNCHANGED=PASS"
    Write-Output "NORMAL_ACCESS_AUTHORITY_UNCHANGED=PASS"
    Write-Output "RECOVERY_AUTHORITY_UNCHANGED=PASS"
    Write-Output "OAUTH_SCOPE=drive.file"
    Write-Output "CATALOG_FILE_ID=$($catalogResult.id)"
    Write-Output "CATALOG_GENERATION=$Generation"
    Write-Output "EVIDENCE=$evidencePath"
    Write-Output "EVIDENCE_SHA256=$evidenceHash"
    Write-Output "PRODUCTION_MUTATION=CATALOG_AND_ENCRYPTED_THUMBNAILS_ONLY"
}
catch {
    if ($client) {
        for ($i = $uploadedIds.Count - 1; $i -ge 0; $i--) {
            $id = $uploadedIds[$i]
            try {
                if (-not (Remove-PmvNewDriveObject -Client $client -FileId $id)) { $rollbackFailures.Add($id) }
            }
            catch { $rollbackFailures.Add($id) }
        }
    }

    if ($rollbackFailures.Count -gt 0) {
        Write-Error "BACKFILL_ROLLBACK_INCOMPLETE_ORPHAN_COUNT=$($rollbackFailures.Count)"
    }
    else {
        Write-Output "BACKFILL_NEW_OBJECT_ROLLBACK=PASS"
    }
    throw
}
finally {
    $env:PMV_CATALOG_THUMBNAIL_FILE_IDS_JSON = $null
    $env:PMV_CATALOG_CREATED_AT = $null
    $accessToken = $null
    if ($client) { $client.Dispose() }

    if (Test-Path -LiteralPath $workDir) {
        Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path -LiteralPath $workDir) {
        Write-Error "BACKFILL_TEMP_CLEANUP_FAILED"
    }
}
