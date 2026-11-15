/* scripts/record.mjs — renders the README media from the real app: deterministic frames, then ffmpeg.
   node scripts/record.mjs [name ...] [--keep] [--port 5173]     (no name = every clip and still)
   Each clip freezes the app and steps sky time by hand (one frame = 1/30 s), so there are no dropped frames.
   Output in docs/media/: <name>.gif (two-pass palette, <= 8 MB) and <name>.mp4 (H.264, yuv420p, +faststart); stills are <name>.png.
   ONE headless Edge for the whole run, torn down on every exit path (Browser.close, taskkill /T, profile removed). Frames live in shots/rec-* and are deleted afterwards (--keep to look at them).
   Needs the dev server (`npm run dev`) on --port; ffmpeg at C:/ProgramData/chocolatey/bin/ffmpeg. */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = path.join(ROOT, 'docs', 'media');
const SHOTS = path.join(ROOT, 'shots');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FFMPEG = 'C:/ProgramData/chocolatey/bin/ffmpeg';
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const pi = args.indexOf('--port');
const PORT = pi >= 0 ? +args[pi + 1] : 5173;
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
const BASE = 'http://127.0.0.1:' + PORT + '/';
const FPS = 30, GIF_W = 960, GIF_MAX = 8 * 1024 * 1024;

