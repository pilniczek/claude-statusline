# Cost Readout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show today's cost across all projects and for the current project (`$6.84 📁 $0.55`) before plan usage, and rename the weekly label `wk` to `w`.

**Architecture:** All code stays in `statusline.js` (single-file script by design). A scanner walks `$CLAUDE_CONFIG_DIR/projects/**/*.jsonl` modified since local midnight, prices today's assistant records with a Claude rate table, dedupes like the `growthjack.claude-code-usage` plugin, and splits the sum by project. A per-file byte-offset cache in `$CLAUDE_CONFIG_DIR` keeps each render to the new lines only.

**Tech Stack:** Node.js built-ins only (`fs`, `os`, `path`).

**Spec:** `docs/superpowers/specs/2026-11-16-cost-readout-design.md`

## Global Constraints

- No dependencies, no build, no test suite. Verification = `node ./preview.js` plus ad-hoc payloads piped into `node ./statusline.js`.
- No code comments (owner's rule overrides the file's existing comment style). Leave existing comments alone unless the code they describe changes.
- Docs: no em dash, use `-`. No real paths, names or IPs in README.
- Plan usage keeps `Math.ceil`. Only the label changes: `h3% w94%`, missing window `w-%`.
- Cost format: `$` + `toFixed(2)`, total then `📁` then project: `$6.84 📁 $0.55`. No `project_dir`: `$6.84` only. Uncolored.
- Cost part position: after the context bar, before plan usage.
- Config dir: `process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')`, same as the caveman flag.
- Any cost failure hides the cost part only; the rest of the line renders.
- Rates (USD per 1M tokens: input / output / 5m cache write / 1h cache write / cache read), copied from the plugin's `pricing.js`:
  - `claude-fable-5-1`, `claude-mythos-5-1`: 10 / 50 / 12.5 / 20 / 0.25
  - `claude-fable-5`, `claude-mythos-5`: 10 / 50 / 12.5 / 20 / 1
  - `claude-opus-5-5`: 4 / 20 / 5 / 8 / 0.2
  - `claude-opus-5`, `claude-opus-4-8`, `-4-7`, `-4-6`, `-4-5`: 5 / 25 / 6.25 / 10 / 0.5
  - `claude-opus-4-1`, `claude-opus-4` (incl. dated ids): 15 / 75 / 18.75 / 30 / 1.5
  - `claude-sonnet-5-5`: 2 / 10 / 2.5 / 4 / 0.2
  - other sonnet (`claude-sonnet-5`, `-4-6`, `-4-5`, `-4`, `claude-3-5-sonnet`): 3 / 15 / 3.75 / 6 / 0.3
  - `claude-haiku-4-5`: 1 / 5 / 1.25 / 2 / 0.1
  - `claude-3-5-haiku`: 0.8 / 4 / 1 / 1.6 / 0.08
  - Family fallback for unknown ids: fable/mythos -> Fable 5 (5-1 pattern -> Fable 5.1), opus -> current Opus (5-5 pattern -> Opus 5.5), sonnet -> Sonnet (5-5 pattern -> Sonnet 5.5), haiku -> Haiku 4.5 (haiku-3 / 3-5-haiku -> Haiku 3.5). Anything else -> no rate, cost 0.

## Review Focus

- Windows-style `cwd` (`C:\tmp\demo\sub`) against `project_dir` `C:/tmp/demo`: must count to the project (slash + case normalized like the plugin).
- Sibling dir `C:/tmp/demo-other`: must count to total, not to project (path boundary).
- Session writing mid-line while the status line renders: a trailing partial line must not be parsed or skipped, only deferred to the next render.
- Record from yesterday inside a file modified today (session spanning midnight): excluded.
- Cache file corrupt, oversized, symlinked or from yesterday: rebuilt, line still renders the right sum.

---

### Task 1: Rename weekly label to `w`

**Files:**
- Modify: `statusline.js` (`rateLimitPart`)
- Modify: `README.md` (example line 6, `## Plan usage` section)
- Modify: `CLAUDE.md` (plan usage architecture note: `h50% wk70%`, `h-% / wk-%`)

**Interfaces:**
- Produces: nothing new.

- [ ] **Step 1: Check current output**

Run: `node ./preview.js | grep 'limits: red'`
Expected: contains `wk100%`.

- [ ] **Step 2: Change `rateLimitToken('wk', ...)` to `rateLimitToken('w', ...)`. Update README and CLAUDE.md wording (`wk` -> `w`, "weekly (`w`)").**

- [ ] **Step 3: Verify**

Run: `node ./preview.js | grep -E 'limits: (red|5h only)'`
Expected: `w100%` on the red row, `w-%` on the 5h-only row, no `wk` anywhere (`node ./preview.js | grep -c wk` prints `0`).

- [ ] **Step 4: Commit** `rename weekly plan usage label to w`

---

### Task 2: Today's cost, scanned every render (no cache)

