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
const PERCENT_DIGITS = 3;
const RATE_LIMIT_DIGITS = 2;
const COUNT_DIGITS = 2;
const COST_DIGITS = 5;
const PROJECT_ICON = '📁';
const SEPARATOR = ' │ ';
const REFLECT_ICON = '🧠';
const REFLECT_QUEUE_MAX_BYTES = 1_048_576;
const REPORT_ICON = '📋';
const REPORT_DONE_ICON = '✅';
const REPORT_MISSING_ICON = '✕';
const REPORT_MAX_BYTES = 262_144;
const COST_PROJECT_ICON = '📁';
const COST_TRANSCRIPT_MAX_BYTES = 268_435_456;
const COST_CACHE_FILE = 'statusline-cost-cache.json';
const COST_CACHE_MAX_BYTES = 8_388_608;

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

const configDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

const readCavemanLevel = () => {
  try {
    const flagPath = path.join(configDir(), '.caveman-active');
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

const padCount = (value) => String(value).padStart(COUNT_DIGITS);

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
  return count === null ? null : REFLECT_ICON + padCount(count);
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
  if (!root) return REPORT_ICON + padCount('-');
  const count = readFollowUpCount(root);
  if (count === null) return null;
  if (count === undefined) return REPORT_ICON + padCount(linesChanged > 0 ? REPORT_MISSING_ICON : '-');
  return REPORT_ICON + (count > 0 ? padCount(count) : REPORT_DONE_ICON);
};

const perMillion = (input, output, write5m, write1h, read) => ({
  input: input / 1e6, output: output / 1e6, write5m: write5m / 1e6, write1h: write1h / 1e6, read: read / 1e6,
});

const FABLE_5_1 = perMillion(10, 50, 12.5, 20, 0.25);
const FABLE_5 = perMillion(10, 50, 12.5, 20, 1);
const OPUS_5_5 = perMillion(4, 20, 5, 8, 0.2);
const OPUS_CURRENT = perMillion(5, 25, 6.25, 10, 0.5);
const OPUS_LEGACY = perMillion(15, 75, 18.75, 30, 1.5);
const SONNET_5_5 = perMillion(2, 10, 2.5, 4, 0.2);
const SONNET = perMillion(3, 15, 3.75, 6, 0.3);
const HAIKU_4_5 = perMillion(1, 5, 1.25, 2, 0.1);
const HAIKU_3_5 = perMillion(0.8, 4, 1, 1.6, 0.08);

const CLAUDE_RATES = {
  'claude-fable-5-1': FABLE_5_1,
  'claude-mythos-5-1': FABLE_5_1,
  'claude-fable-5': FABLE_5,
  'claude-mythos-5': FABLE_5,
  'claude-opus-5-5': OPUS_5_5,
  'claude-opus-5': OPUS_CURRENT,
  'claude-opus-4-8': OPUS_CURRENT,
  'claude-opus-4-7': OPUS_CURRENT,
  'claude-opus-4-6': OPUS_CURRENT,
  'claude-opus-4-5': OPUS_CURRENT,
  'claude-opus-4-5-20251101': OPUS_CURRENT,
  'claude-opus-4-1': OPUS_LEGACY,
  'claude-opus-4-1-20250805': OPUS_LEGACY,
  'claude-opus-4': OPUS_LEGACY,
  'claude-opus-4-20250514': OPUS_LEGACY,
  'claude-sonnet-5-5': SONNET_5_5,
  'claude-sonnet-5': SONNET,
  'claude-sonnet-4-6': SONNET,
  'claude-sonnet-4-5': SONNET,
  'claude-sonnet-4-5-20250929': SONNET,
  'claude-sonnet-4-20250514': SONNET,
  'claude-3-5-sonnet-20241022': SONNET,
  'claude-haiku-4-5': HAIKU_4_5,
  'claude-haiku-4-5-20251001': HAIKU_4_5,
  'claude-3-5-haiku-20241022': HAIKU_3_5,
};

const ratesFor = (model) => {
  const name = String(model).toLowerCase();
  if (CLAUDE_RATES[name]) return CLAUDE_RATES[name];
  if (name.includes('fable') || name.includes('mythos')) {
    return /\b(?:fable|mythos)[._ -]+5[._ -]+1(?:\b|[._ -])/.test(name) ? FABLE_5_1 : FABLE_5;
  }
  if (name.includes('haiku')) {
    return name.includes('haiku-3') || name.includes('-3-5-haiku') || name.includes('-3-haiku') ? HAIKU_3_5 : HAIKU_4_5;
  }
  if (name.includes('opus')) return /\bopus[._ -]+5[._ -]+5(?:\b|[._ -])/.test(name) ? OPUS_5_5 : OPUS_CURRENT;
  if (name.includes('sonnet')) return /\bsonnet[._ -]+5[._ -]+5(?:\b|[._ -])/.test(name) ? SONNET_5_5 : SONNET;
  return null;
};

const tokenCount = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

const tokenSum = (usage) => tokenCount(usage.input_tokens) + tokenCount(usage.output_tokens)
  + tokenCount(usage.cache_creation_input_tokens) + tokenCount(usage.cache_read_input_tokens);

const cacheWriteCost = (usage, rates) => {
  const split = usage.cache_creation || {};
  const oneHour = tokenCount(split.ephemeral_1h_input_tokens);
  const fiveMinExplicit = typeof split.ephemeral_5m_input_tokens === 'number' ? tokenCount(split.ephemeral_5m_input_tokens) : null;
  const total = Math.max(tokenCount(usage.cache_creation_input_tokens), oneHour + (fiveMinExplicit || 0));
  if (total <= 0) return 0;
  const fiveMin = fiveMinExplicit !== null ? fiveMinExplicit : Math.max(0, total - oneHour);
  return fiveMin * rates.write5m + oneHour * rates.write1h;
};

const usageCost = (usage, rates) => tokenCount(usage.input_tokens) * rates.input
  + tokenCount(usage.output_tokens) * rates.output
  + tokenCount(usage.cache_read_input_tokens) * rates.read
  + cacheWriteCost(usage, rates);

const localDayStart = (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

const localDayEnd = (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

const listTodayTranscripts = (projectsDir, sinceMs) => {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        let st;
        try {
          st = fs.statSync(full);
        } catch (e) {
          if (e.code === 'ENOENT') continue;
          throw e;
        }
        if (st.mtimeMs >= sinceMs) found.push({ path: full, size: st.size });
      }
    }
  };
  walk(projectsDir);
  return found;
};

