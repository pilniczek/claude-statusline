#!/usr/bin/env node
// Render statusline.js across representative usage tiers.
// Each scenario spawns statusline.js with a fake payload on stdin.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, 'statusline.js');

// The caveman badge is the one input that doesn't come from stdin — the script
// reads $CLAUDE_CONFIG_DIR/.caveman-active. Left to inherit the environment,
// every row would show whatever level is live on this machine, and the states
// this preview exists to compare would be unreachable. So each scenario gets a
// throwaway config dir: `caveman: null` means no flag file at all (no badge).
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-preview-'));
const fixtureDirs = new Map();

const fixtureFor = (level, scn) => {
  const levelKey = level === null ? '_none' : level;
  const key = scn.transcripts ? levelKey + '-' + scn.label.replace(/[^a-z0-9]+/gi, '-') : levelKey;
  if (!fixtureDirs.has(key)) {
    const dir = path.join(fixtureRoot, key);
    fs.mkdirSync(dir);
    if (level !== null) fs.writeFileSync(path.join(dir, '.caveman-active'), level);
    if (scn.transcripts) {
      const projectDir = path.join(dir, 'projects', 'C--tmp-demo');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 's.jsonl'), scn.transcripts.map(r => JSON.stringify(r)).join('\n') + '\n');
    }
    fixtureDirs.set(key, dir);
  }
  return fixtureDirs.get(key);
};

const noon = new Date();
noon.setHours(12, 0, 0, 0);
const TODAY = noon.toISOString();
const YESTERDAY = new Date(noon.getTime() - 86_400_000).toISOString();

const usageRecord = ({ id, req, cwd, at = TODAY, model = 'claude-opus-4-7', ...usage }) => ({
  type: 'assistant',
  timestamp: at,
  cwd,
  ...(req ? { requestId: req } : {}),
  message: { ...(id ? { id } : {}), model, usage: { input_tokens: 0, output_tokens: 0, ...usage } },
});

const MIXED = [
  usageRecord({ id: 'a', req: 'r1', cwd: 'C:\\tmp\\demo', input_tokens: 100_000, output_tokens: 20_000 }),
  usageRecord({ id: 'a', req: 'r1', cwd: 'C:\\tmp\\demo', input_tokens: 100_000, output_tokens: 10_000 }),
  usageRecord({ id: 'b', req: 'r2', cwd: 'C:/elsewhere', cache_read_input_tokens: 2_000_000 }),
  usageRecord({ id: 'c', req: 'r3', cwd: 'C:/tmp/demo', at: YESTERDAY, input_tokens: 1_000_000 }),
  usageRecord({ id: 'd', req: 'r4', cwd: 'C:/tmp/demo/sub', cache_creation_input_tokens: 100_000, cache_creation: { ephemeral_1h_input_tokens: 100_000, ephemeral_5m_input_tokens: 0 } }),
  usageRecord({ id: 'e', req: 'r6', cwd: 'C:/tmp/demo-other', input_tokens: 200_000 }),
  usageRecord({ id: 'f', req: 'r7', cwd: 'C:/tmp/demo', model: '<synthetic>', input_tokens: 1_000_000 }),
];

const NO_IDS = [
  usageRecord({ req: 'r9', cwd: 'C:/tmp/demo', input_tokens: 200_000 }),
  usageRecord({ req: 'r9', cwd: 'C:/tmp/demo', input_tokens: 200_000 }),
  usageRecord({ id: 'h', cwd: 'C:/tmp/demo', input_tokens: 200_000 }),
  usageRecord({ id: 'h', req: 'r5', cwd: 'C:/tmp/demo', input_tokens: 100_000 }),
];

const workspaceFor = (scn) => {
  const dir = path.join(fixtureRoot, 'ws-' + scn.label.replace(/[^a-z0-9]+/gi, '-'));
  fs.mkdirSync(path.join(dir, 'repo', '.git'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'session'));
  if (scn.learnings != null) {
    fs.writeFileSync(path.join(dir, 'session', 'learnings-queue.json'), JSON.stringify(Array(scn.learnings).fill({})));
  }
  if (scn.follow_ups != null) {
    const items = scn.follow_ups ? Array.from({ length: scn.follow_ups }, (_, i) => '- [action] item ' + i) : ['- none'];
    fs.writeFileSync(path.join(dir, 'repo', 'WORK-REPORT.md'), ['# Work report', '', '## Follow-ups', '', ...items, ''].join('\n'));
  }
  return {
    transcript_path: path.join(dir, 'session', 'transcript.jsonl'),
    workspace: { project_dir: 'C:/tmp/demo', current_dir: path.join(dir, 'repo') },
  };
};

