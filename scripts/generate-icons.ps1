Add-Type -AssemblyName System.Drawing

$logoPath = Join-Path $PSScriptRoot "..\Logo.png"
if (-not (Test-Path $logoPath)) {
    Write-Error "Logo.png not found at $logoPath"
    exit 1
}

$img = [System.Drawing.Image]::FromFile($logoPath)
$origW = $img.Width
$origH = $img.Height

# 1. Save public/logo.png
$publicLogo = Join-Path $PSScriptRoot "..\public\logo.png"
$img.Save($publicLogo, [System.Drawing.Imaging.ImageFormat]::Png)

# 2. Generate multi-resolution PNG buffers preserving aspect ratio
$sizes = @(256, 128, 64, 48, 32, 24, 16)
$pngDataList = @()

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $bgColor = [System.Drawing.Color]::FromArgb(255, 1, 1, 1)
    $brush = New-Object System.Drawing.SolidBrush $bgColor
    $g.FillRectangle($brush, 0, 0, $s, $s)

    $scale = $s / [double]$origW
    $destH = [int][Math]::Round($origH * $scale)
    $destY = [int][Math]::Round(($s - $destH) / 2.0)

    $g.DrawImage($img, 0, $destY, $s, $destH)

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $ms.ToArray()
    $ms.Close()

    $pngDataList += ,@($s, $pngBytes)

    if ($s -eq 256) {
        $publicPng = Join-Path $PSScriptRoot "..\public\icon.png"
        $buildPng = Join-Path $PSScriptRoot "..\build\icon.png"
        $distPng = Join-Path $PSScriptRoot "..\dist\icon.png"
        [System.IO.File]::WriteAllBytes($publicPng, $pngBytes)
        [System.IO.File]::WriteAllBytes($buildPng, $pngBytes)
        if (Test-Path (Split-Path $distPng)) {
            [System.IO.File]::WriteAllBytes($distPng, $pngBytes)
        }
    }

    $brush.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

$img.Dispose()

# 3. Assemble Windows ICO containing 32-bit PNGs (100% color & detail preservation)
$headerSize = 6
$entrySize = 16
$numImages = $pngDataList.Count
$offset = $headerSize + ($numImages * $entrySize)

$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $icoStream

# ICO Header
$writer.Write([uint16]0) # Reserved
$writer.Write([uint16]1) # 1 = Icon
$writer.Write([uint16]$numImages)

# Directory entries
foreach ($item in $pngDataList) {
    $s = $item[0]
    $bytes = $item[1]

    $wByte = if ($s -eq 256) { [byte]0 } else { [byte]$s }
    $hByte = if ($s -eq 256) { [byte]0 } else { [byte]$s }

    $writer.Write($wByte)          # Width
    $writer.Write($hByte)          # Height
    $writer.Write([byte]0)         # Colors
    $writer.Write([byte]0)         # Reserved
    $writer.Write([uint16]1)       # Planes
    $writer.Write([uint16]32)      # Bits per pixel
    $writer.Write([uint32]$bytes.Length) # Image size
    $writer.Write([uint32]$offset)       # Image offset

    $offset += $bytes.Length
}

# Image data
foreach ($item in $pngDataList) {
    $bytes = $item[1]
    $writer.Write($bytes)
}

$icoBytes = $icoStream.ToArray()
$writer.Close()
$icoStream.Close()

$publicIco = Join-Path $PSScriptRoot "..\public\icon.ico"
$buildIco = Join-Path $PSScriptRoot "..\build\icon.ico"
$electronIco = Join-Path $PSScriptRoot "..\electron\icon.ico"
$distIco = Join-Path $PSScriptRoot "..\dist\icon.ico"

[System.IO.File]::WriteAllBytes($publicIco, $icoBytes)
[System.IO.File]::WriteAllBytes($buildIco, $icoBytes)
[System.IO.File]::WriteAllBytes($electronIco, $icoBytes)
if (Test-Path (Split-Path $distIco)) {
    [System.IO.File]::WriteAllBytes($distIco, $icoBytes)
}

Write-Output "Icons and Logo successfully updated with 100% color accuracy and multi-resolution PNG packaging!"