const parseEntries = (text, fileKey, baseOffset, dayStart, dayEnd) => {
  const entries = [];
  let offset = baseOffset;
  for (const line of text.split('\n')) {
    const lineOffset = offset;
    offset += Buffer.byteLength(line) + 1;
    if (!line.includes('"usage"')) continue;
    let record;
    try { record = JSON.parse(line); } catch (_) { continue; }
    const message = record && record.message;
    if (!message || typeof message !== 'object' || !message.usage || typeof message.model !== 'string') continue;
    if (message.model === '<synthetic>' || record.isApiErrorMessage === true) continue;
    const t = tokenSum(message.usage);
    if (t <= 0) continue;
    const at = Date.parse(record.timestamp);
    if (!(at >= dayStart && at < dayEnd)) continue;
    const rates = ratesFor(message.model);
    entries.push({
      m: message.id ? String(message.id) : null,
      r: record.requestId ? String(record.requestId) : null,
      id: fileKey + ':' + lineOffset,
      t,
      c: rates ? usageCost(message.usage, rates) : 0,
      w: typeof record.cwd === 'string' ? record.cwd : '',
    });
  }
  return entries;
};

const dedupeEntries = (entries) => {
  const requestIds = new Map();
  for (const e of entries) {
    if (!e.m || !e.r) continue;
    if (!requestIds.has(e.m)) requestIds.set(e.m, new Set());
    requestIds.get(e.m).add(e.r);
  }
  const keyOf = (e) => {
    if (!e.m) return e.r ? 'no-msg:' + e.r : 'line:' + e.id;
    const known = requestIds.get(e.m);
    const r = e.r || (known && known.size === 1 ? known.values().next().value : 'no-req');
    return 'message:' + e.m + ':' + r;
  };
  const kept = new Map();
  for (const e of entries) {
    const key = keyOf(e);
    const prev = kept.get(key);
    if (!prev || e.t > prev.t) kept.set(key, e);
  }
  return [...kept.values()];
};

