# Drives install.ps1 and remove-statusline.ps1 against a throwaway config dir and a stub `claude`.
$ErrorActionPreference = 'Stop'
$here = Split-Path $PSScriptRoot -Parent
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("statusband-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path "$work/bin", "$work/cfg" | Out-Null

Set-Content "$work/bin/claude.cmd" "@echo claude %*>> `"$work\calls`""
Copy-Item "$here/tests/settings.json" "$work/cfg/settings.json"
$env:CLAUDE_CONFIG_DIR = "$work/cfg"
$env:PATH = "$work/bin;$env:PATH"

$out = & "$here/install.ps1" 6>&1 | Out-String
$calls = Get-Content "$work/calls" -Raw
if ($calls -notmatch 'plugin marketplace add dip497/claude-statusband') { throw 'marketplace add was not called' }
if ($calls -notmatch 'plugin install statusband@statusband') { throw 'install was not called' }
if ($out -notmatch 'remove-statusline.ps1') { throw 'the old status line was not pointed out' }

& "$here/remove-statusline.ps1"
$after = Get-Content "$work/cfg/settings.json" -Raw | ConvertFrom-Json
if ($after.PSObject.Properties.Name -contains 'statusLine') { throw 'statusLine is still there' }
if ($after.model -ne 'opus') { throw 'model was lost' }
if ($after.permissions.allow[0] -ne 'Bash(git status)') { throw 'permissions were lost' }
if (-not (Get-ChildItem "$work/cfg" -Filter 'settings.json.bak-*')) { throw 'no backup was kept' }

Write-Host 'scripts ok'
