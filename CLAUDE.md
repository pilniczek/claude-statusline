# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file Claude Code `statusLine` script (`statusline.js`). No build, no dependencies, no tests, no `package.json`. Node.js runs the script directly; Claude Code invokes it on each interaction and pipes a JSON payload to stdin. The script writes a single ANSI-colored line to stdout.

## Running / previewing changes

There is no test suite. The canonical way to eyeball changes is `node ./preview.js` — it spawns `statusline.js` once per representative tier (green ≈ 15k, yellow ≈ 60k, red ≈ 95k, full 100k, overflow 250k) and prints them stacked so the bar/color logic and the overflow label are visible side by side. The child inherits the parent's stdout (and gets `FORCE_COLOR=1`) so the terminal always renders the ANSI colors — don't change that without checking how it affects color output when piped or captured.

For one-off payloads:

```powershell
'{"model":{"display_name":"Opus 4.7 (1M context)"},"context_window":{"used_percentage":60},"workspace":{"project_dir":"C:/tmp/demo"}}' | node ./statusline.js
```

To see it live in Claude Code, point `~/.claude/settings.json` → `statusLine.command` at this script and start a new session.

## Architecture notes

- **Input contract**: stdin JSON shape that matters — `model.display_name`, `context_window.{used_percentage,used_tokens,input_tokens,total_tokens,max_tokens}`, `workspace.{project_dir,current_dir}`, `cwd`. The script defensively handles any of these being absent.
- **`SMART_ZONE` (default 100_000 tokens) is decoupled from the model's real context window.** The bar shows usage scaled against this fixed zone, not against `total_tokens`. This is intentional: at 1M-context, 15% of the real window is already a lot of context — the bar is meant to track a "you should care" budget, not the technical max. Touching the bar math means understanding this.
- **Bar colors are positional, not value-based.** Cells 0–9 are always green, 10–15 yellow, 16–19 red — a full bar shows all three colors. The current-percentage label takes the color of the highest filled cell. Don't refactor `cellColor` into "color the whole bar by current pct" without confirming — that's a deliberate design choice from the README.
- **Token fallbacks** (`statusline.js:24-33`): prefer `used_tokens` → `input_tokens` → derive from `used_percentage * totalTokens`. `totalTokens` itself falls back to 1M if the model name matches `/1M/i`, else 200k. Preserve this chain when editing.
- All tunables (SMART_ZONE, bar width, color thresholds, icon, separator) are constants at the top of `statusline.js` — README documents them as the configuration surface.
