# Installs statusband into Claude Code on Windows.
$ErrorActionPreference = 'Stop'

$source = if ($env:STATUSBAND_SOURCE) { $env:STATUSBAND_SOURCE } else { 'dip497/claude-statusband' }

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Error 'Claude Code is not on PATH. Install it first: https://code.claude.com/docs/en/setup'
}

# An already added marketplace is refreshed instead, so a re-run upgrades.
claude plugin marketplace add $source
if ($LASTEXITCODE -ne 0) {
    claude plugin marketplace update statusband
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
claude plugin install statusband@statusband
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# a no-op on a first install; on a re-run it is what brings the newer copy
claude plugin update statusband@statusband

$configDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }

# Claude Code leaves a third-party plugin on the copy it installed unless auto-update is on for
# its marketplace. This sets the same flag the /plugin toggle does. STATUSBAND_AUTO_UPDATE=0 skips it.
$known = Join-Path $configDir 'plugins/known_marketplaces.json'
$auto = $false
if ($env:STATUSBAND_AUTO_UPDATE -ne '0' -and (Test-Path $known)) {
    $data = Get-Content $known -Raw | ConvertFrom-Json
    if ($data.PSObject.Properties.Name -contains 'statusband') {
        $data.statusband | Add-Member -NotePropertyName autoUpdate -NotePropertyValue $true -Force
        # No BOM: Windows PowerShell's UTF8 encoding writes one, and a JSON reader may refuse it.
        [System.IO.File]::WriteAllText($known, ($data | ConvertTo-Json -Depth 100), (New-Object System.Text.UTF8Encoding $false))
        $auto = $true
    }
}

$settings = Join-Path $configDir 'settings.json'
if ((Test-Path $settings) -and (Select-String -Path $settings -Pattern '"statusLine"' -Quiet)) {
    Write-Host ''
    Write-Host "You also have a custom status line configured in $settings."
    Write-Host 'statusband does not replace it; both will show. To remove the old one:'
    Write-Host ''
    Write-Host '  irm https://raw.githubusercontent.com/dip497/claude-statusband/main/remove-statusline.ps1 | iex'
}

Write-Host ''
Write-Host 'statusband is installed. Restart Claude Code to see it.'
if ($auto) {
    Write-Host 'Auto-update is on: new versions arrive by themselves. Turn it off under /plugin > Marketplaces.'
} else {
    Write-Host 'Auto-update is off. Turn it on under /plugin > Marketplaces > statusband, or re-run this to update.'
}
