# claude-statusline

A custom [Claude Code](https://claude.com/claude-code) status line: project, model, a 20-cell context-usage bar scaled to a 100k-token "smart zone", and an optional caveman-level badge.

```
📁 important │ Opus 4.7 (1M) │ 0% ▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱ 15% out of 100k │ 🦴 full
```

## Install

Requires Node.js on PATH. Point Claude Code at the script via `~/.claude/settings.json` (Windows: `C:\Users\<you>\.claude\settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node C:/path/to/claude-statusline/statusline.js"
  }
}
```

Restart Claude Code (or start a new session).

## Caveman badge

If the [caveman](https://github.com/juliusbrussee/caveman) plugin is installed, its hooks record the active intensity level in `~/.claude/.caveman-active` (or `$CLAUDE_CONFIG_DIR/.caveman-active`). The status line reads that file and shows the level, which is otherwise invisible, at the end of the line:

```
🦴 full              the plugin's default level
🦴 ultra             every level names itself, verbatim and lowercase
🦴 wenyan-ultra
(no badge)           the flag file is absent — caveman is not in use
```

The level is always named, including the default. The plugin's own badge script prints a bare `[CAVEMAN]` for `full` and suffixes only the other levels; this status line deliberately diverges, because an unlabelled badge can't be told from "some level, unnamed" — the exact blind spot the badge exists to close. Levels are rendered lowercase, matching how the plugin writes them, so a badge can be pasted straight back into `/caveman <level>`.

Nothing to configure, and nothing to install: without the plugin the file never exists and the badge never appears. The file is trusted only to hold one known level name (`CAVEMAN_LEVELS` in `statusline.js`); anything else, a symlink, or an oversized file is ignored rather than printed.

## Configure

Edit the constants at the top of `statusline.js` — `SMART_ZONE`, bar width, color thresholds, icon, separator, `CAVEMAN_ICON`, `CAVEMAN_LEVELS`. Design rationale (why the bar is scaled to a fixed zone, why colors are positional) lives in [CLAUDE.md](./CLAUDE.md).

## Preview locally

Render every interesting tier at once — green / yellow / red, full, and overflow past the smart zone, plus the badge states. Badge rows are driven by throwaway fixture config dirs, not by the caveman level live on this machine, so both badge and no-badge always render:

```
node ./preview.js
```

Or pipe a single ad-hoc payload:

```powershell
'{"model":{"display_name":"Opus 4.7 (1M context)"},"context_window":{"used_percentage":60}}' | node ./statusline.js
```
