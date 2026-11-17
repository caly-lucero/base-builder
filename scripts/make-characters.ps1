Add-Type -AssemblyName System.Drawing
# Uso: extrae el zip de Tiny Dungeon (kenney.nl/assets/tiny-dungeon) en la carpeta .tiny-dungeon/ del proyecto (queda ignorada por git) y ejecuta este script.
$td = Join-Path $PSScriptRoot '..\.tiny-dungeon\Tiles'
$out = Join-Path $PSScriptRoot '..\public\assets\art'
$OUTLINE = '3F2631'
$SKIN = @('F7C282', 'E19A65')
$OX = 2; $OY = 3   # el dibujo base (16x16) va dentro de un lienzo de 20x20, con sitio para plumas, aureolas y armas

function Hex($h) { [System.Drawing.Color]::FromArgb(255, [Convert]::ToInt32($h.Substring(0,2),16), [Convert]::ToInt32($h.Substring(2,2),16), [Convert]::ToInt32($h.Substring(4,2),16)) }
function Key($c) { '{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B }

function RgbToHsv($r, $g, $b) {
  $r /= 255.0; $g /= 255.0; $b /= 255.0
  $max = [math]::Max($r, [math]::Max($g, $b)); $min = [math]::Min($r, [math]::Min($g, $b)); $d = $max - $min
  $h = 0.0
  if ($d -gt 0) {
    if ($max -eq $r) { $h = 60 * ((($g - $b) / $d) % 6) } elseif ($max -eq $g) { $h = 60 * ((($b - $r) / $d) + 2) } else { $h = 60 * ((($r - $g) / $d) + 4) }
  }
  if ($h -lt 0) { $h += 360 }
  $s = 0.0; if ($max -gt 0) { $s = $d / $max }
  return @($h, $s, $max)
}
function HsvToRgb($h, $s, $v) {
  $h = (($h % 360) + 360) % 360
  $c = $v * $s; $x = $c * (1 - [math]::Abs((($h / 60) % 2) - 1)); $m = $v - $c
  switch ([math]::Floor($h / 60)) { 0 { $r=$c;$g=$x;$b=0 } 1 { $r=$x;$g=$c;$b=0 } 2 { $r=0;$g=$c;$b=$x } 3 { $r=0;$g=$x;$b=$c } 4 { $r=$x;$g=0;$b=$c } default { $r=$c;$g=0;$b=$x } }
  return @([int][math]::Round(($r+$m)*255), [int][math]::Round(($g+$m)*255), [int][math]::Round(($b+$m)*255))
}

# Lienzo de trabajo con el personaje base dentro.
function NewChar($tile) {
  $src = New-Object System.Drawing.Bitmap "$td\tile_$tile.png"
  $w = New-Object System.Drawing.Bitmap 20, 20
  for ($y = 0; $y -lt 20; $y++) { for ($x = 0; $x -lt 20; $x++) { $w.SetPixel($x, $y, [System.Drawing.Color]::Transparent) } }
  for ($y = 0; $y -lt 16; $y++) { for ($x = 0; $x -lt 16; $x++) { $w.SetPixel($x + $OX, $y + $OY, $src.GetPixel($x, $y)) } }
  $src.Dispose()
  return $w
}
# Cambia un color exacto por otro (solo desde la fila $minY del dibujo base hacia abajo).
function Swap($w, $from, $to, $minY = 0) {
  for ($y = $minY; $y -lt 16; $y++) { for ($x = 0; $x -lt 16; $x++) {
    $c = $w.GetPixel($x + $OX, $y + $OY); if ($c.A -gt 0 -and (Key $c) -eq $from) { $w.SetPixel($x + $OX, $y + $OY, (Hex $to)) } } }
}
# Gira el tono de todo lo que tenga color (menos piel y contorno) hacia $hue y lo oscurece/satura a gusto.
function Recolor($w, $hue, $satMul = 1.0, $valMul = 1.0, $minY = 0) {
  for ($y = $minY; $y -lt 16; $y++) { for ($x = 0; $x -lt 16; $x++) {
    $c = $w.GetPixel($x + $OX, $y + $OY); if ($c.A -eq 0) { continue }
    $k = Key $c; if ($k -eq $OUTLINE -or $SKIN -contains $k) { continue }
    $hsv = RgbToHsv $c.R $c.G $c.B
    if ($hsv[1] -lt 0.22) { continue }   # los grises (acero) no se tocan
    $rgb = HsvToRgb $hue ([math]::Min(1.0, $hsv[1] * $satMul)) ([math]::Min(1.0, $hsv[2] * $valMul))
    $w.SetPixel($x + $OX, $y + $OY, [System.Drawing.Color]::FromArgb(255, $rgb[0], $rgb[1], $rgb[2]))
  } }
}
# Pone píxeles sueltos: lista de @(x, y, 'RRGGBB') en coordenadas del dibujo base.
function Put($w, $list) { foreach ($p in $list) { $x = $p[0] + $OX; $y = $p[1] + $OY; if ($x -ge 0 -and $y -ge 0 -and $x -lt 20 -and $y -lt 20) { $w.SetPixel($x, $y, (Hex $p[2])) } } }
function Line($w, $x, $y1, $y2, $col) { $l = @(); for ($y = $y1; $y -le $y2; $y++) { $l += ,@($x, $y, $col) }; Put $w $l }

# Armas y detalles (en píxeles; todo pintado a mano con la paleta del pack).
function Sword($w, $x = 13) { Line $w $x 3 8 'C0CBDC'; Put $w @(@($x,2,'F4F8FB'), @(($x-1),9,'E6B84F'), @($x,9,'E6B84F'), @(($x+1),9,'E6B84F')); Line $w $x 10 11 '7A4A22' }
function Shield($w, $col, $dark) { Put $w @(@(0,8,$dark),@(1,7,$dark),@(2,7,$dark),@(3,8,$dark),@(0,9,$dark),@(3,9,$dark),@(0,10,$dark),@(3,10,$dark),@(1,11,$dark),@(2,11,$dark),@(1,8,$col),@(2,8,$col),@(1,9,'F4F8FB'),@(2,9,$col),@(1,10,$col),@(2,10,$col)) }
function Staff($w, $gem, $x = 13) { Line $w $x 3 13 '8B5A2B'; Put $w @(@($x,1,$gem), @(($x-1),2,$gem), @(($x+1),2,$gem), @($x,2,'F4F8FB'), @($x,3,$gem)) }
function Bow($w) { Put $w @(@(1,4,'8B5A2B'),@(0,5,'8B5A2B'),@(0,6,'8B5A2B'),@(0,7,'8B5A2B'),@(0,8,'8B5A2B'),@(0,9,'8B5A2B'),@(0,10,'8B5A2B'),@(1,11,'8B5A2B'),@(1,5,'E8E0C8'),@(1,6,'E8E0C8'),@(1,7,'E8E0C8'),@(1,8,'E8E0C8'),@(1,9,'E8E0C8'),@(1,10,'E8E0C8')) }
function Quiver($w) { Line $w 13 5 9 '8B5A2B'; Put $w @(@(13,4,'E8E0C8'), @(12,4,'D9534F'), @(14,4,'D9534F')) }
function Axe($w) { Line $w 13 3 11 '8B5A2B'; Put $w @(@(14,2,'C0CBDC'),@(15,2,'C0CBDC'),@(14,3,'C0CBDC'),@(15,3,'8B9BB4'),@(16,3,'8B9BB4'),@(14,4,'C0CBDC'),@(15,4,'8B9BB4'),@(14,5,'8B9BB4'),@(15,5,'8B9BB4')) }
function Hammer($w) { Line $w 13 4 11 '8B5A2B'; Put $w @(@(11,1,'C0CBDC'),@(12,1,'C0CBDC'),@(13,1,'C0CBDC'),@(14,1,'C0CBDC'),@(15,1,'8B9BB4'),@(11,2,'8B9BB4'),@(12,2,'C0CBDC'),@(13,2,'C0CBDC'),@(14,2,'8B9BB4'),@(15,2,'52607C'),@(12,3,'52607C'),@(13,3,'52607C'),@(14,3,'52607C')) }
function Club($w) { Line $w 13 4 12 '8B5A2B'; Line $w 14 3 7 '8B5A2B'; Put $w @(@(15,4,'6B4220'),@(15,5,'6B4220'),@(15,6,'6B4220'),@(14,2,'6B4220')) }
function Crown($w) { Put $w @(@(5,-1,'E6B84F'),@(7,-1,'E6B84F'),@(9,-1,'E6B84F'),@(11,-1,'E6B84F'),@(5,0,'F4CF6A'),@(6,0,'F4CF6A'),@(7,0,'F4CF6A'),@(8,0,'F4CF6A'),@(9,0,'F4CF6A'),@(10,0,'F4CF6A'),@(11,0,'F4CF6A')) }
function Halo($w) { Put $w @(@(5,-2,'FFE9A0'),@(6,-3,'FFE9A0'),@(7,-3,'FFE9A0'),@(8,-3,'FFE9A0'),@(9,-3,'FFE9A0'),@(10,-3,'FFE9A0'),@(11,-2,'FFE9A0')) }
function Plume($w, $col) { Put $w @(@(7,-1,$col),@(8,-2,$col),@(9,-2,$col),@(10,-1,$col),@(8,-1,$col),@(9,-1,$col)) }
function Cape($w, $col, $dark) { Put $w @(@(2,7,$dark),@(2,8,$dark),@(2,9,$dark),@(1,10,$dark),@(1,11,$dark),@(1,12,$dark),@(13,7,$dark),@(13,8,$dark),@(13,9,$dark),@(14,10,$dark),@(14,11,$dark),@(14,12,$dark),@(2,10,$col),@(2,11,$col),@(13,10,$col),@(13,11,$col)) }

# Añade contorno oscuro alrededor de lo nuevo (los píxeles transparentes pegados a algo que no es contorno).
function AddOutline($w) {
  $mark = @()
  for ($y = 0; $y -lt 20; $y++) { for ($x = 0; $x -lt 20; $x++) {
    if ($w.GetPixel($x, $y).A -ne 0) { continue }
    foreach ($d in @(@(1,0),@(-1,0),@(0,1),@(0,-1))) {
      $nx = $x + $d[0]; $ny = $y + $d[1]
      if ($nx -ge 0 -and $ny -ge 0 -and $nx -lt 20 -and $ny -lt 20) { $n = $w.GetPixel($nx, $ny); if ($n.A -gt 0 -and (Key $n) -ne $OUTLINE) { $mark += ,@($x, $y); break } }
    } } }
  foreach ($m in $mark) { $w.SetPixel($m[0], $m[1], (Hex $OUTLINE)) }
}

# Escala x2 al lienzo final de 64x64, apoyado abajo y centrado.
function Save($w, $name) {
  $bmp = New-Object System.Drawing.Bitmap 64, 64
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent); $g.InterpolationMode = 'NearestNeighbor'; $g.PixelOffsetMode = 'Half'
  $g.DrawImage($w, 12, 22, 40, 40)
  $bmp.Save("$out\$name.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $w.Dispose()
}

# --- Tus tropas: azul de tu bando ---
$w = NewChar '0085'; Swap $w 'BD6C4A' '3F78C8' 7; Swap $w '763B36' '24508F' 7; Sword $w; Shield $w '3F78C8' '24508F'; AddOutline $w; Save $w 'unit_soldier'
$w = NewChar '0097'; Swap $w '52607C' '2A4F8F' 6; Plume $w '3F78C8'; Sword $w; Cape $w '3F78C8' '24508F'; AddOutline $w; Save $w 'unit_knight'
$w = NewChar '0112'; Swap $w 'BD6C4A' '9A7A45' 7; Swap $w '763B36' '6B4F2A' 7; Bow $w; Quiver $w; AddOutline $w; Save $w 'unit_archer'
$w = NewChar '0084'; Swap $w '9B4CA3' '2E8FA8'; Swap $w 'D176D0' '63D6EC'; Staff $w '63D6EC'; AddOutline $w; Save $w 'unit_mage'

# --- Héroes: cada uno con su color, su arma y un detalle que lo hace único ---
$w = NewChar '0096'; Swap $w 'C0CBDC' 'F4D675'; Swap $w '8B9BB4' 'D9A93A'; Swap $w '52607C' '9A6A1E'; Crown $w; Hammer $w; Cape $w '3F78C8' '24508F'; AddOutline $w; Save $w 'unit_hero'
$w = NewChar '0099'; Recolor $w 140 1.0 0.9; Bow $w; Quiver $w; Cape $w '3FA05A' '1F6B3A'; AddOutline $w; Save $w 'hero_ranger'
$w = NewChar '0100'; Recolor $w 175 0.9 1.05; Halo $w; Staff $w 'FFE9A0'; Cape $w 'F4F8FB' 'AAB7CC'; AddOutline $w; Save $w 'hero_priest'
$w = NewChar '0111'; Recolor $w 8 1.1 1.0; Staff $w 'FF8A30'; Put $w @(@(13,-1,'FFC060'),@(12,0,'FF6A20'),@(14,0,'FF6A20')); AddOutline $w; Save $w 'hero_pyro'
$w = NewChar '0087'; Recolor $w 355 1.1 0.9; Axe $w; Cape $w 'C0303A' '7A1A24'; AddOutline $w; Save $w 'hero_warlord'

# --- Enemigos: rojo oscuro y verde pantano, para no confundirlos con los tuyos ---
$w = NewChar '0086'; Recolor $w 355 1.0 0.7; Sword $w 3; Put $w @(@(2,9,'7A1A24'),@(3,9,'7A1A24'),@(4,9,'7A1A24')); AddOutline $w; Save $w 'enemy_guard'
$w = NewChar '0109'; Recolor $w 95 0.9 0.8; Club $w; AddOutline $w; Save $w 'enemy_brute'
$w = NewChar '0112'; Swap $w 'BD6C4A' '8A2A32' 7; Swap $w '763B36' '5A1A22' 7; Swap $w '25956A' 'C0303A'; Bow $w; Quiver $w; AddOutline $w; Save $w 'enemy_archer'
$w = NewChar '0084'; Swap $w '9B4CA3' '5A2A6A'; Swap $w 'D176D0' 'B04AD0'; Staff $w 'FF5A5A'; AddOutline $w; Save $w 'enemy_shaman'
$w = NewChar '0122'; Recolor $w 12 1.0 0.85; AddOutline $w; Save $w 'enemy_spider'
'listo'
