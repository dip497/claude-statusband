# Removes the "statusLine" entry from Claude Code's user settings on Windows, keeping a backup.
$ErrorActionPreference = 'Stop'

$configDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$settings = Join-Path $configDir 'settings.json'

if (-not (Test-Path $settings) -or -not (Select-String -Path $settings -Pattern '"statusLine"' -Quiet)) {
    Write-Host "No custom status line in $settings; nothing to remove."
    exit 0
}

$backup = "$settings.bak-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item $settings $backup

$data = Get-Content $backup -Raw | ConvertFrom-Json
$data.PSObject.Properties.Remove('statusLine')
$json = $data | ConvertTo-Json -Depth 100
# No BOM: Windows PowerShell's UTF8 encoding writes one, and a JSON reader may refuse it.
[System.IO.File]::WriteAllText($settings, $json + "`n", (New-Object System.Text.UTF8Encoding $false))

Write-Host "Removed the status line from $settings."
Write-Host "The previous file is kept at $backup."
