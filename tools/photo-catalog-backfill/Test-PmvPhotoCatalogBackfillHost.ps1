[CmdletBinding()]
param(
    [string]$ProductionRepo = "D:\Downloads\pmv-s2-v2\pmv-s2-v2"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$photoWrapper = Join-Path $ProductionRepo "pmv-production-photo-open.ps1"
$photoExe = Join-Path $ProductionRepo "target\release\production_photo_view.exe"

if (-not (Test-Path $photoWrapper -PathType Leaf)) {
    throw "PHOTO_WRAPPER_MISSING=$photoWrapper"
}

if (-not (Test-Path $photoExe -PathType Leaf)) {
    throw "PHOTO_VIEW_EXE_MISSING=$photoExe"
}

$wrapperText = Get-Content $photoWrapper -Raw -Encoding UTF8

if (-not $wrapperText.Contains('[switch]$PreviewOnly')) {
    throw "PHOTO_WRAPPER_PREVIEW_ONLY_MISSING"
}

Add-Type -AssemblyName System.Drawing

$systemDrawingAvailable = $false
try {
    $bmp = New-Object System.Drawing.Bitmap 2,2
    $bmp.Dispose()
    $systemDrawingAvailable = $true
}
catch {
    $systemDrawingAvailable = $false
}

$heifAppx = @(
    Get-AppxPackage -Name "Microsoft.HEIFImageExtension" -ErrorAction SilentlyContinue
)

$hevcAppx = @(
    Get-AppxPackage -Name "Microsoft.HEVCVideoExtension*" -ErrorAction SilentlyContinue
)

$wicHeif = $false
$wicRoots = @(
    "Registry::HKEY_CLASSES_ROOT\CLSID",
    "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\CLSID"
)

foreach ($root in $wicRoots) {
    if (-not (Test-Path $root)) { continue }

    $hits = Get-ChildItem $root -ErrorAction SilentlyContinue |
        ForEach-Object {
            try {
                $p = Get-ItemProperty $_.PSPath -ErrorAction Stop
                [pscustomobject]@{
                    Name = [string]$p.'(default)'
                    Path = $_.PSPath
                }
            }
            catch {
                $null
            }
        } |
        Where-Object {
            $_ -and $_.Name -match 'HEIF|HEIC'
        } |
        Select-Object -First 1

    if ($hits) {
        $wicHeif = $true
        break
    }
}

$magick = Get-Command magick.exe -ErrorAction SilentlyContinue
$ffmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue

$heicDecoderAvailable =
    ($heifAppx.Count -gt 0) -or
    $wicHeif -or
    ($null -ne $magick) -or
    ($null -ne $ffmpeg)

Write-Output "PHOTO_CATALOG_BACKFILL_HOST_CAPABILITY=PASS"
Write-Output "PRODUCTION_REPO=$ProductionRepo"
Write-Output "PHOTO_WRAPPER=PASS"
Write-Output "PHOTO_VIEW_EXE=PASS"
Write-Output "PREVIEW_ONLY=PASS"
Write-Output "SYSTEM_DRAWING_AVAILABLE=$($systemDrawingAvailable.ToString().ToUpperInvariant())"
Write-Output "HEIF_APPX_PRESENT=$((($heifAppx.Count -gt 0)).ToString().ToUpperInvariant())"
Write-Output "HEVC_APPX_PRESENT=$((($hevcAppx.Count -gt 0)).ToString().ToUpperInvariant())"
Write-Output "WIC_HEIF_DECODER_PRESENT=$($wicHeif.ToString().ToUpperInvariant())"
Write-Output "IMAGEMAGICK_PRESENT=$((($null -ne $magick)).ToString().ToUpperInvariant())"
Write-Output "FFMPEG_PRESENT=$((($null -ne $ffmpeg)).ToString().ToUpperInvariant())"
Write-Output "HEIC_THUMBNAIL_DECODER_AVAILABLE=$($heicDecoderAvailable.ToString().ToUpperInvariant())"
Write-Output "MEDIA_BODY_DECRYPTED=NO"
Write-Output "PRODUCTION_MUTATION=NO"

if (-not $systemDrawingAvailable) {
    throw "SYSTEM_DRAWING_UNAVAILABLE"
}

if (-not $heicDecoderAvailable) {
    throw "HEIC_THUMBNAIL_DECODER_UNAVAILABLE"
}
