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

$configDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
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
