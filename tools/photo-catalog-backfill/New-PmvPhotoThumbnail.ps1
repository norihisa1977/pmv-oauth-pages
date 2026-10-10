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

function Get-PmvImageExtension {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    try {
        $buffer = New-Object byte[] 32
        $read = $stream.Read($buffer,0,$buffer.Length)
    }
    finally {
        $stream.Dispose()
    }

    if ($read -ge 3 -and $buffer[0] -eq 0xFF -and $buffer[1] -eq 0xD8 -and $buffer[2] -eq 0xFF) { return ".jpg" }
    if ($read -ge 8 -and $buffer[0] -eq 0x89 -and $buffer[1] -eq 0x50 -and $buffer[2] -eq 0x4E -and $buffer[3] -eq 0x47) { return ".png" }
    if ($read -ge 12 -and [Text.Encoding]::ASCII.GetString($buffer,0,4) -eq "RIFF" -and [Text.Encoding]::ASCII.GetString($buffer,8,4) -eq "WEBP") { return ".webp" }

    if ($read -ge 12 -and [Text.Encoding]::ASCII.GetString($buffer,4,4) -eq "ftyp") {
        $brand = [Text.Encoding]::ASCII.GetString($buffer,8,4)

        if ($brand -in @("avif","avis")) { return ".avif" }

        # Canonical Production photo corpus is HEIC/JPG/PNG only.
        # Any remaining ISO-BMFF image in this corpus is therefore HEIC/HEIF.
        if ($brand -in @(
            "heic","heix","hevc","hevx",
            "heis","heim","hevm","hevs",
            "mif1","msf1"
        )) { return ".heic" }

        return ".heic"
    }

    return ".img"
}

function Save-PmvWpfThumbnail {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][int]$Dimension,
        [Parameter(Mandatory = $true)][int]$Quality
    )

    Add-Type -AssemblyName PresentationCore
    Add-Type -AssemblyName WindowsBase

    $stream = $null
    $out = $null

    try {
        $stream = [IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)

        $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create(
            $stream,
            [Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,
            [Windows.Media.Imaging.BitmapCacheOption]::OnLoad
        )

        if ($decoder.Frames.Count -lt 1) { throw "THUMBNAIL_DECODER_NO_FRAME" }

        $frame = $decoder.Frames[0]
        $width = [double]$frame.PixelWidth
        $height = [double]$frame.PixelHeight

        if ($width -le 0 -or $height -le 0) { throw "THUMBNAIL_SOURCE_DIMENSION_INVALID" }

        $scale = [Math]::Min(1.0,[double]$Dimension / [Math]::Max($width,$height))
        $targetWidth = [Math]::Max(1,[int][Math]::Round($width * $scale))
        $targetHeight = [Math]::Max(1,[int][Math]::Round($height * $scale))
        $transformed = $frame

        if ($targetWidth -ne $frame.PixelWidth -or $targetHeight -ne $frame.PixelHeight) {
            $transform = New-Object Windows.Media.ScaleTransform(
                ([double]$targetWidth / $frame.PixelWidth),
                ([double]$targetHeight / $frame.PixelHeight)
            )

            $transformed = New-Object Windows.Media.Imaging.TransformedBitmap($frame,$transform)
        }

        $cleanFrame = [Windows.Media.Imaging.BitmapFrame]::Create(
            [Windows.Media.Imaging.BitmapSource]$transformed,
            $null,
            $null,
            $null
        )

        $encoder = New-Object Windows.Media.Imaging.JpegBitmapEncoder
        $encoder.QualityLevel = $Quality
        $encoder.Frames.Add($cleanFrame)

        $out = [IO.File]::Open($Destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $encoder.Save($out)
    }
    finally {
        if ($out) { $out.Dispose() }
        if ($stream) { $stream.Dispose() }
    }
}

function Save-PmvShellThumbnail {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][int]$Dimension,
        [Parameter(Mandatory = $true)][int]$Quality
    )

    Add-Type -AssemblyName System.Drawing

    if (-not ("PmvShellThumbnail" -as [type])) {
        Add-Type -ReferencedAssemblies @('System.Drawing.dll') -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public static class PmvShellThumbnail
{
    [StructLayout(LayoutKind.Sequential)]
    public struct SIZE { public int cx; public int cy; }

    [Flags]
    public enum SIIGBF : uint
    {
        RESIZETOFIT = 0x00,
        BIGGERSIZEOK = 0x01,
        MEMORYONLY = 0x02,
        ICONONLY = 0x04,
        THUMBNAILONLY = 0x08,
        INCACHEONLY = 0x10
    }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
    interface IShellItemImageFactory
    {
        void GetImage(SIZE size, SIIGBF flags, out IntPtr phbm);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out object ppv);

    [DllImport("gdi32.dll")]
    static extern bool DeleteObject(IntPtr hObject);

    public static Bitmap Get(string path, int dimension)
    {
        object obj;
        Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
        SHCreateItemFromParsingName(path, IntPtr.Zero, iid, out obj);
        var factory = (IShellItemImageFactory)obj;
        IntPtr hbitmap = IntPtr.Zero;

        try
        {
            factory.GetImage(
                new SIZE { cx = dimension, cy = dimension },
                SIIGBF.RESIZETOFIT | SIIGBF.BIGGERSIZEOK | SIIGBF.THUMBNAILONLY,
                out hbitmap
            );

            if (hbitmap == IntPtr.Zero) throw new InvalidOperationException("Shell thumbnail returned null bitmap");

            using (var source = Image.FromHbitmap(hbitmap))
            {
                return new Bitmap(source);
            }
        }
        finally
        {
            if (hbitmap != IntPtr.Zero) DeleteObject(hbitmap);
            if (obj != null && Marshal.IsComObject(obj)) Marshal.FinalReleaseComObject(obj);
        }
    }
}
'@
    }

    $bitmap = $null
    try {
        $bitmap = [PmvShellThumbnail]::Get($Path,$Dimension)

        $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
            Where-Object { $_.MimeType -eq "image/jpeg" } |
            Select-Object -First 1

        if (-not $jpegCodec) { throw "JPEG_ENCODER_NOT_FOUND" }

        $qualityEncoder = [System.Drawing.Imaging.Encoder]::Quality
        $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
            $qualityEncoder,
            [int64]$Quality
        )

        try {
            $bitmap.Save($Destination,$jpegCodec,$encoderParameters)
        }
        finally {
            $encoderParameters.Dispose()
        }
    }
    finally {
        if ($bitmap) { $bitmap.Dispose() }
    }
}