/* ---------- what to record ---------- */
const DEMO = 'demo=1&freeze=1&seed=7&clock=2026-11-12T22:30';
/* a believable week without demo mode: real store tasks pushed in from the page (finished chain, live stars, one amber), past weeks on top */
const WEEK = 'freeze=1&seed=11&clock=2026-11-26T22:00&t=12';
const SEED = `(async () => {
  const S = await import('/src/model/store.js'), C = await import('/src/sky/clock.js'), now = C.wall(C.T), H = 36e5;
  const mk = (id, title, x, y, dl, done, link, big, steps) => ({ id, title, createdAt: now - 90 * H, deadline: now + dl * H, big: big || 0, x, y, doneAt: done == null ? null : now - done * H, link: link || null, week: null, steps: steps || [] });
  S.store.tasks.length = 0;
  S.store.tasks.push(
    mk('a', 'essay outline', .13, .30, -20, 70, null), mk('b', 'lab report', .23, .17, -10, 56, 'a', 1), mk('c', 'reading ch. 7', .34, .36, -5, 41, 'b'),
    mk('d', 'problem set 4', .30, .56, 10, 30, 'c'), mk('e', 'seminar notes', .45, .22, 12, 20, 'c', 1),
    mk('f', 'call the dentist', .74, .42, 40, 9, null), mk('g', 'library books', .83, .27, 30, 5, 'f'),
    mk('h', 'thesis chapter', .58, .20, 76, null, null, 1), mk('i', 'grocery run', .66, .56, 94, null), mk('j', 'tax form', .52, .50, 26, null),
    mk('k', 'quiz prep', .20, .62, 130, null));
  S.rebuildStars(now);
  ns.injectWeeks(%W%);
  ns.render(); return S.stars.length;
})()`;
const STILL = {
  hero: { url: '?' + WEEK, size: [1600, 900], dpr: 2, outW: 1600, run: SEED.replace('%W%', 6) },
  help: { url: '?' + WEEK, size: [1600, 900], dpr: 2, outW: 1600, run: SEED.replace('%W%', 6) + '.then(async () => { ns.key("n"); ns.type("/help"); ns.key("Enter"); ns.advance(900); return 0; })' },
  groups: { url: '?' + DEMO + '&scene=labels&tags=1&hover=hm%20one-pager', size: [1600, 900], dpr: 2, outW: 1600 },
  phone: { url: '?' + WEEK, size: [375, 812], dpr: 3, outW: 1125, run: SEED.replace('%W%', 6).replace("'library books', .83, .27", "'library books', .83, .12").replace("'seminar notes', .45, .22", "'seminar notes', .45, .27") }
};
/* clips: `pre` runs once after load; `step(i)` returns JS run before frame i (after it, time advances by 1/FPS) */
const CLIP = {
  create: {
    url: '?' + WEEK, size: [1600, 900], secs: 4.4,
    pre: SEED.replace('%W%', 6) + '.then(() => { ns.key("n"); ns.advance(10); return 0; })',
    step: i => {
      const txt = 'essay, fri', t0 = 8;                     // first key at frame 14, one every 4 frames
      const k = Math.floor((i - t0) / 4);
      if (i >= t0 && (i - t0) % 4 === 0 && k < txt.length) return 'ns.key(' + JSON.stringify(txt[k] === ' ' ? 'Space' : txt[k]) + ');';
      if (i === 68) return 'ns.key("Enter");';
      return '';
    }
  },
  thought: {
    url: '?' + WEEK, size: [1600, 900], secs: 5.6, crop: [1600, 600, 0, 300],
    pre: SEED.replace('%W%', 6) + '.then(() => { ns.key("n"); ns.advance(10); return 0; })',
    step: i => {
      const a = 'call the landlord', b = 'fri';                  // a thought, then its answer to "when?"
      const k = Math.floor((i - 8) / 3), j = Math.floor((i - 104) / 5);
      if (i >= 8 && (i - 8) % 3 === 0 && k < a.length) return 'ns.key(' + JSON.stringify(a[k] === ' ' ? 'Space' : a[k]) + ');';
      if (i === 68) return 'ns.key("Enter");';
      if (i >= 104 && (i - 104) % 5 === 0 && j < b.length) return 'ns.key(' + JSON.stringify(b[j]) + ');';
      if (i === 124) return 'ns.key("Enter");';
      return '';
    }
  },
  practice: {
    url: '?' + WEEK + '&practices=3', size: [1600, 900], secs: 4.4, crop: [480, 270, 610, 350],
    pre: SEED.replace('%W%', 6) + '.then(() => { ns.advance(10); return 0; })',
    step: i => i === 20 ? 'ns.practiceMark("gym", 0);' : i === 66 ? 'ns.hover("gym");' : ''
  },
  finish: { url: '?' + DEMO + '&scene=finish&at=0', size: [1600, 900], secs: 3.0, t0: 2.0 },
  steps: { url: '?' + DEMO + '&steps=1&scene=steps&sel=hm%20one-pager&stepfin=hm%20one-pager&t=3&at=0', size: [1600, 900], secs: 3.2, t0: 3, crop: [960, 540, 160, 0] },
  'weekly-morning': { url: '?morning=1&at=0&season=summer&seed=7&clock=2026-11-16T09:00', size: [1600, 900], secs: 10.5, t0: 0 }
};

/* ---------- Edge, torn down on every exit path ---------- */
const port = 9800 + Math.floor(Math.random() * 400);
const profile = path.join(os.tmpdir(), 'ns-cdp-rec-' + port);
fs.rmSync(profile, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile, '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
let closed = false;
function shutdown() {
  if (closed) return; closed = true;
  try { if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) { }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { }
}
process.on('exit', shutdown);
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => process.exit(1));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + expression.slice(0, 80) + ' -> ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
}
async function open(url, [w, h], dpr) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: dpr > 1 && w < 768 });
  await send('Page.navigate', { url: BASE + url });
  for (let i = 0; i < 100; i++) {                                  // wait for the app (and its fonts): data-ready
    await sleep(150);
    if (await evalJs('document.documentElement.dataset.ready === "1" && document.fonts.status === "loaded"')) break;
    if (i === 99) throw new Error('not ready: ' + url);
  }
  const err = await evalJs('document.documentElement.dataset.err || ""');
  if (err) throw new Error('page error: ' + err);
  await sleep(300);
}
async function shotTo(file) {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, optimizeForSpeed: true });
  fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
}
function ff(argv) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + (r.stderr || '').slice(0, 600));
}

