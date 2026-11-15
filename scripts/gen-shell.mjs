/* scripts/gen-shell.mjs — generates the service-worker shell list and the modulepreload tags. Zero dependencies.
   node scripts/gen-shell.mjs          write app/sw.js (SHELL, VERSION) and app/index.html (preload block)
   node scripts/gen-shell.mjs --check  exit 1 if either is stale
   VERSION = 'ns-' + a short hash of every shell file. src/dev/* is never in the shell and never preloaded (dev-only, loaded on demand). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const check = process.argv.includes('--check');
const START = '<!-- gen:preload -->',
  END = '<!-- /gen:preload -->';

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, n.name);
    if (n.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = f => './' + path.relative(app, f).split(path.sep).join('/');
const files = walk(app)
  .map(rel)
  .filter(f => f !== './sw.js' && !f.startsWith('./src/dev/') && !path.basename(f).startsWith('.'))
  .sort();
const TEXT = /\.(html|js|css|json|webmanifest|svg|txt)$/;
const read = f => {
  const b = fs.readFileSync(path.join(app, f));
  return TEXT.test(f) ? Buffer.from(b.toString('utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))) : b;
}; // same hash on CRLF and LF checkouts
const mods = files.filter(f => f.startsWith('./src/') && f.endsWith('.js'));
const shell = ['./', ...files];

const preload = START + '\n' + mods.map(m => '<link rel="modulepreload" href="' + m + '">').join('\n') + '\n' + END;
let html = read('./index.html').toString('utf8');
const hs = html.indexOf(START),
  he = html.indexOf(END);
if (hs < 0 || he < 0) {
  console.error('index.html is missing the gen:preload markers');
  process.exit(1);
}
const newHtml = html.slice(0, hs) + preload + html.slice(he + END.length);

const h = crypto.createHash('sha1');
for (const f of files) {
  h.update(f + '\0');
  h.update(f === './index.html' ? newHtml : read(f));
}
const version = 'ns-' + h.digest('hex').slice(0, 10);

let sw = read('./sw.js').toString('utf8');
const newSw = sw
  .replace(/const VERSION = '[^']*';/, "const VERSION = '" + version + "';")
  .replace(/const SHELL = \[[\s\S]*?\n\];/, 'const SHELL = [\n' + shell.map(f => "  '" + f + "',").join('\n') + '\n];');

const stale = [];
if (newHtml !== html) stale.push('app/index.html');
if (newSw !== sw) stale.push('app/sw.js');
if (check) {
  if (stale.length) {
    console.error('stale (run npm run shell): ' + stale.join(', '));
    process.exit(1);
  }
  console.log('shell ok ' + version + ' (' + shell.length + ' files, ' + mods.length + ' modules)');
} else {
  fs.writeFileSync(path.join(app, 'index.html'), newHtml);
  fs.writeFileSync(path.join(app, 'sw.js'), newSw);
  console.log(
    version + ' (' + shell.length + ' files, ' + mods.length + ' modules)' + (stale.length ? ' wrote ' + stale.join(', ') : ' unchanged')
  );
}