$parent = Split-Path -Parent $OutputPath
if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

$typedPath = $null
$decoderUsed = "WPF"

try {
    try {
        Save-PmvWpfThumbnail -Path $InputPath -Destination $OutputPath -Dimension $MaxDimension -Quality $JpegQuality
    }
    catch {
        if (Test-Path -LiteralPath $OutputPath) {
            Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue
        }

        $extension = Get-PmvImageExtension -Path $InputPath
        $typedPath = Join-Path ([IO.Path]::GetDirectoryName($InputPath)) (
            [IO.Path]::GetFileNameWithoutExtension($InputPath) + "-typed" + $extension
        )

        Copy-Item -LiteralPath $InputPath -Destination $typedPath -Force

        try {
            Save-PmvShellThumbnail -Path $typedPath -Destination $OutputPath -Dimension $MaxDimension -Quality $JpegQuality
            $decoderUsed = "WINDOWS_SHELL"
        }
        catch {
            throw "THUMBNAIL_ALL_DECODERS_FAILED;TYPE=$extension;WPF=$($_.Exception.Message)"
        }
    }
}
finally {
    if ($typedPath -and (Test-Path -LiteralPath $typedPath)) {
        Remove-Item -LiteralPath $typedPath -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) { throw "THUMBNAIL_OUTPUT_MISSING" }
if ((Get-Item -LiteralPath $OutputPath).Length -le 0) { throw "THUMBNAIL_OUTPUT_EMPTY" }

Write-Output "PHOTO_THUMBNAIL_GENERATION=PASS"
Write-Output "MAX_DIMENSION=$MaxDimension"
Write-Output "OUTPUT_FORMAT=JPEG"
Write-Output "METADATA_STRIPPED=YES"
Write-Output "DECODER=$decoderUsed"