const normalizePath = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const isUnder = (cwd, root) => {
  const c = normalizePath(cwd);
  const r = normalizePath(root);
  return c === r || c.startsWith(r + '/');
};

const localDayKey = (now) => [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map((n) => String(n).padStart(2, '0')).join('-');

const isCachedEntry = (e, cwdCount) => e && typeof e === 'object'
  && (e.m === null || typeof e.m === 'string') && (e.r === null || typeof e.r === 'string')
  && Number.isInteger(e.o) && Number.isInteger(e.w) && e.w >= 0 && e.w < cwdCount
  && Number.isFinite(e.t) && Number.isFinite(e.c);

const isCachedFile = (f) => f && typeof f === 'object'
  && Number.isFinite(f.size) && Number.isFinite(f.offset) && f.offset >= 0
  && Array.isArray(f.cwds) && f.cwds.every((w) => typeof w === 'string')
  && Array.isArray(f.entries) && f.entries.every((e) => isCachedEntry(e, f.cwds.length));

const reduceByPair = (entries) => {
  const kept = new Map();
  for (const e of entries) {
    const key = e.m || e.r ? JSON.stringify([e.m, e.r]) : 'line:' + e.id;
    const prev = kept.get(key);
    if (!prev || e.t > prev.t) kept.set(key, e);
  }
  return [...kept.values()];
};

const packEntries = (entries) => {
  const cwds = [];
  const index = new Map();
  const packed = reduceByPair(entries).map((e) => {
    if (!index.has(e.w)) {
      index.set(e.w, cwds.length);
      cwds.push(e.w);
    }
    return { m: e.m, r: e.r, o: Number(e.id.slice(e.id.lastIndexOf(':') + 1)), t: e.t, c: e.c, w: index.get(e.w) };
  });
  return { cwds, entries: packed };
};

const unpackEntries = (filePath, cached) => cached.entries.map((e) => ({
  m: e.m, r: e.r, id: filePath + ':' + e.o, t: e.t, c: e.c, w: cached.cwds[e.w],
}));

const loadCostCache = (file, day) => {
  const empty = { day, files: {} };
  try {
    const text = readSafeFile(file, COST_CACHE_MAX_BYTES);
    if (text === null) return empty;
    const cache = JSON.parse(text);
    if (!cache || cache.day !== day || !cache.files || typeof cache.files !== 'object') return empty;
    return Object.values(cache.files).every(isCachedFile) ? cache : empty;
  } catch (_) {
    return empty;
  }
};

const saveCostCache = (file, cache) => {
  const tmp = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, file);
  } catch (_) {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
};

const readCompleteLines = (filePath, start, size) => {
  if (size - start > COST_TRANSCRIPT_MAX_BYTES) throw new Error('transcript chunk too large');
  const st = fs.lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile()) throw new Error('not a regular file');
  const buf = Buffer.alloc(Math.max(0, size - start));
  const fd = fs.openSync(filePath, 'r');
  let read;
  try {
    read = fs.readSync(fd, buf, 0, buf.length, start);
  } finally {
    fs.closeSync(fd);
  }
  const end = buf.lastIndexOf(0x0a, read - 1) + 1;
  return { text: buf.toString('utf8', 0, end), bytes: end };
};

