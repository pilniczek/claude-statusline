# Reflect and Work Report Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `🧠 N` (queued claude-reflect learnings) and a four-state `📋` work report badge to the status line.

**Architecture:** Two synchronous file readers in `statusline.js`, same hardening as `readCavemanLevel`. Each returns a count or `null`, and two small render functions turn that into plain-text badges placed before the caveman badge.

**Tech Stack:** Node.js, no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-reflect-and-report-badges-design.md`

## Global Constraints

- No dependencies, no build, no test suite. Verification is ad-hoc payloads into `node statusline.js` plus `node preview.js`.
- No code comments.
- Badges are plain text: no ANSI color, no bold.
- Constants at the top: `REFLECT_ICON = '🧠'`, `REPORT_ICON = '📋'`, `REPORT_DONE_ICON = '✅'`, `REPORT_MISSING_ICON = '❌'`, `REFLECT_QUEUE_MAX_BYTES = 1_048_576`, `REPORT_MAX_BYTES = 262_144`.
- Never print file content; only counts.
- Every read failure degrades to the hidden state, never a thrown error.

## Review Focus

- Queue file is a JSON object, not an array: `🧠` hidden.
- Report's `## Follow-ups` holds only `- none`: `📋✅`.
- Report has no `## Follow-ups` heading at all: `📋✅` (zero follow-ups found).
- `.git` is a file (worktree): counts as repo root.
- `cost` absent from payload: treated as nothing changed, so `📋 -`.

---

### Task 1: Badges

**Files:**
- Modify: `statusline.js`
- Modify: `preview.js`
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Produces: `readLearningsCount(transcriptPath) -> number | null`, `findRepoRoot(startDir) -> string | null`, `readFollowUpCount(root) -> number | null | undefined` (`undefined` = no report file, `null` = unreadable or refused), `reportBadge(root, linesChanged) -> string | null`.

- [ ] **Step 1: Baseline**

Make a fixture repo in the scratchpad: `fx/repo/.git/` (empty dir), `fx/session/t.jsonl`, `fx/session/learnings-queue.json` = `[{},{},{}]`. Pipe this payload into the script, with `transcript_path` set to `fx/session/t.jsonl`, `workspace.current_dir` set to `fx/repo` and `CLAUDE_CONFIG_DIR=/nonexistent`. Expected now: no `🧠` and no `📋`.

- [ ] **Step 2: Implement**

- `readLearningsCount`: path = `path.join(path.dirname(transcriptPath), 'learnings-queue.json')`. `ENOENT` gives `0`. A symlink, a non-file, size over the cap, invalid JSON or a non-array gives `null`. Otherwise the array length.
- `findRepoRoot`: loop `path.dirname` upward until the root, return the first dir where `fs.existsSync(path.join(dir, '.git'))`.
- `readFollowUpCount`: `ENOENT` gives `undefined`. Refusals (symlink, size) give `null`. Otherwise count lines matching `/^- \[/` between the line `## Follow-ups` and the next line starting with `## `.
- `reportBadge`:
  - count > 0 gives `📋 N`.
  - count 0 gives `📋✅`.
  - `undefined` with `linesChanged > 0` gives `📋❌`.
  - `undefined` without changes, or no root, gives `📋 -`.
  - `null` gives `null`.
- `linesChanged` = `(cost.total_lines_added || 0) + (cost.total_lines_removed || 0)`.
- Push the `🧠` badge, then the `📋` badge, after `limits` and before the caveman badge.

- [ ] **Step 3: Verify the states**

Using the Step 1 fixture, vary one thing at a time. Expected tails (before any caveman badge):

| Fixture change | Expected |
|---|---|
| none | `│ 🧠 3 │ 📋 -` |
| `cost.total_lines_added: 5` | `│ 🧠 3 │ 📋❌` |
| report with 2 `- [action]` lines under `## Follow-ups`, plus a `- [tried]` line under `## Abandoned` | `│ 🧠 3 │ 📋 2` |
| report with `- none` under `## Follow-ups` | `│ 🧠 3 │ 📋✅` |
| report with no `## Follow-ups` heading | `│ 🧠 3 │ 📋✅` |
| queue deleted | `│ 🧠 0 │` |
| queue = `{}` | no `🧠` |
| `.git` replaced by a file | same as `none` |
| `current_dir` outside any repo | `│ 📋 -` |
| no `transcript_path` | no `🧠` |
| report is a symlink | no `📋` |

- [ ] **Step 4: Preview rows**

In `preview.js`, give each scenario a throwaway session dir (queue fixture) and a repo dir (report fixture) under `fixtureRoot`. Add rows `reflect: 0`, `reflect: 3`, `report: 2`, `report: done`, `report: missing`, `report: n/a`. Existing rows must not pick up the real queue or the real repo, so every scenario gets fixture paths. Run `node preview.js`. Expected: each row shows its labelled state.

- [ ] **Step 5: Docs**

- README: add `🧠 3 │ 📋 2` to the example line, a section explaining both badges and their states, and the new constants in Configure.
- CLAUDE.md: add `transcript_path` and `cost.total_lines_{added,removed}` to the input contract. Add an architecture note that both badges read files, not stdin, with the same untrusted-file rules as the caveman badge, the four 📋 states, and that `preview.js` fixtures both.

- [ ] **Step 6: Commit**

```bash
git add statusline.js preview.js README.md CLAUDE.md
git commit -m "add reflect learnings and work report badges"
```
