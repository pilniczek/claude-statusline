# claude-statusline

A custom [Claude Code](https://claude.com/claude-code) status line: project, model, and a 20-cell context-usage bar scaled to a 100k-token "smart zone".

```
📁 important │ Opus 4.7 (1M) │ 0% ▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱ 15% out of 100k
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

## Configure

Edit the constants at the top of `statusline.js` — `SMART_ZONE`, bar width, color thresholds, icon, separator. Design rationale (why the bar is scaled to a fixed zone, why colors are positional) lives in [CLAUDE.md](./CLAUDE.md).

## Preview locally

Render every interesting tier at once — green / yellow / red, full, and overflow past the smart zone:

```
node ./preview.js
```

Or pipe a single ad-hoc payload:

```powershell
'{"model":{"display_name":"Opus 4.7 (1M context)"},"context_window":{"used_percentage":60}}' | node ./statusline.js
```
