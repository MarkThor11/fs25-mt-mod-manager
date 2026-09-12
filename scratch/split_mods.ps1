$src = 'C:\Users\Mark\Documents\My Games\FarmingSimulator2025\mods'
$dest = 'C:\Users\Mark\Documents\My Games\FarmingSimulator2025\mods_on_hold'

if (!(Test-Path $dest)) {
    New-Item -ItemType Directory -Path $dest
}

$files = Get-ChildItem $src
$count = [Math]::Floor($files.Count / 2)

Write-Host "Found $($files.Count) mods. Moving $count to $dest..."

for ($i=0; $i -lt $count; $i++) {
    Move-Item $files[$i].FullName $dest
}

Write-Host "Done."
