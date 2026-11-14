/* scripts/verify.mjs — `npm run verify`: one command that says whether a change is safe.
   Tier 1 (Node, seconds): selftests, import direction (layer table below), SW shell check, module map (CLAUDE.md vs files on disk).
   Tier 2 (ONE headless Edge via scripts/cdp.mjs): golden screenshot hashes + perf budget, both in scripts/goldens.json.
   `npm run verify -- --update-goldens` rewrites the hashes only; `--update-perf` also re-measures the budget.
   Silent on success except one summary line; on failure prints only what failed (+ paths of the failing shots). */
import { spawnSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'app', 'src');
const GOLDENS = path.join(ROOT, 'scripts', 'goldens.json');
const UPDATE = process.argv.includes('--update-goldens');   // rewrites the hashes only; the perf budget is kept
const UPDATE_PERF = process.argv.includes('--update-perf');   // re-measures the perf budget (also writes hashes)
const T0 = Date.now();
const PORT = 5173;

function fail(lines) {
  console.log('verify FAILED\n' + [].concat(lines).join('\n'));
  process.exit(1);
}

/* ---------- tier 1: Node ---------- */
function runNode(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

/* layer of a file under app/src, (a module may only import from its own layer or below; lower number = lower layer) */
function layer(rel) {
  if (rel === 'tokens.js' || rel === 'math.js' || rel === 'stageprof.js') return 0;
  if (rel === 'framebuffer.js' || rel === 'sky/clock.js') return 1;
  if (rel === 'model/timeline.js') return 4;
  if (rel.startsWith('sky/') || rel.startsWith('model/')) return 2;
  if (rel.startsWith('choreo/')) return 3;
  if (rel.startsWith('render/')) return 5;
  if (rel.startsWith('ui/')) return 6;
  if (rel === 'platform.js' || rel.startsWith('dev/')) return 7;
  if (rel === 'main.js') return 8;
  return null;
}
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []); }
/* existing edges that break the layer order today (found by this check on 2026-11-14). New violations fail; fix or remove an entry when you touch the edge. */
const KNOWN = new Set(['model/placement.js>model/timeline.js', 'model/placement.js>choreo/finish.js', 'model/placement.js>choreo/undo.js', 'model/steps.js>choreo/step.js', 'sky/sky.js>choreo/finish.js']);
function importCheck() {
  const bad = [];
  for (const f of walk(SRC)) {
    const rel = path.relative(SRC, f).replace(/\\/g, '/');
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      const m = /^\s*(?:import\b[^'"]*?|export\b[^'"]*?\bfrom\s*|import\s*)['"](\.[^'"]+)['"]/.exec(ln);
      if (!m) return;
      const target = path.relative(SRC, path.resolve(path.dirname(f), m[1])).replace(/\\/g, '/');
      let why = null;
      const a = layer(rel), b = layer(target);
      if (a === null || b === null) why = 'unknown layer';
      else if (b > a) why = 'imports a layer above it';
      else if (rel.startsWith('model/') && rel !== 'model/timeline.js' && (target.startsWith('sky/') && target !== 'sky/clock.js' || target.startsWith('render/'))) why = 'model must not import sky or render';
      else if (rel.startsWith('choreo/') && !(target === 'math.js' || target === 'tokens.js' || target.startsWith('choreo/'))) why = 'choreo may import only math, tokens';
      else if (rel === 'model/timeline.js' && !(b <= 3 || target.startsWith('model/'))) why = 'timeline may import only choreo and below';
      if (why && KNOWN.has(rel + '>' + target)) why = null;
      if (why) bad.push(`import-direction: app/src/${rel}:${i + 1} -> ${target} (${why})`);
    });
  }
  return bad;
}

/* every app/src/**.js and scripts/*.mjs must appear as a backticked path in CLAUDE.md, and every such path in CLAUDE.md must exist */
function moduleMapCheck() {
  const md = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const named = new Set([...md.matchAll(/`((?:app\/src\/[\w\/.-]+\.js)|(?:scripts\/[\w.-]+\.(?:mjs|json)))`/g)].map(m => m[1]));
  const onDisk = new Set([
    ...walk(SRC).map(f => 'app/src/' + path.relative(SRC, f).replace(/\\/g, '/')),
    ...fs.readdirSync(path.join(ROOT, 'scripts')).filter(n => /\.(mjs|json)$/.test(n)).map(n => 'scripts/' + n)
  ]);
  const out = [];
  for (const f of onDisk) if (!named.has(f)) out.push('module-map: ' + f + ' is not in the CLAUDE.md module map');
  for (const f of named) if (!onDisk.has(f)) out.push('module-map: CLAUDE.md names ' + f + ' but it does not exist');
  return out;
}

const test = runNode('test.mjs');
if (!test.ok) fail(['npm test failed:', test.out.trim()]);
const imp = importCheck();
if (imp.length) fail(imp);
const chk = runNode('gen-shell.mjs', ['--check']);
if (!chk.ok) fail(['npm run check failed (run `npm run shell`):', chk.out.trim()]);
const mm = moduleMapCheck();
if (mm.length) fail(mm);
const nodeMs = Date.now() - T0;

/* ---------- tier 2: browser ---------- */
const BASE = 'dev=1&seed=7&clock=2026-11-13T21:00';
const SIZES = { d125: { size: '1917x933', dpr: 1.25 }, ph: { size: '375x812', dpr: 2 } };
/* the spec's scene names -> dev URLs. ambient = no scene (plain frozen sky). ritual is a ?ritual=1 param, not a scene. */
const SCENES = {
  steps: 'scene=steps',
  finish: 'scene=finish',
  labels: 'scene=labels&demo=1&hover=hm%20one-pager',   // demo=1 + hover: star labels and the hover frame are drawn, so TXT/label tokens are covered
  ritual: 'ritual=1&t=12&at=1500',
  ambient: 'freeze=1&t=12',
  /* no demo, 2 tasks without steps (count 2 mod 3). hints: selected star shows the dim "+ step" row */
  hints: { q: 'freeze=1&t=12', eval: "ns.fillSteps(2,0,true);ns.select('task 1 · essay')" },
  barhint: { q: 'freeze=1&t=12', eval: "ns.fillSteps(2,0,true)" }   // nothing selected: the bar placeholder is the step syntax
};
const PERF = { size: '1917x933', dpr: 2, frames: 300 };

function serverUp() {
  return new Promise(res => { const q = http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 800 }, r => { r.resume(); res(true); }); q.on('error', () => res(false)); q.on('timeout', () => { q.destroy(); res(false); }); });
}
let server = null;
if (!(await serverUp())) {
  server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs'), 'app', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await serverUp()); i++) await new Promise(r => setTimeout(r, 100));
}
function stopServer() { if (server) { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); server = null; } }
process.on('exit', stopServer);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-verify-'));
const jobs = [], keys = [];
for (const [sz, o] of Object.entries(SIZES)) for (const [name, sc] of Object.entries(SCENES)) {
  const q = typeof sc === 'string' ? sc : sc.q;
  const key = name + '@' + sz;
  keys.push(key);
  jobs.push({ url: `http://localhost:${PORT}/?${BASE}&${q}`, out: path.join(tmp, key + '.png').replace(/\\/g, '/'), size: o.size, dpr: o.dpr, wait: 1000, ...(sc.eval ? { eval: sc.eval } : {}) });
}
jobs.push({
  url: `http://localhost:${PORT}/?${BASE}&prof=1`, size: PERF.size, dpr: PERF.dpr, wait: 1000,
  eval: `ns.profRun({frames:${PERF.frames}}).then(s=>JSON.stringify({raw:{total:s.total,err:s.err}}))`
});
const listFile = path.join(tmp, 'shots.json');
fs.writeFileSync(listFile, JSON.stringify(jobs));
const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'cdp.mjs'), '--shots', listFile, '--gpu', '--timeout', '150'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
stopServer();
const cdpOut = (r.stdout || '') + (r.stderr || '');
const bad = cdpOut.split('\n').filter(l => /^(EXC|ERR|TIMEOUT|EVALEXC)/.test(l));
if (r.status !== 0 || bad.length) fail(['browser run failed:', ...bad.slice(0, 8)]);

