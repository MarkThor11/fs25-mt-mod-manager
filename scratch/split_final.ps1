$base = 'C:\Users\Mark\Documents\My Games\FarmingSimulator2025'
$mods = "$base\mods"
$onHold = "$base\mods_on_hold"
$safe = "$base\mods_safe"

# 1. Move currently 'safe' mods to the safe folder
$activeFiles = Get-ChildItem $mods
Write-Host "Moving $($activeFiles.Count) safe mods to $safe..."
foreach ($f in $activeFiles) { Move-Item $f.FullName $safe }

# 2. Move 'on_hold' suspects back to 'mods'
$suspects = Get-ChildItem $onHold
Write-Host "Moving $($suspects.Count) suspect mods back to $mods..."
foreach ($f in $suspects) { Move-Item $f.FullName $mods }

# 3. Split the suspect group in half again
$newSuspects = Get-ChildItem $mods
$count = 1
Write-Host "Splitting suspect group. Moving $count mod back to $onHold..."
for ($i=0; $i -lt $count; $i++) {
    Move-Item $newSuspects[$i].FullName $onHold
}

Write-Host "Done. Ready for the final test."
