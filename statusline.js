#!/usr/bin/env node
// Claude Code statusLine script
// Reads JSON from stdin and prints a single-line status

const fs = require('fs');
const os = require('os');
const path = require('path');

// Bar scale: SMART_ZONE = 100%, regardless of model's actual window.
const SMART_ZONE = 200_000;
const BAR_WIDTH = 10;
const BAR_YELLOW_ABOVE = 50;
const BAR_RED_ABOVE = 80;
const RATE_LIMIT_YELLOW_ABOVE = 50;
const RATE_LIMIT_RED_ABOVE = 90;
const PROJECT_ICON = '📁';
const SEPARATOR = ' │ ';
const REFLECT_ICON = '🧠';
const REFLECT_QUEUE_MAX_BYTES = 1_048_576;
const REPORT_ICON = '📋';
const REPORT_DONE_ICON = '✅';
const REPORT_MISSING_ICON = '❌';
const REPORT_MAX_BYTES = 262_144;

// --- Caveman badge ---
// The caveman plugin (github.com/juliusbrussee/caveman) keeps the active
// intensity level in a flag file written by its hooks. It is the only way to
// see which level is live, so the status line surfaces it.
// Whitelist + size cap mirror the plugin's own readFlag: the file is trusted
// only to contain one of these names, never printed raw.
// 'off' is in the plugin's VALID_MODES but no plugin code path writes it —
// deactivation unlinks the flag instead. Accepted anyway so this list stays a
// faithful mirror, and so a hand-written or future 'off' renders honestly
// rather than falling through to "no badge" and looking like caveman is absent.
const CAVEMAN_LEVELS = [
  'off', 'lite', 'full', 'ultra',
  'wenyan-lite', 'wenyan', 'wenyan-full', 'wenyan-ultra',
  'commit', 'review', 'compress',
];
const CAVEMAN_FLAG_MAX_BYTES = 64;
const CAVEMAN_ICON = '🦴';

const readCavemanLevel = () => {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const flagPath = path.join(configDir, '.caveman-active');
    const st = fs.lstatSync(flagPath);
    // A symlink here could point anywhere; refuse it rather than read it.
    if (st.isSymbolicLink() || !st.isFile() || st.size > CAVEMAN_FLAG_MAX_BYTES) return null;
    const level = fs.readFileSync(flagPath, 'utf8').trim().toLowerCase();
    return CAVEMAN_LEVELS.includes(level) ? level : null;
  } catch (_) {
    // Missing flag = caveman not in use. Never let this break the status line.
    return null;
  }
};

// The level always names itself, including the plugin's 'full' default: an
// unlabelled badge can't be told from "some level, unnamed", which is the very
// blind spot this badge exists to close. Lowercase matches the flag file and
// the /caveman argument, so the badge is copy-pasteable.
const cavemanBadge = () => {
  const level = readCavemanLevel();
  return level === null ? null : CAVEMAN_ICON + ' ' + level;
};

const readSafeFile = (filePath, maxBytes) => {
  const st = fs.lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile() || st.size > maxBytes) return null;
  return fs.readFileSync(filePath, 'utf8');
};

const readLearningsCount = (transcriptPath) => {
  if (!transcriptPath) return null;
  try {
    const text = readSafeFile(path.join(path.dirname(transcriptPath), 'learnings-queue.json'), REFLECT_QUEUE_MAX_BYTES);
    if (text === null) return null;
    const queue = JSON.parse(text);
    return Array.isArray(queue) ? queue.length : null;
  } catch (e) {
    return e.code === 'ENOENT' ? 0 : null;
  }
};

const reflectBadge = (transcriptPath) => {
  const count = readLearningsCount(transcriptPath);
  return count === null ? null : REFLECT_ICON + ' ' + count;
};

const findRepoRoot = (startDir) => {
  if (!startDir) return null;
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

const countFollowUps = (text) => {
  let inSection = false;
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) inSection = line.trim() === '## Follow-ups';
    else if (inSection && line.startsWith('- [')) count++;
  }
  return count;
};

