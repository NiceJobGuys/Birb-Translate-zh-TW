[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Original,
    [Parameter(Mandatory)][string]$WorkDir
)
try { . 'D:\Code\Ai-Nexus\Artifacts\scripts\script-usage\script-usage.ps1' } catch {}
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $repo 'manifest.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $Original).Hash -ne $manifest.originalSha256) { throw '原檔版本不符' }
$work = [IO.Path]::GetFullPath($WorkDir)
if (Test-Path -LiteralPath $work) { throw '測試目錄已存在，請指定新的隔離目錄。' }
$game = Join-Path $work 'game'
$package = Join-Path $work 'package'
$null = New-Item -ItemType Directory -Path $game, $package
Copy-Item -LiteralPath $Original -Destination (Join-Path $game 'birb.exe')
foreach ($item in @('Install.ps1', 'manifest.json', 'src', 'translations')) {
    Copy-Item -LiteralPath (Join-Path $repo $item) -Destination $package -Recurse
}
$installer = Join-Path $package 'Install.ps1'
$target = Join-Path $game 'birb.exe'
& $installer -GameDir $game
$installed = (Get-FileHash -LiteralPath $target).Hash
if ($installed -eq $manifest.originalSha256) { throw '安裝未生效' }
& $installer -GameDir $game
if ((Get-FileHash -LiteralPath $target).Hash -ne $installed) { throw '重複執行改變檔案' }
& $installer -GameDir $game -Restore
if ((Get-FileHash -LiteralPath $target).Hash -ne $manifest.originalSha256) { throw '還原失敗' }
[IO.File]::WriteAllText($target, 'unsupported-version')
$invalidHash = (Get-FileHash -LiteralPath $target).Hash
$rejected = $false
try { & $installer -GameDir $game } catch {
    if ($_.Exception.Message -notlike '*遊戲版本或檔案不同*') { throw }
    $rejected = $true
}
if (-not $rejected -or (Get-FileHash -LiteralPath $target).Hash -ne $invalidHash) { throw '版本保護失敗' }
Write-Output 'PASS：套用、重複套用、還原、不相容版本拒絕。'