/* ---------- encoding ---------- */
function encode(name, dir, frames, crop) {
  const inp = ['-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png')];
  const cr = crop ? 'crop=' + crop.join(':') + ',' : '';
  const mp4 = path.join(MEDIA, name + '.mp4');
  ff([...inp, '-vf', cr + 'scale=1600:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', '-an', mp4]);
  /* GIF: widest and smoothest first; grainy scenes (the meadow) step down in fps, then palette size, then width until <= 8 MB. dither=none keeps the grain crisp (the app already dithers its own gradients). */
  const pal = path.join(dir, 'pal.png'), gif = path.join(MEDIA, name + '.gif');
  const tries = [[GIF_W, FPS, 256], [GIF_W, 24, 256], [800, 24, 128], [800, 20, 128], [720, 20, 128]];
  let res = '';
  for (const [w, fps, cols] of tries) {
    const vf = cr + (fps === FPS ? '' : 'fps=' + fps + ',') + 'scale=' + w + ':-2:flags=lanczos';
    ff([...inp, '-vf', vf + ',palettegen=max_colors=' + cols + ':stats_mode=diff', pal]);
    ff([...inp, '-i', pal, '-lavfi', vf + '[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', gif]);
    res = w + 'px ' + fps + 'fps ' + cols + ' colours';
    if (fs.statSync(gif).size <= GIF_MAX) break;
  }
  const g = fs.statSync(gif).size, m = fs.statSync(mp4).size;
  console.log(`${name}: ${frames} frames, gif ${(g / 1048576).toFixed(2)} MB (${res}), mp4 ${(m / 1048576).toFixed(2)} MB`);
}

/* ---------- main ---------- */
async function main() {
  fs.mkdirSync(MEDIA, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); const p = l.find(t => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch (_) { }
    await sleep(100);
  }
  if (!ws) throw new Error('no CDP target');
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  try { await fetch(BASE); } catch (_) { throw new Error('dev server not running on ' + BASE + ' (npm run dev)'); }

  const want = n => !only.length || only.includes(n);
  for (const [name, s] of Object.entries(STILL)) {
    if (!want(name)) continue;
    await open(s.url, s.size, s.dpr);
    if (s.run) { await evalJs(s.run); await sleep(300); }
    const raw = path.join(SHOTS, 'rec-' + name + '.png');
    await shotTo(raw);
    const out = path.join(MEDIA, name + '.png');
    ff(['-i', raw, '-vf', 'scale=' + s.outW + ':-2:flags=lanczos', out]);
    fs.rmSync(raw, { force: true });
    console.log(`${name}.png: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }
  for (const [name, c] of Object.entries(CLIP)) {
    if (!want(name)) continue;
    const dir = path.join(SHOTS, 'rec-' + name);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await open(c.url, c.size, 1);
    if (c.pre) await evalJs(c.pre);
    const n = Math.round(c.secs * FPS);
    const base = await evalJs('ns.now()');
    for (let i = 0; i < n; i++) {
      if (c.t0 !== undefined) await evalJs('ns.freeze(' + (c.t0 + i / FPS) + ')');       // scenes and the morning are pure functions of T: set it, render once
      else await evalJs((c.step ? c.step(i) : '') + 'ns.advance(' + (1000 / FPS) + '); 0');
      await shotTo(path.join(dir, 'f' + String(i + 1).padStart(4, '0') + '.png'));
    }
    encode(name, dir, n, c.crop);
    if (!KEEP) fs.rmSync(dir, { recursive: true, force: true });
    void base;
  }
}

try { await main(); }
catch (e) { console.error('record failed: ' + (e && e.stack || e)); process.exitCode = 1; }
finally {
  try { await Promise.race([send('Browser.close'), sleep(1000)]); } catch (_) { }
  try { ws && ws.close(); } catch (_) { }
  shutdown();
}