**Files:**
- Modify: `statusline.js`
- Modify: `preview.js`
- Modify: `README.md` (new `## Cost` section after `## Plan usage`, tunables list in `## Configure`, example line)
- Modify: `CLAUDE.md` (input contract: `workspace.project_dir` used for cost; architecture note on the cost scan, rate table, dedupe and path-boundary divergence from the plugin; add `COST_PROJECT_ICON` to tunables list)

**Interfaces:**
- Consumes: `readSafeFile(filePath, maxBytes)` (existing).
- Produces (later tasks rely on these names):
  - `configDir(): string` - extracted from `readCavemanLevel`, which now calls it.
  - `CLAUDE_RATES` - table above, per-token rates `{ input, output, write5m, write1h, read }`.
  - `ratesFor(model: string): Rates | null`
  - `usageCost(usage: object, rates: Rates): number`
  - `localDayStart(now: Date): number` - ms of local midnight.
  - `listTodayTranscripts(projectsDir: string, sinceMs: number): Array<{ path: string, size: number }>` - recursive, skips symlinks, `.jsonl` only, `mtimeMs >= sinceMs`.
  - `parseEntries(text: string, fileKey: string, baseOffset: number, dayStart: number, dayEnd: number): Entry[]` with `Entry = { m: string|null, r: string|null, id: string, t: number, c: number, w: string }` (`m` message id, `r` request id, `id` = `fileKey:byteOffset` line identity, `t` token sum, `c` cost, `w` cwd).
  - `dedupeEntries(entries: Entry[]): Entry[]`
  - `isUnder(cwd: string, root: string): boolean`
  - `costPart(total: number, project: number|null): string`
  - `readTodayCost(dir: string, projectDir: string|undefined, now: Date): { total: number, project: number|null } | null`
  - Constant `COST_PROJECT_ICON = '📁'`.

- [ ] **Step 1: Add preview fixtures (the failing test)**

In `preview.js`, give `fixtureFor` a second argument `transcripts` (array or undefined); key the cache by level + scenario label when transcripts are present, and write them to `<dir>/projects/C--tmp-demo/s.jsonl` (one JSON per line). Today's timestamp = `new Date().toISOString()` at noon local; yesterday = noon local minus 24 h. Add rows (all `used_tokens: 30_000`, `caveman: null`), model `claude-opus-4-7` (5 / 25 / 6.25 / 10 / 0.5):

| Row label | Records |
|---|---|
| `cost: mixed` | A: `cwd 'C:\\tmp\\demo'`, id `a`, req `r1`, input 100000, output 20000 ($1.00). A dup: same id/req, output 10000. B: cwd `C:/elsewhere`, cache_read 2000000 ($1.00). C: yesterday, cwd `C:/tmp/demo`, input 1000000. D: cwd `C:/tmp/demo/sub`, id `d`, `cache_creation_input_tokens` 100000, `cache_creation: { ephemeral_1h_input_tokens: 100000, ephemeral_5m_input_tokens: 0 }` ($1.00). E: cwd `C:/tmp/demo-other`, input 200000 ($1.00). F: model `<synthetic>`, input 1000000. |
| `cost: no ids` | G: no `message.id`, req `r9`, cwd `C:/tmp/demo`, input 200000 ($1.00), twice. H: id `h`, no req, cwd `C:/tmp/demo`, input 200000 ($1.00), plus same id `h` with req `r5`, input 100000. |
| `cost: none` | no `projects` dir |

- [ ] **Step 2: Run to see it fail**

Run: `node ./preview.js | grep 'cost:'`
Expected: rows render with no `$` part.

- [ ] **Step 3: Implement the functions listed in Interfaces in `statusline.js`, and push `costPart(...)` into `parts` right after the bar.**

Approach notes:
- `parseEntries`: split on `\n`, track byte offset per line (`Buffer.byteLength(line) + 1`). Skip lines that do not contain `"usage"` before `JSON.parse`. Keep record when `message.usage` and `message.model` exist, model is not `<synthetic>`, `isApiErrorMessage` is not true, token sum (input + output + cache_creation + cache_read) > 0, and `Date.parse(timestamp)` is in `[dayStart, dayEnd)`. `w` = `cwd` string or `''`.
- `usageCost`: write total = `max(cache_creation_input_tokens, 1h + 5m)`; 5m portion = explicit `ephemeral_5m_input_tokens` if present, else `total - 1h`.
- `dedupeEntries` (plugin `claudeIncrementalIndex.js` rule):

```js
// key for an entry:
//   m set:   `message:${m}:${r || (requestIdsOf(m).size === 1 ? only(requestIdsOf(m)) : 'no-req')}`
//   m null:  r ? `no-msg:${r}` : `line:${id}`
// requestIdsOf(m) = set of non-empty r across all entries with that m
// per key keep the entry with the largest t
```

