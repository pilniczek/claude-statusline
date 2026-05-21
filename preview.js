#!/usr/bin/env node
// Render statusline.js across representative usage tiers.
// Each scenario spawns statusline.js with a fake payload on stdin.

const { spawn } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'statusline.js');

const scenarios = [
  { label: 'empty',         used_tokens: 0 },
  { label: 'green  (15k)',  used_tokens: 15_000 },
  { label: 'yellow (60k)',  used_tokens: 60_000 },
  { label: 'red    (95k)',  used_tokens: 95_000 },
  { label: 'full  (100k)',  used_tokens: 100_000 },
  { label: 'over  (250k)',  used_tokens: 250_000 },
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
    env: { ...process.env, FORCE_COLOR: '1', CLICOLOR_FORCE: '1' },
  });
  child.on('error', reject);
  child.on('close', () => {
    process.stdout.write('\n');
    resolve();
  });
  child.stdin.end(payload);
});

(async () => {
  for (const s of scenarios) await render(s);
})();
