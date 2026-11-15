/* model/parser.js — the deadline parser (port of src/deadline.rs). Pure. */
import { WDN, WDFULL, MON, MONFULL, mkDate } from '../sky/clock.js';

export function wdTok(t) {
  if (t.length < 3) return -1;
  for (let i = 0; i < 7; i++) if (t.startsWith(WDN[i]) && WDFULL[i].startsWith(t)) return i;
  return -1;
}
export function monTok(t) {
  if (t.length < 3) return -1;
  for (let i = 0; i < 12; i++) if (t.startsWith(MON[i]) && (MONFULL[i].startsWith(t) || t === 'sept')) return i + 1;
  return -1;
}
/* 18:00, 18, 6pm, 6:30pm */
export function timeTok(t) {
  let body = t,
    pm = null;
  if (t.endsWith('pm')) {
    body = t.slice(0, -2);
    pm = true;
  } else if (t.endsWith('am')) {
    body = t.slice(0, -2);
    pm = false;
  }
  const ci = body.indexOf(':');
  let h = ci < 0 ? body : body.slice(0, ci),
    m = ci < 0 ? '0' : body.slice(ci + 1);
  if (!/^\d+$/.test(h) || !/^\d+$/.test(m) || h.length > 2 || m.length > 2) return null;
  h = +h;
  m = +m;
  if (pm !== null) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (pm ? 12 : 0);
  }
  return h < 24 && m < 60 ? [h, m] : null;
}
/* -> {ok:true, date} | {err:'unreadable'|'past'}; now is a Date */
export function parseDeadline(str, now) {
  const toks = str
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(x => x),
    UN = { err: 'unreadable' },
    PAST = { err: 'past' };
  if (!toks.length) return UN;
  if (toks.length === 1 && toks[0][0] === '+') {
    const body = toks[0].slice(1),
      unit = body.slice(-1),
      ns = body.slice(0, -1);
    if (/^\d+$/.test(ns) && 'dhm'.indexOf(unit) >= 0) {
      const n = +ns;
      if (n <= 0) return PAST;
      return { ok: true, date: new Date(now.getTime() + n * (unit === 'd' ? 864e5 : unit === 'h' ? 36e5 : 6e4)) };
    }
  }
  let day = null,
    used = 0;
  const f = toks[0];
  if (f === 'today' || f === 'tonight') {
    day = { k: 'today' };
    used = 1;
  } else if (f === 'tomorrow' || f === 'tmr') {
    day = { k: 'tmr' };
    used = 1;
  } else if (wdTok(f) >= 0) {
    day = { k: 'wd', w: wdTok(f) };
    used = 1;
  } else if (f.indexOf('-') >= 0) {
    const p = f.split('-');
    if (p.length !== 3 || !p.every(x => /^\d+$/.test(x))) return UN;
    const dt = mkDate(+p[0], +p[1], +p[2], 0, 0);
    if (!dt) return UN;
    day = { k: 'exact', y: +p[0], m: +p[1], d: +p[2] };
    used = 1;
  } else if (f.indexOf('.') >= 0 || f.indexOf('/') >= 0) {
    // 20.11 and 20/11 both read as day.month
    const p = f.split(/[./]/);
    if (p.length !== 2 || !p.every(x => /^\d+$/.test(x))) return UN;
    if (!mkDate(2000, +p[1], Math.max(1, Math.min(29, +p[0])), 0, 0)) return UN;
    day = { k: 'md', m: +p[1], d: +p[0] };
    used = 1;
  } else if (monTok(f) >= 0) {
    if (toks.length < 2 || !/^\d+$/.test(toks[1])) return UN;
    day = { k: 'md', m: monTok(f), d: +toks[1] };
    used = 2;
  } else if (/^\d+$/.test(f)) {
    if (toks.length < 2 || monTok(toks[1]) < 0) return UN;
    day = { k: 'md', m: monTok(toks[1]), d: +f };
    used = 2;
  } else return UN;
  const rest = toks.slice(used);
  let tm = null;
  if (rest.length === 1) {
    tm = timeTok(rest[0]);
    if (!tm) return UN;
  } else if (rest.length > 1) return UN;
  const hh = tm ? tm[0] : 23,
    mm = tm ? tm[1] : 59;
  const ty = now.getFullYear(),
    tmo = now.getMonth() + 1,
    td = now.getDate(),
    at = (y, m, d) => mkDate(y, m, d, hh, mm);
  let out;
  if (day.k === 'today') out = at(ty, tmo, td);
  else if (day.k === 'tmr') {
    const t = new Date(ty, tmo - 1, td + 1);
    out = at(t.getFullYear(), t.getMonth() + 1, t.getDate());
  } else if (day.k === 'exact') out = at(day.y, day.m, day.d);
  else if (day.k === 'wd') {
    const ahead = (7 + day.w - now.getDay()) % 7;
    let t = new Date(ty, tmo - 1, td + ahead);
    if (ahead === 0) {
      const today = at(ty, tmo, td);
      if (!(today && today > now)) t = new Date(ty, tmo - 1, td + 7);
    }
    out = at(t.getFullYear(), t.getMonth() + 1, t.getDate());
  } else {
    const todayStart = new Date(ty, tmo - 1, td),
      a = mkDate(ty, day.m, day.d, 0, 0);
    if (a && a >= todayStart) out = at(ty, day.m, day.d);
    else {
      if (!mkDate(ty + 1, day.m, day.d, 0, 0)) return UN;
      out = at(ty + 1, day.m, day.d);
    }
  }
  if (!out) return UN;
  return out <= now ? PAST : { ok: true, date: out };
}