- `isUnder`: normalize both with `replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()`; true when equal or `cwd.startsWith(root + '/')`.
- `readTodayCost`: `dayEnd` = local midnight of the next calendar day (build with `new Date(y, m, d + 1)`, not +24 h, so DST days work). Read each listed file whole via `readSafeFile` (cap `COST_TRANSCRIPT_MAX_BYTES = 268_435_456`, over cap: skip the file). Missing `projects` dir: `{ total: 0, project: projectDir ? 0 : null }`. Wrap all in try/catch returning `null`.
- `costPart`: `'$' + total.toFixed(2)` + (project === null ? '' : ' ' + COST_PROJECT_ICON + ' $' + project.toFixed(2)).

- [ ] **Step 4: Verify preview**

Run: `node ./preview.js | grep 'cost:'`
Expected:
- `cost: mixed` contains `$4.00 📁 $2.00` (A + B + D + E total, A + D project).
- `cost: no ids` contains `$2.00 📁 $2.00` (G once, H with borrowed `r5` deduped to the larger one).
- `cost: none` contains `$0.00 📁 $0.00`.
- Other rows contain `$0.00 📁 $0.00`. Order on every row: bar, cost, `h`.

- [ ] **Step 5: Verify no `project_dir` and failure isolation**

Run: `echo '{"context_window":{"total_input_tokens":1}}' | CLAUDE_CONFIG_DIR=/nonexistent node ./statusline.js`
Expected: contains `$0.00` with no `📁 $`.

Run: `mkdir -p <scratch>/cfg/projects/x && printf 'not json\n{"usage"\n' > <scratch>/cfg/projects/x/s.jsonl && echo '{"workspace":{"project_dir":"/p"}}' | CLAUDE_CONFIG_DIR=<scratch>/cfg node ./statusline.js`
Expected: `$0.00 📁 $0.00`, no stack trace.

- [ ] **Step 6: Docs** - README `## Cost` (what both numbers mean, today = local midnight, Claude-only rates, path-boundary note, differences vs the plugin), tunables list, example line; CLAUDE.md notes per Files above.

- [ ] **Step 7: Commit** `add today's total and project cost`

---

### Task 3: Per-file offset cache

**Files:**
- Modify: `statusline.js` (`readTodayCost`)
- Modify: `CLAUDE.md` (cost note: cache file, its trust rules)
- Modify: `README.md` (`## Cost`: cache file location, safe to delete)

**Interfaces:**
- Consumes: everything Task 2 produces.
- Produces:
  - `COST_CACHE_FILE = 'statusline-cost-cache.json'`, `COST_CACHE_MAX_BYTES = 8_388_608`.
  - `loadCostCache(file: string, day: string): { day: string, files: { [path]: { size: number, offset: number, entries: Entry[] } } }` - returns an empty cache for wrong day, bad shape, symlink, oversize, or any error.
  - `saveCostCache(file: string, cache): void` - write `file + '.' + process.pid + '.tmp'`, then `fs.renameSync`; swallow errors.
  - `day` key = local `YYYY-MM-DD`.

- [ ] **Step 1: Write the cache check (the failing test)**

Script in the scratchpad, `cache-check.sh <repo>`, using a temp `CLAUDE_CONFIG_DIR` with one transcript holding record A from Task 2 (cwd `/p`) and payload `{"workspace":{"project_dir":"/p"}}`:
1. Run statusline: expect `$1.00 📁 $1.00`; expect `statusline-cost-cache.json` to exist with that file's `offset` = file size.
2. Append record E-like line (cwd `/q`, input 200000) without trailing newline; run: expect `$1.00 📁 $1.00` (partial line deferred).
3. Append `\n`; run: expect `$2.00 📁 $1.00`.
4. Truncate transcript to only record E (smaller than offset); run: expect `$1.00 📁 $0.00`.
5. Write `garbage` into the cache file; run: expect `$1.00 📁 $0.00`.
6. Replace cache with a symlink to `/etc/hostname`; run: expect `$1.00 📁 $0.00` and the symlink target untouched.
7. Write a valid cache with `"day":"2000-01-01"` and a fake $99 entry; run: expect `$1.00 📁 $0.00`.

- [ ] **Step 2: Run it to see it fail**

Run: `bash <scratch>/cache-check.sh .`
Expected: step 1 fails (no cache file).

- [ ] **Step 3: Implement**

`readTodayCost` loads the cache, and for each listed file: if cached and `size >= cached.offset`, read only bytes `[offset, size)` (`fs.openSync` + `fs.readSync`), else read from 0 and drop cached entries. Parse only up to the last `\n`; new `offset` = start + bytes through that `\n`. Drop cache entries for files not in today's list. Dedupe across all files' entries, sum, save cache. Validate loaded entries: `t` and `c` finite numbers, `id` string, else empty cache.

- [ ] **Step 4: Verify**

Run: `bash <scratch>/cache-check.sh . && node ./preview.js | grep 'cost:'`
Expected: all 7 checks pass; preview values same as Task 2 Step 4.

- [ ] **Step 5: Timing check**

Run: `time (echo '{"workspace":{"project_dir":"'"$PWD"'"}}' | node ./statusline.js)` twice against the real config dir.
Expected: second run is not slower than the first; report both times.

- [ ] **Step 6: Commit** `cache cost scan by file offset`
