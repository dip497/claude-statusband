#!/bin/sh
# Installs statusband into Claude Code. macOS and Linux; Windows uses install.ps1.
set -eu

source="${STATUSBAND_SOURCE:-dip497/claude-statusband}"

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code is not on PATH. Install it first: https://code.claude.com/docs/en/setup" >&2
  exit 1
fi

# An already added marketplace is refreshed instead, so a re-run upgrades.
claude plugin marketplace add "$source" || claude plugin marketplace update statusband
claude plugin install statusband@statusband
# a no-op on a first install; on a re-run it is what brings the newer copy
claude plugin update statusband@statusband || true

config="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

# Claude Code leaves a third-party plugin on the copy it installed unless auto-update is on for
# its marketplace. This sets the same flag the /plugin toggle does. STATUSBAND_AUTO_UPDATE=0 skips it.
known="$config/plugins/known_marketplaces.json"
auto="off"
if [ "${STATUSBAND_AUTO_UPDATE:-1}" != "0" ] && [ -f "$known" ]; then
  tmp="$known.tmp-$$"
  if command -v jq >/dev/null 2>&1; then
    jq 'if .statusband then .statusband.autoUpdate = true else . end' "$known" > "$tmp" && auto="on"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d.get("statusband",{})["autoUpdate"]=True; json.dump(d,open(sys.argv[2],"w"),indent=2)' "$known" "$tmp" && auto="on"
  elif command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(d.statusband)d.statusband.autoUpdate=true;fs.writeFileSync(process.argv[2],JSON.stringify(d,null,2))' "$known" "$tmp" && auto="on"
  fi
  # written through the existing file, so it keeps its own permissions
  if [ "$auto" = "on" ]; then cat "$tmp" > "$known"; fi
  rm -f "$tmp"
fi

settings="$config/settings.json"
if [ -f "$settings" ] && grep -q '"statusLine"' "$settings"; then
  cat <<NOTE

You also have a custom status line configured in $settings.
statusband does not replace it; both will show. To remove the old one:

  curl -fsSL https://raw.githubusercontent.com/dip497/claude-statusband/main/remove-statusline.sh | sh
NOTE
fi

echo
echo "statusband is installed. Restart Claude Code to see it."
if [ "$auto" = "on" ]; then
  echo "Auto-update is on: new versions arrive by themselves. Turn it off under /plugin > Marketplaces."
else
  echo "Auto-update is off. Turn it on under /plugin > Marketplaces > statusband, or re-run this to update."
fi