/* the bar. One line, three parts in any order, separated by commas: title, deadline, `#tag`. Pieces that are neither a deadline nor a tag stay in
   the title, commas kept (`buy milk, eggs, today`). Without a comma the deadline is the longest tail of words parseDeadline accepts.
   Steps: lines after the first that start with `-`, or the old ` / ` after a comma (a lone slash between spaces, so `20/11` is never split).
   Other extra lines are joined to the title with a space. A leading `!` or a trailing ` !` makes the star big.
   -> { title, big, dls (deadline text or null), res (parseDeadline result or null), steps: [text], tag } */
const SEP = /\s\/(?=\s|$)/g;
const LEAD = /^\s*!\s*/;
const readable = (s, now) => {
  const r = parseDeadline(s, now);
  return r.ok || r.err === 'past';
};
export function parseBar(text, nowMs) {
  const now = new Date(nowMs),
    lines = String(text === null || text === undefined ? '' : text)
      .replace(/\r\n?/g, '\n')
      .split('\n');
  const lineSteps = [],
    extra = [];
  for (const l of lines.slice(1)) {
    const x = l.trim();
    if (!x) continue;
    if (x[0] === '-') {
      const st = x.replace(/^-+\s*/, '').trim();
      if (st) lineSteps.push(st);
    } else extra.push(x);
  }
  const ex = extractTag(lines[0]);
  let t = ex.text,
    tag = ex.tag,
    big = false,
    steps = [];
  for (let i = 0; i < extra.length; i++) {
    const e = extractTag(extra[i]);
    extra[i] = e.text;
    if (!tag && e.tag) tag = e.tag;
  }
  if (LEAD.test(t)) {
    t = t.replace(LEAD, '');
    big = true;
  }
  if (/\s!$/.test(t)) {
    t = t.replace(/\s*!$/, '');
    big = true;
  }
  SEP.lastIndex = 0;
  for (let m = SEP.exec(t); m; m = SEP.exec(t)) {
    const head = t.slice(0, m.index);
    if (head.indexOf(',') < 0) continue;
    steps = t
      .slice(m.index + 2)
      .split(/\s\/(?=\s|$)/)
      .map(x => x.trim())
      .filter(x => x);
    t = head;
    break;
  }
  steps = steps.concat(lineSteps);
  const pieces = t
    .split(',')
    .map(x => x.trim())
    .filter(x => x);
  let dls = null,
    rest = pieces;
  for (let k = pieces.length - 1; k >= 0 && pieces.length > 1; k--)
    if (readable(pieces[k], now)) {
      dls = pieces[k];
      rest = pieces.filter((_, j) => j !== k);
      break;
    }
  if (dls === null && pieces.length) {
    const words = pieces[pieces.length - 1].split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const cand = words.slice(i).join(' ');
      if (readable(cand, now)) {
        dls = cand;
        rest = pieces.slice(0, -1).concat([words.slice(0, i).join(' ')]);
        break;
      }
    }
  }
  let title = rest.join(', ');
  if (extra.length) title = (title + ' ' + extra.join(' ')).trim();
  if (/\s!$/.test(title)) {
    title = title.replace(/\s*!$/, '');
    big = true;
  }
  return { title, big, dls, res: dls === null ? null : parseDeadline(dls, now), steps, tag };
}
/* the answer to "steps?": comma separated, trimmed, empty ones dropped */
export function parseStepAnswer(text) {
  return String(text === null || text === undefined ? '' : text)
    .split(/[,\n]/)
    .map(x => x.trim())
    .filter(x => x);
}

