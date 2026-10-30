[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$GameDir,
    [switch]$Restore
)
try { . 'D:\Code\Ai-Nexus\Artifacts\scripts\script-usage\script-usage.ps1' } catch {}
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
$target = Join-Path ([IO.Path]::GetFullPath($GameDir)) 'birb.exe'
$backupDir = Join-Path $PSScriptRoot ('backups\' + $manifest.steamBuild)
$backup = Join-Path $backupDir 'birb.exe.original'
$receiptPath = Join-Path $backupDir 'installed.json'
function Get-Sha256([string]$File) { (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "找不到遊戲：$target" }
if (Get-Process -Name birb -ErrorAction SilentlyContinue) { throw '請先正常關閉 Birb；工具不會強制關閉遊戲。' }
$current = Get-Sha256 $target
$installedHash = $manifest.referencePatchedSha256
if (Test-Path -LiteralPath $receiptPath) {
    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ($receipt.originalSha256 -ne $manifest.originalSha256) { throw '安裝紀錄不相容。' }
    $installedHash = $receipt.patchedSha256
}
if ($current -notin @($manifest.originalSha256, $installedHash)) { throw "遊戲版本或檔案不同（需要 Steam Build $($manifest.steamBuild)），已停止，未覆寫。" }
if ($Restore) {
    if ($current -eq $manifest.originalSha256) { Write-Output '已是原版，無需還原。'; return }
    if (-not (Test-Path -LiteralPath $backup) -or (Get-Sha256 $backup) -ne $manifest.originalSha256) {
        throw '找不到通過驗證的原版備份，未覆寫。'
    }
    Copy-Item -LiteralPath $backup -Destination $target -Force
    if ((Get-Sha256 $target) -ne $manifest.originalSha256) { throw '還原後驗證失敗。' }
    Write-Output '已還原原版，SHA-256 驗證通過。'
    return
}
if ($current -eq $installedHash) { Write-Output '已安裝本版補丁，無需重複套用。'; return }
$node = Get-Command node -ErrorAction Stop
$nodeMajor = & $node.Source -p 'process.versions.node.split(".")[0]'
if ($LASTEXITCODE -ne 0 -or [int]$nodeMajor -lt 22) { throw '需要 Node.js 22 或更新版本。' }
if (Test-Path -LiteralPath $backup) {
    if ((Get-Sha256 $backup) -ne $manifest.originalSha256) { throw '既有備份不相容，未覆寫。' }
} else {
    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force
    Copy-Item -LiteralPath $target -Destination $backup
}
$output = Join-Path $PSScriptRoot 'Artifacts\build\birb.exe'
& $node.Source (Join-Path $PSScriptRoot 'src\patch.cjs') $backup $output
if ($LASTEXITCODE -ne 0) { throw '建置失敗，遊戲未變更。' }
$builtReceipt = Get-Content -LiteralPath ($output + '.receipt.json') -Raw | ConvertFrom-Json
if ($builtReceipt.originalSha256 -ne $manifest.originalSha256 -or (Get-Sha256 $output) -ne $builtReceipt.patchedSha256) {
    throw '建置產物驗證失敗，遊戲未變更。'
}
try {
    Copy-Item -LiteralPath $output -Destination $target -Force
    if ((Get-Sha256 $target) -ne $builtReceipt.patchedSha256) { throw '安裝後驗證失敗。' }
    Copy-Item -LiteralPath ($output + '.receipt.json') -Destination $receiptPath -Force
} catch {
    Copy-Item -LiteralPath $backup -Destination $target -Force
    throw
}
Write-Output '已套用 Birb 繁體中文補丁，SHA-256 驗證通過。'
