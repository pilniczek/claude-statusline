# Rate limit readout - design

## Intent

Show 5-hour and weekly plan usage in the status line, so it stays visible without the VS Code extension. Goal is to stay informed at a glance, not to get alarms.

## Goals

- Show 5-hour and 7-day usage percentages next to the context bar.
- Color each value by how close it is to the limit.

## Non-goals

- Reset times (`resets_at`).
- `spend_limit` (gateway-only, dollar based).
- A second progress bar.

## Approaches

- **Plain colored text, one token per window** - picked. Short, matches the extension's readout, reuses the bar's colors.
- Mini bars per window - rejected, competes with the context bar and widens the line.
- Text plus reset countdown - rejected, noise the user did not ask for.

## Design

- Input: `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.used_percentage` (0-100, may be decimal).
- Format: `h50% wk70%` - `h` for the 5-hour window, `wk` for the week, one space between.
- Value rounded to a whole number. Color decided from the rounded value, so a shown `50%` is always green (builder call).
- Color per token, same ANSI colors as the context bar:
  - 0-50% green
  - over 50% up to 90% yellow
  - over 90% red
- Position: own part between context bar and caveman badge, separated by `│`:
  `📁 demo │ Opus 5.5 │ ▰▰▱▱▱▱▱▱▱▱ 15% │ h50% wk70% │ 🦴 ultra`
- Missing window: its token is hidden. Both missing (API-key billing, or before the first response): the whole part is hidden.
- Thresholds are constants at the top of `statusline.js`, like the other tunables.

## Left to the builder

- `preview.js` rows: both windows across green/yellow/red, only one window, none.
- README section and CLAUDE.md input contract line.
