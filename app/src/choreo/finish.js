/* choreo/finish.js — the finishing moment. Pure functions of elapsed milliseconds. */
import { clamp01, seg, ease } from '../math.js';
import { TIME } from '../tokens.js';

export const ringRadius = ms => 3 + 25 * ease.out(seg(ms, 120, 900));      // one ring of light
export const igT = d => 110 + (d - 1) * 45;                                 // when the arm grain at Chebyshev d ignites
export const ignA = (d, ms) => seg(ms, igT(d), igT(d) + 60);                // alpha ramp
export const ignK = (d, ms) => seg(ms, igT(d), igT(d) + 260);               // warm -> white (40%) -> cold (100%)
export { ignA as igA, ignK as igK };

export function finishState(fin, ms) {
  const o = { reduced: fin.reduced, ms };
  if (fin.reduced) {
    const k = seg(ms, 0, 250);
    o.cc = 0; o.haloMul = 1; o.haloCold = k; o.k = k; o.ringOn = false; o.flashPeak = 0;
    o.titleK = 1; o.erased = 1e4; o.glint = k;
  } else {
    o.cc = ease.out(seg(ms, 0, 110));                                   // anticipation: contraction
    o.haloMul = 1 - .35 * o.cc;
    o.haloCold = ease.inOut(seg(ms, 110, 600));                         // wide halo warm -> cold
    const pr = seg(ms, 120, 900);
    o.ringOn = ms >= 120 && ms <= 900; o.ringR = ringRadius(ms); o.ringB = .5 * Math.pow(1 - pr, 1.3);
    const fq = ease.out(seg(ms, 120, 750));                             // core flash
    o.flashPeak = ms < 120 || ms > 750 ? 0 : ms < 160 ? .55 * seg(ms, 120, 160) : .55 * (1 - ease.out(seg(ms, 160, 750)));
    o.flashSig = 1.5 + 3.5 * fq; o.flashRad = 4 + 10 * fq;
    o.titleK = seg(ms, 300, 700); o.erased = ms < 300 ? 0 : Math.floor((ms - 300) / 28) + 1;
    o.glint = seg(ms, 330, 480);
  }
  o.pipMs = ms - fin.arriveMs;
  return o;
}

export function edgeState(fin, ms) {
  if (fin.link === null) return null;
  const o = { tailSign: 1 };
  if (fin.reduced) {
    o.lineLen = fin.path; o.mul = seg(ms, 0, 300); o.ff = 1; o.beadPeak = 0; o.bump = 0;
    o.arrHalo = 0; o.miniB = 0; o.pulseK = clamp01((ms - 300 - 1500) / 1000); return o;
  }
  const ch = fin.chargeMs, tr = fin.travelMs, ar = fin.arriveMs;
  o.lineLen = fin.path * ease.inOut(seg(ms, tr, tr + fin.D));
  o.mul = 1; o.ff = seg(ms, ar, ar + 120);
  const bq = ease.out(seg(ms, tr, tr + 250));                          // charge peak .8 (easeOut) relaxes to .55
  o.beadPeak = ms < ch ? 0 : ms < tr ? .8 * ease.out(seg(ms, ch, tr)) : ms < ar ? .8 + (.55 - .8) * bq : .55 * (1 - seg(ms, ar, ar + 120));
  o.beadSig = 1.8 + (1.5 - 1.8) * bq; o.beadRad = 6 + (5 - 6) * bq;
  o.bump = ms >= ch ? .25 * Math.sin(Math.PI * seg(ms, ch, ch + 550)) : 0;
  o.arrHalo = ms >= ar ? .3 * (1 - seg(ms, ar, ar + 380)) : 0;
  const mp = seg(ms, ar, ar + 300);
  o.miniOn = ms >= ar && ms < ar + 300; o.miniR = 2 + 7 * ease.out(mp); o.miniB = .35 * (1 - mp);
  o.pulseK = clamp01((ms - ar - 1500) / 1000);
  return o;
}
export const FINISH = { chargeMinMs: TIME.chargeMin * 1000, drawMinMs: TIME.edgeDrawMin * 1000 };
