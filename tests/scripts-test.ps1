# Drives install.ps1 and remove-statusline.ps1 against a throwaway config dir and a stub `claude`.
$ErrorActionPreference = 'Stop'
$here = Split-Path $PSScriptRoot -Parent
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("statusband-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path "$work/bin", "$work/cfg" | Out-Null

Set-Content "$work/bin/claude.cmd" "@echo claude %*>> `"$work\calls`""
Copy-Item "$here/tests/settings.json" "$work/cfg/settings.json"
$env:CLAUDE_CONFIG_DIR = "$work/cfg"
New-Item -ItemType Directory -Path "$work/cfg/plugins" | Out-Null
$known = "$work/cfg/plugins/known_marketplaces.json"
$seed = '{"other":{"source":{"source":"github","repo":"a/b"}},"statusband":{"source":{"source":"github","repo":"dip497/claude-statusband"}}}'
Set-Content $known $seed
$env:PATH = "$work/bin;$env:PATH"

$out = & "$here/install.ps1" 6>&1 | Out-String
$calls = Get-Content "$work/calls" -Raw
if ($calls -notmatch 'plugin marketplace add dip497/claude-statusband') { throw 'marketplace add was not called' }
if ($calls -notmatch 'plugin install statusband@statusband') { throw 'install was not called' }
if ($out -notmatch 'remove-statusline.ps1') { throw 'the old status line was not pointed out' }

$k = Get-Content $known -Raw | ConvertFrom-Json
if ($k.statusband.autoUpdate -ne $true) { throw 'auto-update was not turned on' }
if ($k.other.PSObject.Properties.Name -contains 'autoUpdate') { throw 'another marketplace was touched' }
if ($k.statusband.source.repo -ne 'dip497/claude-statusband') { throw 'the marketplace entry was damaged' }
Set-Content $known $seed
$env:STATUSBAND_AUTO_UPDATE = '0'
$out = & "$here/install.ps1" 6>&1 | Out-String
$env:STATUSBAND_AUTO_UPDATE = $null
if ($out -notmatch 'Auto-update is off') { throw 'declining auto-update was not honoured' }
if ((Get-Content $known -Raw) -match 'autoUpdate') { throw 'auto-update was set though declined' }

& "$here/remove-statusline.ps1"
$after = Get-Content "$work/cfg/settings.json" -Raw | ConvertFrom-Json
if ($after.PSObject.Properties.Name -contains 'statusLine') { throw 'statusLine is still there' }
if ($after.model -ne 'opus') { throw 'model was lost' }
if ($after.permissions.allow[0] -ne 'Bash(git status)') { throw 'permissions were lost' }
if (-not (Get-ChildItem "$work/cfg" -Filter 'settings.json.bak-*')) { throw 'no backup was kept' }

Write-Host 'scripts ok'
