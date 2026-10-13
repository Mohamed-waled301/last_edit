Add-Type -AssemblyName System.Drawing

$src = "C:\Users\kaled\.gemini\antigravity-ide\brain\d8e2d205-fb23-48a0-9e88-e4f8304d7691\erp_app_icon_1791864867436.jpg"
$destPng = Join-Path $PSScriptRoot "..\public\icon.png"
$destIco = Join-Path $PSScriptRoot "..\public\icon.ico"

$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, 256, 256)

$bmp.Save($destPng, [System.Drawing.Imaging.ImageFormat]::Png)

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream($destIco, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$g.Dispose()
$bmp.Dispose()
$img.Dispose()

Write-Output "Successfully generated icon.png and icon.ico"
