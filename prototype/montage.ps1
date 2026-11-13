# usage: montage.ps1 out x y w h scale cols file1 file2 ...   (files are names in shots/v10 without .png)
param([string]$out,[int]$x,[int]$y,[int]$w,[int]$h,[int]$s,[int]$cols,[string]$fl)
Add-Type -AssemblyName System.Drawing
$dir=(Get-Location).Path+"\shots\v10\"
$files=$fl.Split(","); $rows=[math]::Ceiling($files.Count/$cols)
$n=New-Object System.Drawing.Bitmap ($cols*($w*$s+6)),($rows*($h*$s+6))
$g=[System.Drawing.Graphics]::FromImage($n); $g.Clear([System.Drawing.Color]::FromArgb(40,40,40)); $g.InterpolationMode='NearestNeighbor'; $g.PixelOffsetMode='Half'
$i=0
foreach($f in $files){ $b=[System.Drawing.Bitmap]::FromFile($dir+$f+".png"); $r=New-Object System.Drawing.Rectangle $x,$y,$w,$h
 $c=$b.Clone($r,$b.PixelFormat); $cx=($i % $cols)*($w*$s+6); $cy=[math]::Floor($i/$cols)*($h*$s+6)
 $g.DrawImage($c,$cx,$cy,$w*$s,$h*$s); $b.Dispose(); $i++ }
$n.Save($out)
