#!/bin/sh
# Drives install.sh and remove-statusline.sh against a throwaway config dir and a stub `claude`.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/cfg"
printf '#!/bin/sh\necho "claude $*" >> "%s/calls"\n' "$work" > "$work/bin/claude"
chmod +x "$work/bin/claude"
cp "$here/tests/settings.json" "$work/cfg/settings.json"
export CLAUDE_CONFIG_DIR="$work/cfg"

out=$(PATH="$work/bin:$PATH" sh "$here/install.sh")
grep -q 'plugin marketplace add dip497/claude-statusband' "$work/calls"
grep -q 'plugin install statusband@statusband' "$work/calls"
echo "$out" | grep -q 'remove-statusline.sh'

sh "$here/remove-statusline.sh"
! grep -q statusLine "$work/cfg/settings.json"
grep -q '"model"' "$work/cfg/settings.json"
grep -q 'git status' "$work/cfg/settings.json"
grep -q statusLine "$work"/cfg/settings.json.bak-*

sh "$here/remove-statusline.sh" | grep -q 'nothing to remove'
echo "scripts ok"
