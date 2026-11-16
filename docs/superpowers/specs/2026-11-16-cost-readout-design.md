# Cost readout and plugin-matched plan usage - design

## Intent

Match the `growthjack.claude-code-usage` VS Code status bar in the terminal status line: today's cost across all projects next to today's cost for this project, plus the plan usage numbers the way the plugin counts them.

## Goals

- Show `$6.84 📁 $0.55`: today total, then today for the current project.
- Plan usage: keep the format and rounding up, rename `wk` to `w`.
- Stay dependency-free and fast enough to run on every render.

## Non-goals

- Polling `api.anthropic.com/api/oauth/usage`. The line refreshes when Claude Code calls the script after an API response, and stdin `rate_limits` stays the source.
- Monthly cost, Codex, LiteLLM price refresh, coloring the cost.

## Approaches

- **Scan today's transcripts with a per-file offset cache** - picked. No deps, each render parses only new lines.
- Scan without cache - rejected, slows down as the day's sessions grow.
- `ccusage` CLI - rejected, breaks the no-deps rule and costs about 1 s per call.

## Design

### Plan usage

- Label `w` instead of `wk`: `h3% w94%`, missing window `w-%`.
- Keep `Math.ceil`, so usage is never understated. The plugin uses `Math.round` (`quotaFormat.js`), so the two can differ by 1.
- Other gaps vs the plugin come from data age: the plugin polls the OAuth API, stdin updates per response.

### Cost

- Source: `$CLAUDE_CONFIG_DIR/projects/**/*.jsonl` (default `~/.claude/projects`), subagent files included. Only files with `mtime` since local midnight are opened.
- Counted record: has `message.usage` and `message.model`, `timestamp` within today (local time), model not `<synthetic>`, not `isApiErrorMessage`, token sum above 0.
- Dedup, same as the plugin (`claudeIncrementalIndex.js`), keep the record with the largest token sum per key:
  - `message.id` + `requestId`. Missing `requestId`: borrow it when that `message.id` has exactly one `requestId` seen, else `no-req`.
  - No `message.id`: key by `requestId`, else by file + line (never deduped).
- Price: tokens x rate for input, output, cache read and cache write.
- Cache write, same as the plugin's `cacheCreationCost`: total = max(`cache_creation_input_tokens`, `ephemeral_1h` + `ephemeral_5m`). 1h portion at the 1h rate, the rest at the 5m rate.
- Rate table: Claude models only, rates taken from the plugin's `pricing.js`. Unknown Claude ids fall back by family (fable, opus, sonnet, haiku). Non-Claude models are priced at 0.
- Project share: records whose `cwd` equals `workspace.project_dir` or sits under it. Worktrees under the repo count to the repo.
  - Path-boundary match on purpose: the plugin uses plain `startsWith`, so its `/a/foo` also catches `/a/foobar`. `📁` can read lower than the plugin in that case.
  - Workspace root differs from the plugin: Claude's `project_dir` vs VS Code's first workspace folder. Same when both open the repo root.
- Format: `$` + two decimals, `$6.84 📁 $0.55`. No `project_dir`: only `$6.84`.
- Position: own part before plan usage: `📁 demo │ Opus 5.5 │ ▰▰▱▱ 15% │ $6.84 📁 $0.55 │ h3% w94% │ ...`.

### Cache

- File: `$CLAUDE_CONFIG_DIR/statusline-cost-cache.json`.
- Holds the day key and, per transcript file: size, parsed byte offset, and its deduped entries (key, token sum, cost, cwd).
- Each render: parse bytes from the offset up to the last complete line. File shrank or replaced: parse it again from 0. New day: drop the cache.
- Write atomically (temp file + rename), since several sessions render at once.
- Read through `readSafeFile` with a size cap. Corrupt or oversized cache: rebuild it, never break the line.

### Failure

- Projects dir missing: `$0.00 📁 $0.00`.
- Any unexpected error: hide the cost part, the rest of the line renders.

## Left to the builder

- Constants at the top of `statusline.js` (cache cap, icon), plus README tunables list.
- `preview.js` fixtures a `projects/` dir inside each row's throwaway `CLAUDE_CONFIG_DIR`: rows with cost, with no project match, with no transcripts.
- README section and CLAUDE.md input contract and architecture notes.
