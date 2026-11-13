/* scripts/cdp.mjs — tiny CDP driver for QA screenshots and real key typing.
   node scripts/cdp.mjs <url> <out.png> [--type "text"] [--key Enter] [--wait ms] [--eval "expr"] [--size WxH] [--dpr N]
   Prints console messages, exceptions and data-err/data-ready. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
function flag(name, def) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; }
const size = flag('size', '1240x700').split('x').map(Number);
const dpr = Number(flag('dpr', '1'));
const wait = Number(flag('wait', '2500'));
const typeText = flag('type', null);
const keyName = flag('key', null);
const evalExpr = flag('eval', null);
const prefixKeys = args.includes('--prefix-n');
const port = 9400 + Math.floor(Math.random() * 400);
const profile = path.join(os.tmpdir(), 'ns-cdp-' + port);
fs.rmSync(profile, { recursive: true, force: true });

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=' + size[0] + ',' + size[1], '--force-device-scale-factor=' + dpr,
  'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/list');
      const list = await r.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (_) { }
    await sleep(100);
  }
  throw new Error('no CDP target');
}
const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
const logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled') logs.push('LOG ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Log.entryAdded') logs.push('LOG[' + m.params.entry.level + '] ' + m.params.entry.text);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) logs.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url);
  if (m.method === 'Network.loadingFailed') logs.push('FAIL ' + m.params.errorText + ' ' + (m.params.requestId || ''));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: dpr, mobile: dpr > 1 });
await send('Page.navigate', { url });
await sleep(wait);
if (prefixKeys) { await key('n'); }
if (typeText) {
  for (const ch of typeText) { await key(ch === ' ' ? 'Space' : ch); await sleep(30); }
}
if (keyName) { await key(keyName); }
const eval1 = flag('eval1', null);
if (eval1) { await send('Runtime.evaluate', { expression: eval1, returnByValue: true, awaitPromise: true }); }
if (args.includes('--reload')) { await send('Page.reload', {}); await sleep(Number(flag('postwait', '1800'))); }
if (evalExpr) {
  const r = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true, awaitPromise: true });
  logs.push('EVAL ' + JSON.stringify(r.result?.result?.value));
  if (r.result?.exceptionDetails) logs.push('EVALEXC ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
}
if (args.includes('--postwait')) await sleep(Number(flag('postwait', '1500')));
else await sleep(400);
const meta = await send('Runtime.evaluate', { expression: "JSON.stringify({ready:document.documentElement.dataset.ready,err:document.documentElement.dataset.err,title:document.title,out:document.documentElement.dataset.out})", returnByValue: true });
logs.push('META ' + (meta.result?.result?.value || ''));
if (out) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  logs.push('SHOT ' + out + ' ' + fs.statSync(out).size);
}
console.log(logs.join('\n'));
ws.close(); edge.kill();
await sleep(200);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { }

async function key(k) {
  const special = { Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape', ''], Backspace: [8, 'Backspace', ''], Tab: [9, 'Tab', ''] }[k];
  if (special) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: special[0], key: special[1], code: special[1], text: special[2] });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: special[0], key: special[1], code: special[1] });
    return;
  }
  const ch = k === 'Space' ? ' ' : k;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
}
