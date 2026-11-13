# Reflect and work report badges - design

## Intent

Surface two pieces of workflow state that are otherwise invisible until a hook nags:

- How many claude-reflect learnings are queued for this project, so `/reflect` gets run.
- Whether the work-report skill's `WORK-REPORT.md` exists and how many follow-ups it still holds.

## Goals

- `🧠 N` - queued learnings, shown even at 0.
- `📋` badge with four states: follow-up count, done, missing, not applicable.

## Non-goals

- Who wrote the report (header `session id` is ignored).
- Splitting follow-ups into `[question]` and `[action]`.
- Filtering learnings by `decay_days` - the plugin never drops them either.
- Text colors - both badges are plain text.

## Approaches

- **Synchronous reads in `statusline.js`** - picked. Same pattern as the caveman badge, two small files per render.
- Background cache file refreshed by a hook - rejected, extra moving part for no measurable gain.
- Running `git rev-parse` to find the repo root - rejected, spawns a process on every render; walking up for `.git` is enough.

## Design

### Learnings badge

- Queue file: `learnings-queue.json` in the directory of the payload's `transcript_path` (claude-reflect stores the queue per project, next to the transcripts).
- Render `🧠 N`, N = array length. Missing queue file renders `🧠 0`.
- Hidden when `transcript_path` is absent, or the file is unreadable, not a JSON array, a symlink, or over the size cap.

### Work report badge

- Repo root: walk up from `workspace.current_dir` (fallback `cwd`) to the first directory containing `.git` (directory or file, so worktrees count). No root = not in git.
- Report: `<root>/WORK-REPORT.md`.
- Follow-ups: lines starting with `- [` between `## Follow-ups` and the next `## ` heading.

| State | Render |
|---|---|
| Report, N > 0 follow-ups | `📋 N` |
| Report, 0 follow-ups | `📋✅` |
| No report, session changed code (`cost.total_lines_added + cost.total_lines_removed > 0`) | `📋❌` |
| No report, nothing changed; or not in git | `📋 -` |

- Report present but unreadable, a symlink or over the size cap: badge hidden.

### Shared

- Position: after the plan usage readout, before the caveman badge.
- Plain text, no color, no bold.
- Constants at the top: `REFLECT_ICON = '🧠'`, `REPORT_ICON = '📋'`, `REPORT_DONE_ICON = '✅'`, `REPORT_MISSING_ICON = '❌'`, plus a size cap per file.
- Both files are untrusted: only counts are printed, never their content. Any error degrades to the hidden state, never a broken line.

## Left to the builder

- Size cap values (the queue can hold 100+ entries; pick generously).
- `preview.js` rows for every state, using fixture dirs like the caveman badge.
- README section and CLAUDE.md input contract and architecture notes.
