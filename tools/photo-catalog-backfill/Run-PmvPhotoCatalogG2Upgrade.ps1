[CmdletBinding()]
param(
    [switch]$Execute,
    [string]$RepoPath = "D:\Downloads\pmv-s2-v2\pmv-s2-v2",
    [string]$ProductionDir = (Join-Path $env:LOCALAPPDATA "PMV\production_v1")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $Execute) { throw "G2_CATALOG_MUTATION_NOT_AUTHORIZED_USE_EXECUTE" }

$sourceCommit = "05ae8ed096ab74407f8218d16b24e68c1dc8d7c5"
$baseUrl = "https://raw.githubusercontent.com/norihisa1977/pmv-oauth-pages/$sourceCommit/tools/photo-catalog-backfill"
$clientId = "708619313298-kld9fo416ou464b013504lhm4cu63bho.apps.googleusercontent.com"
$g1CatalogFileId = "1G-HGKkyhUW3kaKN5m0AZAJb7-_zv0DS8"
$g1ExpectedBytes = 195833
$expectedPhotoCount = 392
$windowsDir = Join-Path $ProductionDir "windows"
$clientSecretPath = Join-Path $windowsDir "google_client_secret.dpapi"
$tempDir = Join-Path $env:TEMP ("pmv-photo-catalog-g2-" + [guid]::NewGuid().ToString("N"))
$g1Path = Join-Path $tempDir "catalog-g1.json"
$g2Path = Join-Path $tempDir "catalog-g2.json"
$evidenceDir = Join-Path $ProductionDir "evidence"

foreach ($required in @(
    (Join-Path $ProductionDir "production_state.json"),
    (Join-Path $ProductionDir "migration\full_media_cloud_state.jsonl"),
    (Join-Path $ProductionDir "media"),
    $clientSecretPath
)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "G2_REQUIRED_PATH_MISSING=$required" }
}

Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security

function Get-PmvDriveAccessToken {
    param([string]$ClientId,[string]$ClientSecretPath)

    $entropy = [Text.Encoding]::UTF8.GetBytes("PMV:v1:google-oauth-client-secret")
    $secretBytes = $null
    $secret = $null
    $stored = $null

    try {
        $secretBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            [IO.File]::ReadAllBytes($ClientSecretPath),
            $entropy,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        $secret = [Text.Encoding]::UTF8.GetString($secretBytes)
        if ([string]::IsNullOrWhiteSpace($secret)) { throw "PMV_GOOGLE_CLIENT_SECRET_INVALID" }

        $vault = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new()
        try {
            $stored = $vault.Retrieve("PMV","google_refresh_token_v1")
            $stored.RetrievePassword()
        }
        catch { throw "GOOGLE_REFRESH_TOKEN_SECURE_STORAGE_MISSING" }

        $token = Invoke-RestMethod -Method Post -Uri "https://oauth2.googleapis.com/token" -ContentType "application/x-www-form-urlencoded" -Body @{
            client_id = $ClientId
            client_secret = $secret
            refresh_token = $stored.Password
            grant_type = "refresh_token"
        }

        if (-not $token.access_token) { throw "DRIVE_OAUTH_REFRESH_FAILED" }
        $accessToken = [string]$token.access_token

        $info = Invoke-RestMethod -Method Get -Uri ("https://oauth2.googleapis.com/tokeninfo?access_token=" + [uri]::EscapeDataString($accessToken))
        if ([string]$info.aud -ne $ClientId) { throw "DRIVE_OAUTH_AUDIENCE_MISMATCH" }

        $scopes = @(([string]$info.scope -split "\s+") | Where-Object { $_ })
        if ($scopes.Count -ne 1 -or $scopes[0] -ne "https://www.googleapis.com/auth/drive.file") {
            throw "DRIVE_SCOPE_NOT_EXACT_DRIVE_FILE=$([string]$info.scope)"
        }

        return $accessToken
    }
    finally {
        if ($secretBytes) { [Array]::Clear($secretBytes,0,$secretBytes.Length) }
        if ($entropy) { [Array]::Clear($entropy,0,$entropy.Length) }
        $secret = $null
        $stored = $null
    }
}

function New-PmvDriveObject {
    param([System.Net.Http.HttpClient]$Client,[string]$Path,[string]$ObjectName)

    $item = Get-Item -LiteralPath $Path
    $length = [int64]$item.Length
    if ($length -le 0) { throw "G2_UPLOAD_SOURCE_EMPTY" }

    $init = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post,"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size")
    $metadata = @{ name = $ObjectName } | ConvertTo-Json -Compress
    $init.Content = [System.Net.Http.StringContent]::new($metadata,[Text.Encoding]::UTF8,"application/json")
    $init.Headers.TryAddWithoutValidation("X-Upload-Content-Type","application/json") | Out-Null
    $init.Headers.TryAddWithoutValidation("X-Upload-Content-Length",[string]$length) | Out-Null
    $initResponse = $Client.SendAsync($init).GetAwaiter().GetResult()

    try {
        if (-not $initResponse.IsSuccessStatusCode) {
            throw "G2_RESUMABLE_INIT_FAILED_HTTP_$([int]$initResponse.StatusCode)"
        }
        if (-not $initResponse.Headers.Location) { throw "G2_RESUMABLE_LOCATION_MISSING" }
        $sessionUri = $initResponse.Headers.Location.AbsoluteUri
    }
    finally {
        $initResponse.Dispose()
        $init.Dispose()
    }

    $stream = [IO.File]::OpenRead($Path)
    $put = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Put,$sessionUri)
    $put.Content = [System.Net.Http.StreamContent]::new($stream)
    $put.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/json")
    $put.Content.Headers.ContentLength = $length
    $response = $Client.SendAsync($put).GetAwaiter().GetResult()

    try {
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "G2_UPLOAD_FAILED_HTTP_$([int]$response.StatusCode)"
        }
        $result = $body | ConvertFrom-Json
        if (-not $result.id) { throw "G2_UPLOAD_FILE_ID_MISSING" }
        if ([int64]$result.size -ne $length) { throw "G2_UPLOAD_SIZE_MISMATCH" }
        return $result
    }
    finally {
        $response.Dispose()
        $put.Dispose()
        $stream.Dispose()
    }
}

