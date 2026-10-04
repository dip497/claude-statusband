# statusband

A Claude Code mod that draws a two-row band above the prompt:

```
opus-5-5   ctx █░░░░░░░ 14%   cache 98% hit · 54m left
5h █████░░░ 64% resets 2h30m   7d █░░░░░░░ 14% resets 4d16h   main ⇡2 S:1 U:1 ?:3 +3 -1
```

- **Prompt cache**: how much of the last turn the cache served, and how long until it
  expires. Goes `cold` after `/model` or `/compact`, and says on resume whether the cache
  survived. A toast warns about five minutes before it lapses.
- **Context**: how full the window is.
- **Rate limits**: the 5-hour and weekly windows, with the time until each resets.
- **Git**: branch, commits ahead/behind, staged (`S:`), unstaged (`U:`) and untracked
  (`?:`) files, lines added and removed.

Bars turn yellow at 70% and red at 90%.

## Install

macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/dip497/claude-statusband/main/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/dip497/claude-statusband/main/install.ps1 | iex
```

Or without a script, the same on every platform, inside Claude Code:

```
/plugin install statusband --marketplace dip497/claude-statusband
```

Running the installer again upgrades. Restart Claude Code afterwards.

Mods are an early-access part of Claude Code and the API may change between releases.
This was written against Claude Code 2.1.289.

### Removing an old status line

statusband is a band above the prompt; it does not replace a custom status line
(`ccstatusline`, a `statusline.sh`, ...) set as `statusLine` in `~/.claude/settings.json`,
so both would show. The installer tells you when it finds one. To remove it:

```bash
curl -fsSL https://raw.githubusercontent.com/dip497/claude-statusband/main/remove-statusline.sh | sh
```

```powershell
irm https://raw.githubusercontent.com/dip497/claude-statusband/main/remove-statusline.ps1 | iex
```

It deletes only the `statusLine` entry and keeps the previous file beside it as
`settings.json.bak-<timestamp>`. On macOS and Linux it needs `jq`, `python3` or `node`.

### Uninstall

```bash
claude plugin uninstall statusband@statusband
claude plugin marketplace remove statusband
```

## How the cache countdown is worked out

Claude Code does not tell a mod the cache lifetime, so the band derives it from the
[documented defaults](https://code.claude.com/docs/en/prompt-caching): one hour on a
subscription inside its plan's usage, five minutes otherwise. A `promptCacheTtl` setting
or the `CLAUDE_CODE_PROMPT_CACHE_TTL` / `FORCE_PROMPT_CACHING_5M` variables are not seen,
so the countdown is wrong if you set them.

## Develop

```bash
claude --plugin-dir .        # load it from this folder
claude plugin validate .
claude plugin test .
sh tests/scripts-test.sh    # the install and removal scripts
```

## License

MIT