const readFollowUpCount = (root) => {
  try {
    const text = readSafeFile(path.join(root, 'WORK-REPORT.md'), REPORT_MAX_BYTES);
    return text === null ? null : countFollowUps(text);
  } catch (e) {
    return e.code === 'ENOENT' ? undefined : null;
  }
};

const reportBadge = (root, linesChanged) => {
  if (!root) return REPORT_ICON + ' -';
  const count = readFollowUpCount(root);
  if (count === null) return null;
  if (count === undefined) return REPORT_ICON + (linesChanged > 0 ? REPORT_MISSING_ICON : ' -');
  return count > 0 ? REPORT_ICON + ' ' + count : REPORT_ICON + REPORT_DONE_ICON;
};

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
  const usage = cw.current_usage;
  const usedTokens = cw.total_input_tokens != null ? cw.total_input_tokens
                   : usage ? (usage.input_tokens || 0)
                           + (usage.cache_creation_input_tokens || 0)
                           + (usage.cache_read_input_tokens || 0)
                   : null;

  const barPct = usedTokens != null ? (usedTokens / SMART_ZONE) * 100 : null;

  const c = {
    reset: '\x1b[0m',
    red:   '\x1b[31m',
    green: '\x1b[32m',
    yellow:'\x1b[33m',
    cyan:  '\x1b[36m',
    // Same orange the caveman plugin's own badge script uses, so both read as
    // one feature rather than two unrelated indicators.
    orange:'\x1b[38;5;172m',
    gray:  '\x1b[90m',
  };
  const paint = (color, s) => color + s + c.reset;

  const cellColor = (i, width) => {
    const cellPct = ((i + 1) / width) * 100;
    if (cellPct > BAR_RED_ABOVE) return c.red;
    if (cellPct > BAR_YELLOW_ABOVE) return c.yellow;
    return c.green;
  };

  const makeBar = (pct, width = BAR_WIDTH) => {
    const p = Math.max(0, Math.min(100, pct));
    const filled = Math.round((p / 100) * width);
    let bar = '';
    for (let i = 0; i < width; i++) {
      bar += i < filled ? paint(cellColor(i, width), '▰') : paint(c.gray, '▱');
    }
    const labelColor = filled > 0 ? cellColor(filled - 1, width) : c.gray;
    return bar + ' ' + paint(labelColor, Math.round(Math.max(0, pct)) + '%');
  };

  const rateLimitColor = (n) => n > RATE_LIMIT_RED_ABOVE ? c.red
                               : n > RATE_LIMIT_YELLOW_ABOVE ? c.yellow
                               : c.green;

  const rateLimitToken = (label, window) => {
    if (!window || typeof window.used_percentage !== 'number') return label + '-';
    const n = Math.max(0, Math.round(window.used_percentage));
    return paint(rateLimitColor(n), label + n + '%');
  };

  const rateLimitPart = (rateLimits) => {
    const limits = rateLimits || {};
    return rateLimitToken('h', limits.five_hour) + ' ' + rateLimitToken('wk', limits.seven_day);
  };

  const limits = rateLimitPart(data.rate_limits);
  const reflect = reflectBadge(data.transcript_path);
  const cost = data.cost || {};
  const report = reportBadge(
    findRepoRoot((data.workspace && data.workspace.current_dir) || data.cwd),
    (cost.total_lines_added || 0) + (cost.total_lines_removed || 0),
  );
  const badge = cavemanBadge();

  const parts = [];
  if (projectName) parts.push(PROJECT_ICON + ' ' + projectName);
  if (model) parts.push(paint(c.cyan, model));
  if (barPct != null) parts.push(makeBar(barPct));
  parts.push(limits);
  if (reflect) parts.push(reflect);
  if (report) parts.push(report);
  // Badge last: the bar is the thing being watched continuously, so it keeps
  // its position whether or not caveman is active.
  if (badge) parts.push(paint(c.orange, badge));

  const sep = paint(c.gray, SEPARATOR);
  process.stdout.write(parts.join(sep));
});