/* the first `#tag` token (letters, digits, `-`, 1..16) that starts after a space or at the text's start is removed and returned lowercase.
   Punctuation may follow the token (`#study, fri`), so a tag never needs its own comma. -> { text, tag } */
const TAG = /(^|\s)#([A-Za-z0-9-]{1,16})(?![A-Za-z0-9-])/;
export function extractTag(text) {
  const src = String(text === null || text === undefined ? '' : text);
  const m = TAG.exec(src);
  const squash = s => s.trim().replace(/\s{2,}/g, ' ');
  if (!m) return { text: squash(src), tag: null };
  return { text: squash(src.slice(0, m.index) + src.slice(m.index + m[0].length)), tag: m[2].toLowerCase() };
}

/* what the bar would make of this text: a command, a task (title + a readable deadline), a thought (title, no deadline), or bad.
   `nowMs` is wall ms. */
export function barKind(text, nowMs) {
  const tx = String(text === null || text === undefined ? '' : text).trim();
  if (!tx) return 'empty';
  if (tx[0] === '/') return 'cmd';
  const p = parseBar(tx, nowMs);
  if (p.dls === null) return p.title === '' ? 'bad' : 'thought';
  return p.title !== '' && p.res.ok ? 'task' : 'bad';
}

/* the "when?" answer. -> { kind:'say', date, steps, big } | { kind:'remind', date } | { kind:'later' } | { kind:'bad', err } */
const WHENSEP = /\s\/(?=\s|$)/;
export function parseWhen(text, nowMs) {
  const tx = String(text === null || text === undefined ? '' : text).trim();
  if (!tx) return { kind: 'later' };
  const now = new Date(nowMs);
  const m = /^(?:remind|r)\s+([\s\S]+)$/i.exec(tx);
  if (m) {
    const r = parseDeadline(m[1].trim(), now);
    return r.ok ? { kind: 'remind', date: r.date } : { kind: 'bad', err: r.err };
  }
  let t = tx,
    big = false;
  if (LEAD.test(t)) {
    t = t.replace(LEAD, '');
    big = true;
  }
  if (/\s!$/.test(t)) {
    t = t.replace(/\s*!$/, '');
    big = true;
  }
  const parts = t.split(WHENSEP);
  const r = parseDeadline(parts[0].trim(), now);
  if (!r.ok) return { kind: 'bad', err: r.err };
  const steps = parts
    .slice(1)
    .map(x => x.trim())
    .filter(x => x);
  return { kind: 'say', date: r.date, steps, big };
}