const readTodayCost = (dir, projectDir, now) => {
  try {
    const dayStart = localDayStart(now);
    const dayEnd = localDayEnd(now);
    const projectsDir = path.join(dir, 'projects');
    let files = [];
    try {
      files = listTodayTranscripts(projectsDir, dayStart);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const day = localDayKey(now);
    const cacheFile = path.join(dir, COST_CACHE_FILE);
    const cache = loadCostCache(cacheFile, day);
    const nextFiles = {};
    const entries = [];
    let changed = Object.keys(cache.files).length !== files.length;
    for (const file of files) {
      const cached = cache.files[file.path];
      if (cached && cached.size === file.size) {
        nextFiles[file.path] = cached;
        entries.push(...unpackEntries(file.path, cached));
        continue;
      }
      const start = cached && file.size >= cached.offset ? cached.offset : 0;
      const kept = start > 0 ? unpackEntries(file.path, cached) : [];
      let chunk;
      try { chunk = readCompleteLines(file.path, start, file.size); } catch (_) { continue; }
      const fileEntries = kept.concat(parseEntries(chunk.text, file.path, start, dayStart, dayEnd));
      nextFiles[file.path] = { size: file.size, offset: start + chunk.bytes, ...packEntries(fileEntries) };
      entries.push(...fileEntries);
      changed = true;
    }
    if (changed) saveCostCache(cacheFile, { day, files: nextFiles });
    let total = 0;
    let project = projectDir ? 0 : null;
    for (const e of dedupeEntries(entries)) {
      total += e.c;
      if (projectDir && e.w && isUnder(e.w, projectDir)) project += e.c;
    }
    return { total, project };
  } catch (_) {
    return null;
  }
};

const slack = (text, digits) => ' '.repeat(Math.max(0, digits - text.length));

const costPart = (total, project) => {
  const totalText = total.toFixed(2);
  if (project === null) return '$' + totalText + slack(totalText, COST_DIGITS);
  const projectText = project.toFixed(2);
  return '$' + totalText + slack(totalText, COST_DIGITS) + slack(projectText, COST_DIGITS)
    + ' ' + COST_PROJECT_ICON + ' $' + projectText;
};

const padPercent = (value) => String(value).padStart(PERCENT_DIGITS) + '%';

const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(chunks.join('')); } catch (_) {}

  // --- Project name (basename of project dir or cwd) ---
  const projectPath = (data.workspace && (data.workspace.project_dir || data.workspace.current_dir))
                   || data.cwd || '';
  const projectName = projectPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop().trim();

  // --- Model display name ---
  const model = ((data.model && data.model.display_name) || '')
    .replace(/\s*context\b/i, '')
    .trim();

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
    if (pct == null) return paint(c.gray, '▱'.repeat(width) + ' ' + padPercent('-'));
    const p = Math.max(0, Math.min(100, pct));
    const filled = Math.round((p / 100) * width);
    let bar = '';
    for (let i = 0; i < width; i++) {
      bar += i < filled ? paint(cellColor(i, width), '▰') : paint(c.gray, '▱');
    }
    const labelColor = filled > 0 ? cellColor(filled - 1, width) : c.gray;
    return bar + ' ' + paint(labelColor, padPercent(Math.round(Math.max(0, pct))));
  };

  const rateLimitColor = (n) => n > RATE_LIMIT_RED_ABOVE ? c.red
                               : n > RATE_LIMIT_YELLOW_ABOVE ? c.yellow
                               : c.green;

  const rateLimitValue = (window) => (window && typeof window.used_percentage === 'number'
    ? String(Math.max(0, Math.ceil(window.used_percentage)))
    : '-');

  const rateLimitToken = (label, value) => (value === '-'
    ? label + '-%'
    : paint(rateLimitColor(Number(value)), label + value + '%'));

  const rateLimitPart = (rateLimits) => {
    const limits = rateLimits || {};
    const hour = rateLimitValue(limits.five_hour);
    const week = rateLimitValue(limits.seven_day);
    return rateLimitToken('h', hour) + slack(hour, RATE_LIMIT_DIGITS) + slack(week, RATE_LIMIT_DIGITS) + ' '
      + rateLimitToken('w', week);
  };

  const limits = rateLimitPart(data.rate_limits);
  const reflect = reflectBadge(data.transcript_path);
  const cost = data.cost || {};
  const report = reportBadge(
    findRepoRoot((data.workspace && data.workspace.current_dir) || data.cwd),
    (cost.total_lines_added || 0) + (cost.total_lines_removed || 0),
  );
  const badge = cavemanBadge();

  const todayCost = readTodayCost(configDir(), data.workspace && data.workspace.project_dir, new Date());
  const groups = [
    [model && paint(c.cyan, model), makeBar(barPct)],
    [todayCost && costPart(todayCost.total, todayCost.project)],
    [limits],
    [reflect, report, badge && paint(c.orange, badge)],
    [projectName && PROJECT_ICON + ' ' + projectName],
  ];
  const parts = groups
    .map((group) => group.filter(Boolean).join(' '))
    .filter(Boolean);

  const sep = paint(c.gray, SEPARATOR);
  process.stdout.write(parts.join(sep));
});