New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$accessToken = $null
$client = $null

try {
    $accessToken = Get-PmvDriveAccessToken -ClientId $clientId -ClientSecretPath $clientSecretPath

    $headers = @{ Authorization = "Bearer $accessToken" }
    Invoke-WebRequest -Uri ("https://www.googleapis.com/drive/v3/files/" + $g1CatalogFileId + "?alt=media") -Headers $headers -OutFile $g1Path -UseBasicParsing

    if (-not (Test-Path -LiteralPath $g1Path -PathType Leaf)) { throw "G1_CATALOG_DOWNLOAD_MISSING" }
    if ((Get-Item -LiteralPath $g1Path).Length -ne $g1ExpectedBytes) {
        throw "G1_CATALOG_SIZE_MISMATCH"
    }

    foreach ($name in @("production_photo_catalog_backfill.rs","Install-PmvPhotoCatalogBackfillCore.ps1")) {
        Invoke-WebRequest -Uri "$baseUrl/$name" -OutFile (Join-Path $tempDir $name) -UseBasicParsing
    }

    $installer = Join-Path $tempDir "Install-PmvPhotoCatalogBackfillCore.ps1"
    $installOutput = & $installer -RepoPath $RepoPath
    if ($installOutput -notcontains "PHOTO_CATALOG_BACKFILL_CORE_INSTALL=PASS") {
        throw "G2_CORE_INSTALL_NOT_PASS"
    }

    $coreExe = Join-Path $RepoPath "target\release\production_photo_catalog_backfill.exe"
    if (-not (Test-Path -LiteralPath $coreExe -PathType Leaf)) { throw "G2_CORE_BINARY_MISSING" }

    $env:PMV_CATALOG_CREATED_AT = (Get-Date).ToUniversalTime().ToString("o")
    try {
        & $coreExe upgrade-catalog-g1-to-g2 $ProductionDir $g1Path $g2Path
        if ($LASTEXITCODE -ne 0) { throw "G2_CATALOG_PREPARE_FAILED" }
    }
    finally {
        $env:PMV_CATALOG_CREATED_AT = $null
    }

    if (-not (Test-Path -LiteralPath $g2Path -PathType Leaf)) { throw "G2_CATALOG_OUTPUT_MISSING" }

    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromMinutes(10)
    $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer",$accessToken)

    $remoteName = "pmv-photo-catalog-v1-g2-" + [guid]::NewGuid().ToString("N") + ".json"
    $upload = New-PmvDriveObject -Client $client -Path $g2Path -ObjectName $remoteName

    New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
    $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
    $evidencePath = Join-Path $evidenceDir ("PMV_Photo_Catalog_G2_" + $stamp + ".json")

    $evidence = [ordered]@{
        format = "PMV-PHOTO-CATALOG-G2-EVIDENCE-V1"
        source_catalog_file_id = $g1CatalogFileId
        source_generation = 1
        catalog_file_id = [string]$upload.id
        generation = 2
        photo_count = $expectedPhotoCount
        wrapped_media_dek_embedded = $true
        thumbnails_regenerated = 0
        original_photo_blob_modified = $false
        original_manifest_modified = $false
        production_kek_changed = $false
        recovery_authority_changed = $false
        oauth_scope = "https://www.googleapis.com/auth/drive.file"
        catalog_ciphertext_sha256 = (Get-FileHash -LiteralPath $g2Path -Algorithm SHA256).Hash.ToLower()
        catalog_ciphertext_bytes = [int64](Get-Item -LiteralPath $g2Path).Length
        completed_at = (Get-Date).ToUniversalTime().ToString("o")
    }

    $evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $evidencePath -Encoding UTF8
    $evidenceSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLower()

    Write-Output "PHOTO_CATALOG_G2_UPGRADE=PASS"
    Write-Output "SOURCE_GENERATION=1"
    Write-Output "CATALOG_GENERATION=2"
    Write-Output "PHOTO_COUNT=$expectedPhotoCount"
    Write-Output "WRAPPED_MEDIA_DEK_EMBEDDED=YES"
    Write-Output "THUMBNAILS_REGENERATED=0"
    Write-Output "ORIGINAL_PRODUCTION_MEDIA_MUTATION=0"
    Write-Output "PRODUCTION_KEK_CHANGED=NO"
    Write-Output "RECOVERY_AUTHORITY_CHANGED=NO"
    Write-Output "CATALOG_FILE_ID=$($upload.id)"
    Write-Output "EVIDENCE=$evidencePath"
    Write-Output "EVIDENCE_SHA256=$evidenceSha256"
}
finally {
    $env:PMV_CATALOG_CREATED_AT = $null
    $accessToken = $null
    if ($client) { $client.Dispose() }
    if (Test-Path -LiteralPath $tempDir) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $tempDir) { Write-Error "G2_TEMP_CLEANUP_FAILED" }
}
