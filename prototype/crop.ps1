param([string]$in,[string]$out,[int]$x,[int]$y,[int]$w,[int]$h,[int]$s)
Add-Type -AssemblyName System.Drawing
$b=[System.Drawing.Bitmap]::FromFile($in)
$r=New-Object System.Drawing.Rectangle $x,$y,$w,$h
$c=$b.Clone($r,$b.PixelFormat)
$n=New-Object System.Drawing.Bitmap ($w*$s),($h*$s)
$g=[System.Drawing.Graphics]::FromImage($n); $g.InterpolationMode='NearestNeighbor'; $g.PixelOffsetMode='Half'
$g.DrawImage($c,0,0,$n.Width,$n.Height); $n.Save($out); $b.Dispose()
