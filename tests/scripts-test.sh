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
chmod 600 "$work/cfg/settings.json"
mkdir -p "$work/cfg/plugins"
known="$work/cfg/plugins/known_marketplaces.json"
seed='{"other":{"source":{"source":"github","repo":"a/b"}},"statusband":{"source":{"source":"github","repo":"dip497/claude-statusband"}}}'
echo "$seed" > "$known"
export CLAUDE_CONFIG_DIR="$work/cfg"

out=$(PATH="$work/bin:$PATH" sh "$here/install.sh")
grep -q 'plugin marketplace add dip497/claude-statusband' "$work/calls"
grep -q 'plugin install statusband@statusband' "$work/calls"
echo "$out" | grep -q 'remove-statusline.sh'

# auto-update is turned on for statusband alone, and not at all when declined
tr -d ' \n' < "$known" | grep -q '"repo":"dip497/claude-statusband"},"autoUpdate":true'
! tr -d ' \n' < "$known" | grep -q '"repo":"a/b"},"autoUpdate"'
echo "$seed" > "$known"
STATUSBAND_AUTO_UPDATE=0 PATH="$work/bin:$PATH" sh "$here/install.sh" | grep -q 'Auto-update is off'
! grep -q autoUpdate "$known"

sh "$here/remove-statusline.sh"
! grep -q statusLine "$work/cfg/settings.json"
grep -q '"model"' "$work/cfg/settings.json"
grep -q 'git status' "$work/cfg/settings.json"
grep -q statusLine "$work"/cfg/settings.json.bak-*
# a private settings file stays private, and so does its backup
for f in "$work"/cfg/settings.json*; do
  case $(ls -l "$f") in -rw-------*) ;; *) echo "$f is not private" >&2; exit 1 ;; esac
done

sh "$here/remove-statusline.sh" | grep -q 'nothing to remove'
echo "scripts ok"