const scenarios = [
  { label: 'empty',         used_tokens: 0,       caveman: null },
  { label: 'green  (30k)',  used_tokens: 30_000,  caveman: null },
  { label: 'yellow (120k)', used_tokens: 120_000, caveman: null },
  { label: 'red    (170k)', used_tokens: 170_000, caveman: null },
  { label: 'full   (200k)', used_tokens: 200_000, caveman: null },
  { label: 'over   (500k)', used_tokens: 500_000, caveman: null },
  { label: 'limits: green',  used_tokens: 30_000,  caveman: null, rate_limits: { five_hour: { used_percentage: 20 }, seven_day: { used_percentage: 35 } } },
  { label: 'limits: yellow', used_tokens: 30_000,  caveman: null, rate_limits: { five_hour: { used_percentage: 60 }, seven_day: { used_percentage: 75 } } },
  { label: 'limits: red',    used_tokens: 30_000,  caveman: null, rate_limits: { five_hour: { used_percentage: 95 }, seven_day: { used_percentage: 100 } } },
  { label: 'limits: 5h only', used_tokens: 30_000, caveman: 'ultra', rate_limits: { five_hour: { used_percentage: 40 } } },
  { label: 'reflect: 0',      used_tokens: 30_000, caveman: null, workspace: true, learnings: null },
  { label: 'reflect: 3',      used_tokens: 30_000, caveman: null, workspace: true, learnings: 3 },
  { label: 'report: 2',       used_tokens: 30_000, caveman: null, workspace: true, learnings: 0, follow_ups: 2 },
  { label: 'report: done',    used_tokens: 30_000, caveman: null, workspace: true, learnings: 0, follow_ups: 0 },
  { label: 'report: missing', used_tokens: 30_000, caveman: null, workspace: true, learnings: 0, lines_changed: 12 },
  { label: 'report: n/a',     used_tokens: 30_000, caveman: 'ultra', workspace: true, learnings: 0 },
  { label: 'report: no git', used_tokens: 30_000, caveman: null, lines_changed: 12 },
  { label: 'badge: none',   used_tokens: 30_000,  caveman: null },
  { label: 'badge: full',   used_tokens: 30_000,  caveman: 'full' },
  { label: 'badge: ultra',  used_tokens: 30_000,  caveman: 'ultra' },
  { label: 'badge: wenyan', used_tokens: 30_000,  caveman: 'wenyan-ultra' },
  { label: 'badge: off',    used_tokens: 30_000,  caveman: 'off' },
  { label: 'cost: mixed',   used_tokens: 30_000,  caveman: null, transcripts: MIXED },
  { label: 'cost: no ids',  used_tokens: 30_000,  caveman: null, transcripts: NO_IDS },
  { label: 'cost: none',    used_tokens: 30_000,  caveman: null },
];

// Inherit parent stdout so the child writes ANSI directly to the terminal
// (preserves colors) and set FORCE_COLOR for defense against future TTY checks.
const render = (scn) => new Promise((resolve, reject) => {
  const payload = JSON.stringify({
    model: { display_name: 'Opus 4.7 (1M context)' },
    context_window: { total_input_tokens: scn.used_tokens },
    workspace: { project_dir: 'C:/tmp/demo' },
    rate_limits: scn.rate_limits,
    cost: { total_lines_added: scn.lines_changed || 0, total_lines_removed: 0 },
    ...(scn.workspace ? workspaceFor(scn) : {}),
  });
  process.stdout.write(scn.label.padEnd(15) + '  ');
  const child = spawn(process.execPath, [SCRIPT], {
    stdio: ['pipe', 'inherit', 'inherit'],
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      CLICOLOR_FORCE: '1',
      CLAUDE_CONFIG_DIR: fixtureFor(scn.caveman, scn),
    },
  });
  child.on('error', reject);
  child.on('close', () => {
    process.stdout.write('\n');
    resolve();
  });
  child.stdin.end(payload);
});

(async () => {
  try {
    for (const s of scenarios) await render(s);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
})();
