# claude-statusline

A custom [Claude Code](https://claude.com/claude-code) status line: model, a 10-cell context-usage bar scaled to a 200k-token "smart zone", today's cost, 5-hour and weekly plan usage, claude-reflect and work report badges, an optional caveman-level badge, and the project name last.

```
Opus 4.7 (1M) │ ▰▰▱▱▱▱▱▱▱▱  15% │ $6.84 📁 $0.55 │ h 50% w 70% │ 🧠 3 │ 📋 2 │ 🦴 full │ 📁 important
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

## Plan usage

`h 50% w 70%` shows how much of the 5-hour (`h`) and weekly (`w`) plan limits you have used. Values round up, so any fraction past a whole number shows the next one. Each value is colored on its own: green up to 50%, yellow up to 90%, red above.

Claude Code sends these only for claude.ai subscriptions, and only after the first response of a session. A window Claude Code does not report - no subscription, before the first response, or right after a window expires - shows a dash, e.g. `h  -% w 71%`. Reset times and the gateway `spend_limit` are not shown.

## Cost

`$6.84 📁 $0.55` is what you have spent today: first across all projects, then for the current project. It follows the `$6.84 📁 $0.55` readout of the [Claude Code Usage](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage) VS Code extension, without the extension. Figures can differ slightly, see below.

- Source: Claude Code's own transcripts in `~/.claude/projects` (or `$CLAUDE_CONFIG_DIR/projects`). Only files changed since local midnight are read, and only their records from today count.
- Each response counts once, deduped by message and request id, like the extension.
- Price: tokens times the model's rate, from the Claude-only `CLAUDE_RATES` table in `statusline.js`. Unknown Claude models fall back to their family's rate. Other providers count as $0. Update the table when Anthropic changes prices.
- Project: sessions whose working directory is the project dir or inside it, so worktrees under the repo count.
- It is an estimate at API prices, not a bill. On a subscription it shows what the usage would cost at API rates.

No `project_dir` in the payload shows only the total. A failure hides the part.

To stay fast, it keeps how far each transcript was read in `~/.claude/statusline-cost-cache.json`, so each refresh parses only new lines. The cache resets at midnight and is safe to delete.

Known differences from the extension:

- Project match uses a path boundary: `/a/foo` does not also catch `/a/foobar`.
- Project root is Claude Code's `project_dir`; the extension uses the first VS Code workspace folder.
- A record without `cwd`, or a session that ran outside the project, counts only to the total. The extension also matches by transcript folder name.
- Duplicates are matched within today only. A response logged on both sides of midnight can count differently.
- On a tie between duplicate copies, the first file read wins; the extension picks by file time.
- Plan usage rounds up; the extension rounds to nearest, so it can show 1% less. The extension also polls the usage API, while the status line updates after each response.

Known limits:

- Every refresh lists every transcript ever written, so the scan grows with history (`cleanupPeriodDays` bounds it). An unreadable folder under `projects` hides the part.
- The first read of a large transcript loads it whole.
- A transcript rewritten in place is noticed only when it gets smaller.
- A refresh killed mid-write can leave a `statusline-cost-cache.json.<pid>.tmp` file. Safe to delete.

## Reflect and work report badges

`🧠 3` counts the learnings [claude-reflect](https://github.com/BayramAnnakov/claude-reflect) has queued for this project and waiting for `/reflect`. It shows `🧠 0` when the queue is empty and disappears only when Claude Code sends no transcript path.

`📋` tracks `WORK-REPORT.md` from the work-report skill, at the root of the current git repo:

```
📋 2      report exists, 2 open follow-ups
📋✅      report exists, no follow-ups
📋❌      no report, and this session changed code
📋 -      no report and nothing changed, or not in a git repo
```

Both files are only counted, never printed. A symlinked or oversized file hides its badge.

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

Edit the constants at the top of `statusline.js` — `SMART_ZONE`, `BAR_WIDTH`, `BAR_YELLOW_ABOVE`, `BAR_RED_ABOVE`, `RATE_LIMIT_YELLOW_ABOVE`, `RATE_LIMIT_RED_ABOVE`, `PERCENT_DIGITS`, `PROJECT_ICON`, `SEPARATOR`, `COST_PROJECT_ICON`, `REFLECT_ICON`, `REPORT_ICON`, `REPORT_DONE_ICON`, `REPORT_MISSING_ICON`, `CAVEMAN_ICON`, `CAVEMAN_LEVELS`. Design rationale (why the bar is scaled to a fixed zone, why colors are positional) lives in [CLAUDE.md](./CLAUDE.md).

## Preview locally

Render every interesting tier at once — green / yellow / red, full, and overflow past the smart zone, plus the badge states. Badge rows are driven by throwaway fixture config dirs, not by the caveman level live on this machine, so both badge and no-badge always render:

```
node ./preview.js
```

Or pipe a single ad-hoc payload:

```powershell
'{"model":{"display_name":"Opus 4.7 (1M context)"},"context_window":{"total_input_tokens":120000}}' | node ./statusline.js
```
