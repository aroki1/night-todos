/* framebuffer.js — the grain framebuffer.
   Every visible thing in the sky is a value written here; nothing smooth is drawn over it.
   Geometry is live: every importer sees GW/SH/… change when the viewport changes. */
import { TONE, H, tn8 } from './math.js';
import { BGPIX, FLAGS } from './tokens.js';
import * as pf from './stageprof.js';

export let dpr = 1, P = 3, D = 2;
export let GW = 404, SH = 196, ROWS = 216, N = GW * SH;
export let UW = GW * 3, UH = ROWS * 3, BARY = SH * 3;
export let cv = null, ctx = null, img = null, u32 = null;
let glc = null, gl = null, gprog = null, gtex = null, gtx3 = null, g2 = false, gu32 = null, gu8 = null, guSize = null, guH = null;   // GPU presenter (see initGL); gl === null means the 2D path

export let BR, BG, BB;                 // composed light
export let SR, SG, SB;                 // sky gradient
export let CR, CG, CB;                 // gradient + clouds
export let OR, OG, OB;                 // old base (crossfade)
export let SBR, SBG, SBB, AGR, AGG, AGB, PROF;

function alloc() {
  const n = N;
  BR = new Float32Array(n); BG = new Float32Array(n); BB = new Float32Array(n);
  SR = new Float32Array(n); SG = new Float32Array(n); SB = new Float32Array(n);
  CR = new Float32Array(n); CG = new Float32Array(n); CB = new Float32Array(n);
  OR = new Float32Array(n); OG = new Float32Array(n); OB = new Float32Array(n);
  SBR = new Float32Array(n); SBG = new Float32Array(n); SBB = new Float32Array(n);
  AGR = new Float32Array(n); AGG = new Float32Array(n); AGB = new Float32Array(n);
  PROF = new Float32Array(SH);
}
alloc();

export const LM = [1, 1, 1];                 // layer multipliers (time of day, moon)
export const skyResets = [];
export function onSkyReset(fn) { skyResets.push(fn); }

export const geometryListeners = [];
let geometryVersion = 0;
export const getGeometryVersion = () => geometryVersion;

export function initCanvas(canvas) {
  cv = canvas;
  ctx = cv.getContext('2d');
  if (FLAGS.gl) initGL();
}

/* GPU presenter: an offscreen WebGL canvas draws the grains (one texel per grain, expanded to P x P with a D x D dot in the shader) and blit() copies it into #c with drawImage;
   text and the bar are drawn on #c as before. Any failure leaves gl === null and blit() uses the 2D putImageData path. */
const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FS = 'precision highp float;uniform sampler2D t;uniform vec4 s;uniform float h;uniform vec3 bg;' +   // s = (GW, SH, P, D), h = GL canvas height in device px
  'void main(){float px=floor(gl_FragCoord.x),py=h-1.-floor(gl_FragCoord.y);' +
  'vec2 c=floor((vec2(px,py)+.5)/s.z),o=vec2(px,py)-c*s.z;' +
  'if(o.x<s.w&&o.y<s.w&&c.y<s.y)gl_FragColor=vec4(texture2D(t,(c+.5)/s.xy).rgb,1.);else gl_FragColor=vec4(bg,1.);}';
/* WebGL2: BR/BG/BB go up as R32F textures and the shader does the TONE lookup (mirrors blit2d: v<=0 or NaN -> 0, v>=1 -> 255, else TONE[floor(v*4096)]) */
const VS2 = '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FS2 = '#version 300 es\nprecision highp float;precision highp sampler2D;uniform sampler2D tr,tg,tb,tl;uniform vec4 s;uniform float h;uniform vec3 bg;out vec4 o;' +
  'float tm(float v){return v>=1.?1.:v>0.?texelFetch(tl,ivec2(int(floor(v*4096.)),0),0).r:0.;}' +
  'void main(){float px=floor(gl_FragCoord.x),py=h-1.-floor(gl_FragCoord.y);' +
  'vec2 c=floor((vec2(px,py)+.5)/s.z),d=vec2(px,py)-c*s.z;' +
  'if(d.x<s.w&&d.y<s.w&&c.y<s.y){ivec2 q=ivec2(c);o=vec4(tm(texelFetch(tr,q,0).r),tm(texelFetch(tg,q,0).r),tm(texelFetch(tb,q,0).r),1.);}else o=vec4(bg,1.);}';
