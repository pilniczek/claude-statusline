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
- **The caveman badge is the one input that does not come from stdin.** `readCavemanLevel()` reads `$CLAUDE_CONFIG_DIR/.caveman-active` (default `~/.claude/`), a flag file owned by the [caveman](https://github.com/juliusbrussee/caveman) plugin's hooks. Treat it as untrusted: the value is whitelisted against `CAVEMAN_LEVELS` and never printed raw, symlinks and files over `CAVEMAN_FLAG_MAX_BYTES` are refused, and every failure path returns `null` so a missing or hostile flag degrades to "no badge" instead of a broken status line. The whitelist and cap mirror the plugin's own `readFlag` in `caveman-config.js`.
- **The badge always names the level, including the `full` default** — `🦴 full`, never a bare `🦴`. It sits last on the line, after the bar, so the bar keeps a fixed position whether or not caveman is active. This diverges from the plugin's own `caveman-statusline.sh`, which prints `[CAVEMAN]` for `full` and suffixes only other levels; the divergence is deliberate, since an unlabelled badge is indistinguishable from "some level, unnamed" and that is the blind spot the badge closes. Levels render verbatim and lowercase (matching the flag file and the `/caveman` argument) — no abbreviation of `wenyan-*`, and one-shot levels (`commit`/`review`/`compress`) show for their one turn rather than being resolved back through the plugin's `.caveman-active.prev`. `'off'` is whitelisted but unreachable in practice: every plugin deactivation path unlinks the flag instead of writing `off`.
- **Say *level*, not *mode*** — the flag holds one of `CAVEMAN_LEVELS`, and code, README, and comments all use "level" so the vocabulary can't drift apart again.
- All tunables (SMART_ZONE, bar width, color thresholds, icon, separator, CAVEMAN_ICON, CAVEMAN_LEVELS) are constants at the top of `statusline.js` — README documents them as the configuration surface.
- **`preview.js` fixtures the caveman flag.** Each scenario gets a throwaway `CLAUDE_CONFIG_DIR` under `os.tmpdir()` so badge and no-badge rows both render regardless of the level live on the machine. Don't let it fall back to inheriting the real config dir — that silently makes half the preview unreachable.
