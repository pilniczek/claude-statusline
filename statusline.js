#!/usr/bin/env node
// Claude Code statusLine script
// Reads JSON from stdin and prints a single-line status

const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(chunks.join('')); } catch (_) {}

  // --- Project name (basename of project dir or cwd) ---
  const projectPath = (data.workspace && (data.workspace.project_dir || data.workspace.current_dir))
                   || data.cwd || '';
  const projectName = projectPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop();

  // --- Model display name ---
  const model = ((data.model && data.model.display_name) || '')
    .replace(/\s*context\b/i, '');

  // --- Context usage ---
  const cw = data.context_window || {};
  const usedPct = cw.used_percentage != null ? cw.used_percentage : null;

  let usedTokens = cw.used_tokens != null ? cw.used_tokens
                 : cw.input_tokens != null ? cw.input_tokens
                 : null;
  const totalTokens = cw.total_tokens != null ? cw.total_tokens
                    : cw.max_tokens != null ? cw.max_tokens
                    : (/1M/i.test(model) ? 1_000_000 : 200_000);

  if (usedTokens == null && usedPct != null) {
    usedTokens = Math.round(totalTokens * usedPct / 100);
  }

  // Bar scale: SMART_ZONE = 100%, regardless of model's actual window.
  const SMART_ZONE = 100_000;
  const barPct = usedTokens != null ? (usedTokens / SMART_ZONE) * 100 : usedPct;

  const fmtTokens = (n) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return Math.round(n / 1_000) + 'k';
    return String(n);
  };

  const c = {
    reset: '\x1b[0m',
    bold:  '\x1b[1m',
    red:   '\x1b[31m',
    green: '\x1b[32m',
    yellow:'\x1b[33m',
    cyan:  '\x1b[36m',
    gray:  '\x1b[90m',
  };
  const paint = (color, s) => color + s + c.reset;

  // Bar zones (fixed by position, not by current fill level):
  //   0–50%   → green   (cells 0–9 of 20)
  //   50–80%  → yellow  (cells 10–15)
  //   80–100% → red     (cells 16–19)
  const cellColor = (i, width) => {
    const cellPct = ((i + 1) / width) * 100;
    if (cellPct > 80) return c.red;
    if (cellPct > 50) return c.yellow;
    return c.green;
  };

  const makeBar = (pct, width = 20) => {
    const p = Math.max(0, Math.min(100, pct));
    const filled = Math.round((p / 100) * width);
    let bar = '';
    for (let i = 0; i < width; i++) {
      bar += i < filled ? paint(cellColor(i, width), '▰') : paint(c.gray, '▱');
    }
    const labelColor = filled > 0 ? cellColor(filled - 1, width) : c.gray;
    return paint(c.gray, '0% ') + bar
         + ' ' + paint(c.bold + labelColor, Math.round(Math.max(0, pct)) + '%')
         + paint(c.gray, '/' + fmtTokens(SMART_ZONE));
  };

  const parts = [];
  if (projectName) parts.push(paint(c.bold, '📁 ' + projectName));
  if (model) parts.push(paint(c.cyan, model));
  if (barPct != null) parts.push(makeBar(barPct));

  const sep = paint(c.gray, ' │ ');
  process.stdout.write(parts.join(sep));
});
