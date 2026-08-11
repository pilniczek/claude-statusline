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

const fixtureFor = (level) => {
  const key = level === null ? '_none' : level;
  if (!fixtureDirs.has(key)) {
    const dir = path.join(fixtureRoot, key);
    fs.mkdirSync(dir);
    if (level !== null) fs.writeFileSync(path.join(dir, '.caveman-active'), level);
    fixtureDirs.set(key, dir);
  }
  return fixtureDirs.get(key);
};

const scenarios = [
  { label: 'empty',         used_tokens: 0,       caveman: null },
  { label: 'green  (15k)',  used_tokens: 15_000,  caveman: null },
  { label: 'yellow (60k)',  used_tokens: 60_000,  caveman: null },
  { label: 'red    (95k)',  used_tokens: 95_000,  caveman: null },
  { label: 'full  (100k)',  used_tokens: 100_000, caveman: null },
  { label: 'over  (250k)',  used_tokens: 250_000, caveman: null },
  { label: 'badge: none',   used_tokens: 15_000,  caveman: null },
  { label: 'badge: full',   used_tokens: 15_000,  caveman: 'full' },
  { label: 'badge: ultra',  used_tokens: 15_000,  caveman: 'ultra' },
  { label: 'badge: wenyan', used_tokens: 15_000,  caveman: 'wenyan-ultra' },
  { label: 'badge: off',    used_tokens: 15_000,  caveman: 'off' },
];

// Inherit parent stdout so the child writes ANSI directly to the terminal
// (preserves colors) and set FORCE_COLOR for defense against future TTY checks.
const render = (scn) => new Promise((resolve, reject) => {
  const payload = JSON.stringify({
    model: { display_name: 'Opus 4.7 (1M context)' },
    context_window: { used_tokens: scn.used_tokens },
    workspace: { project_dir: 'C:/tmp/demo' },
  });
  process.stdout.write(scn.label.padEnd(14) + '  ');
  const child = spawn(process.execPath, [SCRIPT], {
    stdio: ['pipe', 'inherit', 'inherit'],
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      CLICOLOR_FORCE: '1',
      CLAUDE_CONFIG_DIR: fixtureFor(scn.caveman),
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