function initGL() {
  try {
    glc = document.createElement('canvas');
    
    const at = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' };
    gl = glc.getContext('webgl2', at); g2 = !!gl;
    if (!gl) gl = glc.getContext('webgl', at);
    if (!gl) throw new Error('no webgl');
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    gprog = gl.createProgram();
    gl.attachShader(gprog, sh(gl.VERTEX_SHADER, g2 ? VS2 : VS)); gl.attachShader(gprog, sh(gl.FRAGMENT_SHADER, g2 ? FS2 : FS));
    gl.bindAttribLocation(gprog, 0, 'a'); gl.linkProgram(gprog);
    if (!gl.getProgramParameter(gprog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(gprog));
    gl.useProgram(gprog);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const mkTex = unit => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
    if (g2) {
      gtx3 = [mkTex(0), mkTex(1), mkTex(2)];
      mkTex(3); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 4096, 1, 0, gl.RED, gl.UNSIGNED_BYTE, TONE.subarray(0, 4096));   // TONE never changes: uploaded once
      gl.activeTexture(gl.TEXTURE0);
      ['tr', 'tg', 'tb', 'tl'].forEach((n, i) => gl.uniform1i(gl.getUniformLocation(gprog, n), i));
    } else { gtex = mkTex(0); gl.uniform1i(gl.getUniformLocation(gprog, 't'), 0); }
    guSize = gl.getUniformLocation(gprog, 's'); guH = gl.getUniformLocation(gprog, 'h');
    gl.uniform3f(gl.getUniformLocation(gprog, 'bg'), (BGPIX & 255) / 255, ((BGPIX >> 8) & 255) / 255, ((BGPIX >> 16) & 255) / 255);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    glc.addEventListener('webglcontextlost', e => { e.preventDefault(); dropGL(); });
  } catch (e) { dropGL(); }
}
function dropGL() {                                                    // no GL, or it was lost: the 2D path takes over for good
  glc = gl = gprog = gtex = gtx3 = gu32 = gu8 = null; g2 = false;
  if (cv && !img) allocImg();
}
function allocImg() { img = ctx.createImageData(GW * P, SH * P); u32 = new Uint32Array(img.data.buffer); u32.fill(BGPIX); }

/* gw/sh are in grains; barRows in grains. ratio is devicePixelRatio. */
export function configure(gw, sh, barRows, ratio) {
  GW = Math.max(1, Math.round(gw)); SH = Math.max(1, Math.round(sh)); ROWS = SH + barRows;
  N = GW * SH; UW = GW * 3; UH = ROWS * 3; BARY = SH * 3;
  dpr = ratio; P = Math.max(3, Math.round(3 * dpr)); D = P - Math.max(1, Math.round(dpr));
  alloc();
  if (cv) {
    cv.width = GW * P; cv.height = ROWS * P;
    cv.style.width = (cv.width / dpr) + 'px'; cv.style.height = (cv.height / dpr) + 'px';
    if (gl) {
      const gcw = cv.width, gch = SH * P; glc.width = gcw; glc.height = gch;
      gl.viewport(0, 0, gcw, gch);
      if (g2) for (let i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, gtx3[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, GW, SH, 0, gl.RED, gl.FLOAT, null); }
      else { gl.bindTexture(gl.TEXTURE_2D, gtex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, SH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gu32 = new Uint32Array(GW * SH); gu32.fill(BGPIX); gu8 = new Uint8Array(gu32.buffer); }
      gl.uniform4f(guSize, GW, SH, P, D); gl.uniform1f(guH, gch); img = u32 = null;
    } else allocImg();
  }
  geometryVersion++;
  for (const fn of geometryListeners) fn();
}

export function add(i, j, c, w) {
  if (i < 0 || j < 0 || i >= GW || j >= SH || w <= 0) return;
  const k = j * GW + i; BR[k] += c[0] * w; BG[k] += c[1] * w; BB[k] += c[2] * w;
}
export function over(i, j, c, a) {
  if (i < 0 || j < 0 || i >= GW || j >= SH || a <= 0) return;
  const k = j * GW + i; a = a > 1 ? 1 : a;
  BR[k] += (c[0] - BR[k]) * a; BG[k] += (c[1] - BG[k]) * a; BB[k] += (c[2] - BB[k]) * a;
}
/* bilinear splat by fractional position: anything that moves glides across grains */
export function splat(fx, fy, c, w) {
  const i = Math.floor(fx), j = Math.floor(fy); let u = fx - i, v = fy - j;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  add(i, j, c, w * (1 - u) * (1 - v)); add(i + 1, j, c, w * u * (1 - v));
  add(i, j + 1, c, w * (1 - u) * v); add(i + 1, j + 1, c, w * u * v);
}
export function halo(fx, fy, c, peak, sig, rad) {
  if (peak <= .002) return;
  const r = Math.ceil(rad), i0 = Math.round(fx), j0 = Math.round(fy), k2 = 1 / (2 * sig * sig), r2 = rad * rad;
  for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
    const d2 = (i - fx) * (i - fx) + (j - fy) * (j - fy); if (d2 > r2) continue;
    add(i, j, c, peak * Math.exp(-d2 * k2));
  }
}
/* one ring of light: profile exp(-d^2/0.45), per-grain sparkle */
export function ring(cx, cy, rad, b, col) {
  if (b <= .002) return;
  const ri = Math.ceil(rad + 2);
  for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) {
    const d = Math.abs(Math.sqrt(i * i + j * j) - rad); if (d < 1.6) add(cx + i, cy + j, col, b * Math.exp(-d * d / .45) * (.6 + .4 * H(cx + i, cy + j)));
  }
}
/* terminal-style cell background: x0..x1, y0..y1 half-open; outermost ring is feathered */
export function dimRect(x0, y0, x1, y1, vis) {
  const f0 = 1 - (1 - .75) * vis, f1 = 1 - (1 - .625) * vis, fi = 1 - (1 - .5) * vis;
  for (let j = Math.max(0, y0); j < Math.min(SH, y1); j++) for (let i = Math.max(0, x0); i < Math.min(GW, x1); i++) {
    const e = Math.min(i - x0, x1 - 1 - i, j - y0, y1 - 1 - j), f = e === 0 ? f0 : e === 1 ? f1 : fi, k = j * GW + i;
    BR[k] *= f; BG[k] *= f; BB[k] *= f;
  }
}

