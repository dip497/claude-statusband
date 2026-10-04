#!/bin/sh
# Removes the "statusLine" entry from Claude Code's user settings, keeping a backup.
# macOS and Linux; Windows uses remove-statusline.ps1.
set -eu
# settings can hold tokens: nothing written here is readable by other users
umask 077

settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

if [ ! -f "$settings" ] || ! grep -q '"statusLine"' "$settings"; then
  echo "No custom status line in $settings; nothing to remove."
  exit 0
fi

backup="$settings.bak-$(date +%Y%m%d%H%M%S)"
cp -p "$settings" "$backup"
tmp="$settings.tmp-$$"

if command -v jq >/dev/null 2>&1; then
  jq 'del(.statusLine)' "$backup" > "$tmp"
elif command -v python3 >/dev/null 2>&1; then
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d.pop("statusLine",None); json.dump(d,open(sys.argv[2],"w"),indent=2); open(sys.argv[2],"a").write("\n")' "$backup" "$tmp"
elif command -v node >/dev/null 2>&1; then
  node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));delete d.statusLine;fs.writeFileSync(process.argv[2],JSON.stringify(d,null,2)+"\n")' "$backup" "$tmp"
else
  rm -f "$backup"
  echo "Need jq, python3 or node to edit $settings. Or delete the \"statusLine\" block from it by hand." >&2
  exit 1
fi

# written through the existing file, so it keeps its own permissions
cat "$tmp" > "$settings"
rm -f "$tmp"
echo "Removed the status line from $settings."
echo "The previous file is kept at $backup."
