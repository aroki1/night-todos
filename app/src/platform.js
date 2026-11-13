/* platform.js — web vs Tauri detection, storage and notification adapters. */
import { fmtLeft } from './sky/clock.js';

const KEY = 'night-sky:v1';
export const isTauri = typeof window !== 'undefined' && !!window.__TAURI__;
let storeHandle = null;

async function tauriStore() {
  if (!isTauri || !window.__TAURI__.store) return null;
  if (!storeHandle) storeHandle = await window.__TAURI__.store.load('night-sky.json', { autoSave: false });
  return storeHandle;
}

export async function loadStore() {
  try {
    const st = await tauriStore();
    if (st) {
      const raw = await st.get('data');
      return typeof raw === 'string' ? JSON.parse(raw) : (raw || null);
    }
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    // corrupt data: keep a copy, start empty, never crash
    try {
      if (isTauri) {
        const st = await tauriStore();
        const raw = st ? await st.get('data') : null;
        if (raw) localStorage.setItem(KEY + ':corrupt:' + Date.now(), typeof raw === 'string' ? raw : JSON.stringify(raw));
      } else {
        const s = localStorage.getItem(KEY);
        if (s) localStorage.setItem(KEY + ':corrupt:' + Date.now(), s);
      }
      localStorage.removeItem(KEY);
    } catch (_) { /* start empty */ }
    return null;
  }
}

export async function saveStore(obj) {
  const text = JSON.stringify(obj);
  try {
    const st = await tauriStore();
    if (st) { await st.set('data', text); await st.save(); return; }
    localStorage.setItem(KEY, text);
  } catch (_) { /* storage may be full or blocked; the sky still works */ }
}

/* ---------- desktop notifications (one per task, never on web) ---------- */
const notifiedUrgent = new Set(), notifiedMissed = new Set();

export async function notifyUrgent(task, now) {
  if (!isTauri || !window.__TAURI__.notification || notifiedUrgent.has(task.id)) return;
  const left = fmtLeft(task.deadline - now);
  notifiedUrgent.add(task.id);
  await send(task.title + ' — ' + left + ' left');
}
export async function notifyMissed(task) {
  if (!isTauri || !window.__TAURI__.notification || notifiedMissed.has(task.id)) return;
  notifiedMissed.add(task.id);
  await send(task.title + ' — missed');
}
async function send(body) {
  try {
    const n = window.__TAURI__.notification;
    let ok = await n.isPermissionGranted();
    if (!ok) ok = (await n.requestPermission()) === 'granted';
    if (ok) await n.sendNotification({ title: 'Night Sky', body });
  } catch (_) { /* notifications are a bonus */ }
}