/* grains to the screen: GL path = tone-map one RGBA texel per grain, upload, draw; 2D path below */
export function blit() {
  if (!gl) return blit2d();
  if (g2) {
    for (let i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, gtx3[i]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GW, SH, gl.RED, gl.FLOAT, i === 0 ? BR : i === 1 ? BG : BB); }
    if (pf.on) pf.mark('blit.paint');
    return present();
  }
  const px = gu32, br = BR, bg = BG, bb = BB, lut = TONE;
  for (let k = 0; k < N; k++) {
    const r = br[k], g = bg[k], b = bb[k];
    px[k] = (255 << 24) | ((b <= 0 ? 0 : b >= 1 ? 255 : lut[(b * 4096) | 0]) << 16) |
      ((g <= 0 ? 0 : g >= 1 ? 255 : lut[(g * 4096) | 0]) << 8) | (r <= 0 ? 0 : r >= 1 ? 255 : lut[(r * 4096) | 0]);
  }
  if (pf.on) pf.mark('blit.paint');
  gl.bindTexture(gl.TEXTURE_2D, gtex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GW, SH, gl.RGBA, gl.UNSIGNED_BYTE, gu8);
  present();
}
function present() {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(glc, 0, 0);                              // GPU-to-GPU copy into #c: one canvas, so the page composites exactly as the 2D path does (stacked canvases differed by +-1..8 at fractional dpr)
  if (pf.on) pf.mark('blit.put');
}

/* dev: RGBA of the device pixel at the top-left of grain (x, y), whichever path drew it */
export function dotPixel(x, y) {
  if (!gl) return Array.from(ctx.getImageData(x * P, y * P, 1, 1).data);
  if (g2) { const k = y * GW + x; return [tn8(BR[k]), tn8(BG[k]), tn8(BB[k]), 255]; }
  const v = gu32[y * GW + x]; return [v & 255, (v >> 8) & 255, (v >> 16) & 255, 255];
}
export const glActive = () => !!gl;

/* grains to device pixels, drawn 1:1 (2D path) */
function blit2d() {
  const W = GW * P, br = BR, bg = BG, bb = BB, px = u32, d = D, pp = P, lut = TONE;
  for (let j = 0; j < SH; j++) {
    const row = j * pp * W;
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i, r = br[k], g = bg[k], b = bb[k];
      const p = (255 << 24) | ((b <= 0 ? 0 : b >= 1 ? 255 : lut[(b * 4096) | 0]) << 16) |
        ((g <= 0 ? 0 : g >= 1 ? 255 : lut[(g * 4096) | 0]) << 8) | (r <= 0 ? 0 : r >= 1 ? 255 : lut[(r * 4096) | 0]);
      const o = row + i * pp;
      for (let dy = 0; dy < d; dy++) { const oo = o + dy * W; for (let dx = 0; dx < d; dx++) px[oo + dx] = p; }
    }
  }
  if (pf.on) pf.mark('blit.paint');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(img, 0, 0);
  if (pf.on) pf.mark('blit.put');
}
export function glLose() { const e = gl && gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); return !!e; }   // dev: test the context-loss fallback
