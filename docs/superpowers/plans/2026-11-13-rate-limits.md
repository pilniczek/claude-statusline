# Rate Limit Readout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show colored 5-hour and weekly usage (`h50% wk70%`) in the status line between the context bar and the caveman badge.

**Architecture:** One new part in `statusline.js`, built from `rate_limits` in the stdin payload. Each window renders as its own colored token. Missing windows drop out, and no windows means no part.

**Tech Stack:** Node.js, no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-rate-limits-design.md`

## Global Constraints

- No dependencies, no build, no test suite. Verification is ad-hoc payloads piped into `node statusline.js` plus `node preview.js`.
- No code comments (project owner's rule).
- Format exactly `h<N>% wk<N>%`, one space between tokens, no separator character.
- Colors: the existing `c.green`, `c.yellow`, `c.red` from `statusline.js`.
- Thresholds: green 0-50, yellow over 50 up to 90, red over 90. Compare the rounded value.
- Ignore `spend_limit` and `resets_at`.

## Review Focus

- `rate_limits` object present, but one window missing: only the other token shows.
- Window present, but `used_percentage` null or absent: treat the window as missing.
- Decimal at a boundary: `50.4` shows `50%` green, `90.5` shows `91%` red.
- Value over 100: shows the real number in red, no clamping.
- `rate_limits` absent (API-key billing): line is identical to today's output.

---

### Task 1: Rate limit part

**Files:**
- Modify: `statusline.js` (constants near the top, a new builder after `paint`, `parts` assembly)
- Modify: `preview.js` (`scenarios`, payload in `render`)
- Modify: `README.md` (example line, new "Plan usage" section, Configure list)
- Modify: `CLAUDE.md` (input contract, tunables list)

**Interfaces:**
- Produces: `RATE_LIMIT_YELLOW_ABOVE = 50`, `RATE_LIMIT_RED_ABOVE = 90` (top-level constants), and `rateLimitPart(rateLimits) -> string | null` inside the stdin `end` handler, where `c` and `paint` are in scope.

- [ ] **Step 1: Capture the failing behavior**

Run:
```bash
echo '{"model":{"display_name":"Opus 5.5"},"context_window":{"total_input_tokens":30000},"rate_limits":{"five_hour":{"used_percentage":50.4},"seven_day":{"used_percentage":90.5}}}' | CLAUDE_CONFIG_DIR=/nonexistent node statusline.js | sed 's/\x1b\[[0-9;]*m//g'; echo
```
Expected now: `Opus 5.5 │ ▰▰▱▱▱▱▱▱▱▱ 15%` (no readout).

- [ ] **Step 2: Implement**

Add the constants. Add `rateLimitPart`, which maps `[['h', rateLimits.five_hour], ['wk', rateLimits.seven_day]]` to tokens. A window counts only when its `used_percentage` is a number. Round the value, pick the color from the rounded value, and paint `label + n + '%'` bold in that color, same as the bar's label. Join the tokens with `' '`. Return `null` when the input is missing or no tokens remain. Push the part into `parts` after the bar and before the badge.

- [ ] **Step 3: Verify the payloads**

Run the Step 1 command. Expected: `Opus 5.5 │ ▰▰▱▱▱▱▱▱▱▱ 15% │ h50% wk91%`, with `h50%` green and `wk91%` red. Check the colors with the raw output (no `sed`).

Run each payload below with the same wrapper. Each line shows the `rate_limits` value, then the expected tail of the output:

| `rate_limits` value | Expected tail |
|---|---|
| `{"five_hour":{"used_percentage":12}}` | `│ h12%` |
| `{"seven_day":{"used_percentage":70}}` | `│ wk70%` (yellow) |
| `{"five_hour":{"used_percentage":null},"seven_day":{}}` | no readout part |
| `{"five_hour":{"used_percentage":120}}` | `│ h120%` (red) |
| key absent | unchanged: `Opus 5.5 │ ▰▰▱▱▱▱▱▱▱▱ 15%` |

- [ ] **Step 4: Preview rows**

In `preview.js`, add an optional `rate_limits` field to scenarios and pass it through in the payload when set. Add these rows:
- `limits: green` with h 20 / wk 35
- `limits: yellow` with h 60 / wk 75
- `limits: red` with h 95 / wk 100
- `limits: 5h only` with h 40

Rows without the field stay as they are. Run `node preview.js`. Expected: the new rows show the readout before any badge, colors match their labels, and the old rows are unchanged.

- [ ] **Step 5: Docs**

- README example line: add `│ h50% wk70%` before the badge.
- README: add a short "Plan usage" section covering what the tokens mean, the color bands, when the readout is hidden (no subscription, before the first response), and that `spend_limit` and reset times are not shown.
- README Configure list: add the two thresholds.
- CLAUDE.md input contract: add `rate_limits.{five_hour,seven_day}.used_percentage`.
- CLAUDE.md tunables line: add the two thresholds.
- Note in CLAUDE.md that the readout colors are value-based, unlike the bar's positional colors.

- [ ] **Step 6: Commit**

```bash
git add statusline.js preview.js README.md CLAUDE.md
git commit -m "add 5h and weekly plan usage readout"
```
