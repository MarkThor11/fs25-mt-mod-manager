$base = 'C:\Users\Mark\Documents\My Games\FarmingSimulator2025'
$mods = "$base\mods"
$safe = "$base\mods_safe"
$onHold = "$base\mods_on_hold"
$corrupt = "$base\mods_corrupt"

if (!(Test-Path $corrupt)) { New-Item -ItemType Directory -Path $corrupt }

# 1. Quarantine Alliklepa
$culprit = Join-Path $onHold "Alliklepa"
if (Test-Path $culprit) {
    Write-Host "Quarantining $culprit..."
    Move-Item $culprit $corrupt -Force
}

# 2. Restore everything from safe
if (Test-Path $safe) {
    $safeFiles = Get-ChildItem $safe
    Write-Host "Restoring $($safeFiles.Count) mods from safe storage..."
    foreach ($f in $safeFiles) { Move-Item $f.FullName $mods -Force }
    Remove-Item $safe -Recurse -Force
}

# 3. Restore remaining from onHold
if (Test-Path $onHold) {
    $onHoldFiles = Get-ChildItem $onHold
    Write-Host "Restoring $($onHoldFiles.Count) mods from on_hold..."
    foreach ($f in $onHoldFiles) { Move-Item $f.FullName $mods -Force }
    Remove-Item $onHold -Recurse -Force
}

Write-Host "Restoration complete."
