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

settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
if [ -f "$settings" ] && grep -q '"statusLine"' "$settings"; then
  cat <<NOTE

You also have a custom status line configured in $settings.
statusband does not replace it; both will show. To remove the old one:

  curl -fsSL https://raw.githubusercontent.com/dip497/claude-statusband/main/remove-statusline.sh | sh
NOTE
fi

echo
echo "statusband is installed. Restart Claude Code to see it."
