param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [int]$MaxDimension = 320,

    [int]$JpegQuality = 82
)

$ErrorActionPreference = "Stop"

if ($MaxDimension -lt 1) { throw "THUMBNAIL_MAX_DIMENSION_INVALID" }
if ($JpegQuality -lt 1 -or $JpegQuality -gt 100) { throw "THUMBNAIL_JPEG_QUALITY_INVALID" }
if (-not (Test-Path -LiteralPath $InputPath -PathType Leaf)) { throw "THUMBNAIL_INPUT_MISSING" }

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$stream = $null
$out = $null

try {
    $stream = [IO.File]::Open(
        $InputPath,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Read,
        [IO.FileShare]::Read
    )

    $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create(
        $stream,
        [Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,
        [Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    )

    if ($decoder.Frames.Count -lt 1) {
        throw "THUMBNAIL_DECODER_NO_FRAME"
    }

    $frame = $decoder.Frames[0]
    $width = [double]$frame.PixelWidth
    $height = [double]$frame.PixelHeight

    if ($width -le 0 -or $height -le 0) {
        throw "THUMBNAIL_SOURCE_DIMENSION_INVALID"
    }

    $scale = [Math]::Min(
        1.0,
        [double]$MaxDimension / [Math]::Max($width, $height)
    )

    $targetWidth = [Math]::Max(1, [int][Math]::Round($width * $scale))
    $targetHeight = [Math]::Max(1, [int][Math]::Round($height * $scale))

    $transformed = $frame

    if ($targetWidth -ne $frame.PixelWidth -or $targetHeight -ne $frame.PixelHeight) {
        $transform = New-Object Windows.Media.ScaleTransform(
            ([double]$targetWidth / $frame.PixelWidth),
            ([double]$targetHeight / $frame.PixelHeight)
        )

        $transformed = New-Object Windows.Media.Imaging.TransformedBitmap(
            $frame,
            $transform
        )
    }

    # Creating a new frame without carrying BitmapMetadata strips EXIF/XMP metadata.
    $cleanFrame = [Windows.Media.Imaging.BitmapFrame]::Create(
        [Windows.Media.Imaging.BitmapSource]$transformed
    )

    $encoder = New-Object Windows.Media.Imaging.JpegBitmapEncoder
    $encoder.QualityLevel = $JpegQuality
    $encoder.Frames.Add($cleanFrame)

    $parent = Split-Path -Parent $OutputPath
    if ($parent) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    $out = [IO.File]::Open(
        $OutputPath,
        [IO.FileMode]::CreateNew,
        [IO.FileAccess]::Write,
        [IO.FileShare]::None
    )

    $encoder.Save($out)
}
finally {
    if ($out) { $out.Dispose() }
    if ($stream) { $stream.Dispose() }
}

if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) {
    throw "THUMBNAIL_OUTPUT_MISSING"
}

if ((Get-Item -LiteralPath $OutputPath).Length -le 0) {
    throw "THUMBNAIL_OUTPUT_EMPTY"
}

Write-Output "PHOTO_THUMBNAIL_GENERATION=PASS"
Write-Output "MAX_DIMENSION=$MaxDimension"
Write-Output "OUTPUT_FORMAT=JPEG"
Write-Output "METADATA_STRIPPED=YES"