/* perf: median CPU frame from ns.profRun (the EVAL line is the last one) */
const evalLine = cdpOut.split('\n').filter(l => l.startsWith('EVAL ')).pop();
let prof = null;
try { prof = JSON.parse(JSON.parse(evalLine.slice(5))); } catch (_) { }
const med = prof && perfMedian(prof.raw);
if (!(med > 0)) fail(['perf: could not read a median CPU frame from ns.profRun:', (evalLine || 'no EVAL line').slice(0, 300)]);
function perfMedian(s) {
  if (s.total && typeof s.total.med === 'number') return s.total.med;
  if (s.cpu && typeof s.cpu.med === 'number') return s.cpu.med;
  if (s.frame && typeof s.frame.med === 'number') return s.frame.med;
  return null;
}

const hashes = {};
for (const k of keys) hashes[k] = crypto.createHash('sha256').update(fs.readFileSync(path.join(tmp, k + '.png'))).digest('hex');
const g = fs.existsSync(GOLDENS) ? JSON.parse(fs.readFileSync(GOLDENS, 'utf8')) : null;

if (UPDATE || UPDATE_PERF || !g) {
  const keep = g && !UPDATE_PERF;
  const budget = keep ? g.perf.budgetMs : Math.round(med * 1.5 * 100) / 100;
  fs.writeFileSync(GOLDENS, JSON.stringify({
    note: 'Written by `npm run verify -- --update-goldens` (hashes) and `--update-perf` (budget). SHA-256 of PNG screenshots (dev scenes, clock pinned, GPU on) and the perf budget in ms (1.5x the measured median CPU frame of ns.profRun at d2).',
    hashes, perf: { measuredMedianMs: keep ? g.perf.measuredMedianMs : Math.round(med * 100) / 100, budgetMs: budget, frames: PERF.frames, setup: 'ambient (no scene), 1917x933 dpr 2, GPU' }
  }, null, 2) + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`verify: goldens updated (${keys.length} hashes, perf median ${med.toFixed(2)} ms, budget ${budget} ms)`);
  process.exit(0);
}

const errs = [];
for (const k of keys) {
  if (g.hashes[k] !== hashes[k]) errs.push(`golden mismatch: ${k}  -> ${path.join(tmp, k + '.png')}`);
}
if (med > g.perf.budgetMs) errs.push(`perf: median CPU frame ${med.toFixed(2)} ms > budget ${g.perf.budgetMs} ms`);
if (errs.length) {
  console.log('verify FAILED\n' + errs.join('\n'));
  process.exit(1);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`verify OK: ${keys.length} goldens, perf ${med.toFixed(2)}/${g.perf.budgetMs} ms, node ${(nodeMs / 1000).toFixed(1)}s, total ${((Date.now() - T0) / 1000).toFixed(1)}s`);
