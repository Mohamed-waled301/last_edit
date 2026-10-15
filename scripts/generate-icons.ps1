Add-Type -AssemblyName System.Drawing

$logoPath = Join-Path $PSScriptRoot "..\Logo.png"
if (-not (Test-Path $logoPath)) {
    Write-Error "Logo.png not found at $logoPath"
    exit 1
}

$img = [System.Drawing.Image]::FromFile($logoPath)

# 1. Save public/logo.png
$publicLogo = Join-Path $PSScriptRoot "..\public\logo.png"
$img.Save($publicLogo, [System.Drawing.Imaging.ImageFormat]::Png)

# 2. Generate 256x256 icon.png
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, 256, 256)

$publicPng = Join-Path $PSScriptRoot "..\public\icon.png"
$buildPng = Join-Path $PSScriptRoot "..\build\icon.png"
$bmp.Save($publicPng, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($buildPng, [System.Drawing.Imaging.ImageFormat]::Png)

# 3. Generate icon.ico
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$publicIco = Join-Path $PSScriptRoot "..\public\icon.ico"
$buildIco = Join-Path $PSScriptRoot "..\build\icon.ico"
$electronIco = Join-Path $PSScriptRoot "..\electron\icon.ico"

$fs1 = New-Object System.IO.FileStream($publicIco, [System.IO.FileMode]::Create)
$icon.Save($fs1)
$fs1.Close()

$fs2 = New-Object System.IO.FileStream($buildIco, [System.IO.FileMode]::Create)
$icon.Save($fs2)
$fs2.Close()

$fs3 = New-Object System.IO.FileStream($electronIco, [System.IO.FileMode]::Create)
$icon.Save($fs3)
$fs3.Close()

$icon.Dispose()
$g.Dispose()
$bmp.Dispose()
$img.Dispose()

Write-Output "Icons and Logo successfully updated from Logo.png!"
