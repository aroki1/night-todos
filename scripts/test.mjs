/* scripts/test.mjs — runs the app selftests under plain Node. Prints "pass/total" or the failures. */
import { selfTest } from '../app/src/dev/selftest.js';
const r = selfTest();
if (r.fail) { for (const f of r.failed) console.log('FAIL ' + f); }
console.log(r.pass + '/' + r.total);
process.exit(r.fail ? 1 : 0);
