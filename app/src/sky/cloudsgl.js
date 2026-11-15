/* sky/cloudsgl.js — the cloud field on the GPU (default; ?gpuclouds=0 forces the CPU path). Same formula as cloudRows in clouds.js, one half-res grid per refresh.
   The noise hash stays in JS doubles: the CPU fills one lattice table per field and octave (12 tables, one R32F atlas), the shader only interpolates.
   Nothing here sees absolute coordinates: the table origin and the fraction of cell 0 are computed in doubles and passed as uniforms.
   Uses the WebGL2 context of framebuffer.js (never a second canvas) and restores every GL state it touches. Any failure is permanent: ok() turns false and clouds.js uses the CPU. */
import { H } from '../math.js';
import { glCtx } from '../framebuffer.js';

const SC = [420, 230, 600],
  FK = [1, 2.03, 2.03 * 2.03, 2.03 * 2.03 * 2.03]; // field scales (w, n, m), octave frequencies
const WX = [0, 1.6 / 0.94, 0],
  WY = [0, 0.8 / 0.94, 0]; // how far the warp can push the lookup (n only)
const NT = 12,
  ATLAS_UNIT = 4;
const VS = '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FS =
  '#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;' +
  'uniform sampler2D tab;uniform vec2 org[12];uniform vec2 dd[12];uniform ivec4 tb[12];uniform float fk[4];uniform vec3 ca,cb;uniform float bary;out vec4 o;' +
  'float vn(int q,vec2 r){vec2 fl=floor(r),f=r-fl,s=f*f*(3.-2.*f);ivec4 t=tb[q];ivec2 i=clamp(ivec2(fl),ivec2(0),t.zw-2)+t.xy;' +
  'float a=texelFetch(tab,i,0).r,b=texelFetch(tab,i+ivec2(1,0),0).r,c=texelFetch(tab,i+ivec2(0,1),0).r,d=texelFetch(tab,i+ivec2(1,1),0).r;' +
  'return a+(b-a)*s.x+(c-a)*s.y+(a-b-c+d)*s.x*s.y;}' +
  'float fb(int q,vec2 cell,vec2 wp){float v=0.,a=.5;for(int k=0;k<4;k++){v+=a*vn(q+k,org[q+k]+cell*dd[q+k]+wp*fk[k]);a*=.5;}return v/.94;}' +
  'float sm(float e0,float e1,float v){float t=clamp((v-e0)/(e1-e0),0.,1.);return t*t*(3.-2.*t);}' +
  'void main(){vec2 cell=floor(gl_FragCoord.xy);float w=fb(0,cell,vec2(0.));float n=fb(4,cell,w*vec2(1.6,.8));float m=fb(8,cell,vec2(0.));' +
  'float a=sm(.5,.86,n)*(.55+.45*m)*sm(-10.,bary*.9,bary-cell.y*6.+40.)*.3;if(a<1e-5)a=0.;o=vec4(mix(ca,cb,sm(.35,.65,m))*a,1.);}';

let HW = 1,
  HH = 1,
  dirty = true,
  dead = '',
  everOk = false,
  gen = 0;
let gl = null,
  prog = null,
  vao = null,
  fbo = null,
  rtex = null,
  atlas = null,
  pbo = null,
  fence = null,
  fenceGen = -1,
  rbuf = null;
let U = null,
  atW = 1,
  atH = 1;
let tabs = [],
  org = new Float32Array(2 * NT),
  dd = new Float32Array(2 * NT),
  tb = new Int32Array(4 * NT);
export const stats = { tableBuilds: 0, tableTexels: 0, tableMs: 0, renders: 0 };

export const why = () => dead;
export function resize(hw, hh) {
  HW = Math.max(1, hw);
  HH = Math.max(1, hh);
  dirty = true;
  gen++;
  dropFence();
} // sync objects die with the old buffers
export function drop() {
  gen++;
  dropFence();
}
function dropFence() {
  if (fence && gl) {
    try {
      gl.deleteSync(fence);
    } catch (e) {
      /* context gone */
    }
  }
  fence = null;
}

function fail(msg) {
  dead = msg;
  gl = null;
  return false;
}
function sh(type, src) {
  const o = gl.createShader(type);
  gl.shaderSource(o, src);
  gl.compileShader(o);
  if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
  return o;
}

function init() {
  const c = glCtx();
  if (!c || !c.g2) return fail(everOk ? 'lost' : 'no webgl2');
  gl = c.gl;
  if (gl.isContextLost()) return fail('lost');
  if (!gl.getExtension('EXT_color_buffer_float')) return fail('no float target');
  const sv = {
    vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    arr: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    prog: gl.getParameter(gl.CURRENT_PROGRAM),
    fb: gl.getParameter(gl.FRAMEBUFFER_BINDING),
    at: gl.getParameter(gl.ACTIVE_TEXTURE)
  };
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'a');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    U = {};
    for (const n of ['tab', 'org', 'dd', 'tb', 'fk', 'ca', 'cb', 'bary'])
      U[n] = gl.getUniformLocation(prog, n + (['org', 'dd', 'tb', 'fk'].includes(n) ? '[0]' : ''));
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);
    gl.uniform1i(U.tab, ATLAS_UNIT);
    gl.uniform1fv(U.fk, new Float32Array(FK));
    atlas = gl.createTexture();
    rtex = gl.createTexture();
    fbo = gl.createFramebuffer();
    pbo = gl.createBuffer();
    gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
      [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]
    ])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.bindTexture(gl.TEXTURE_2D, null);
    dirty = true;
  } catch (e) {
    restore(sv);
    return fail('gl error: ' + ((e && e.message) || e));
  }
  restore(sv);
  everOk = true;
  return true;
}
function restore(s) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
  gl.useProgram(s.prog);
  gl.bindVertexArray(s.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, s.arr);
  gl.activeTexture(s.at);
}
/* (re)allocate everything that depends on HW x HH: the render target, the read buffers, the lattice windows and the atlas */
function realloc() {
  gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, rtex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, HW, HH, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('float framebuffer incomplete');
  gl.bindTexture(gl.TEXTURE_2D, null);
  rbuf = new Float32Array(HW * HH * 4);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, rbuf.byteLength, gl.STREAM_READ);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  tabs = [];
  atW = 1;
  atH = 0;
  for (let q = 0; q < NT; q++) {
    const f = q >> 2,
      k = q & 3,
      nx = Math.ceil((((HW - 1) * 6) / SC[f]) * FK[k] + WX[f] * FK[k]) + 3,
      ny = Math.ceil((((HH - 1) * 6) / SC[f]) * FK[k] + WY[f] * FK[k]) + 3;
    tabs.push({ nx, ny, yo: atH, d: new Float32Array(nx * ny), ix0: NaN, iy0: NaN, off: NaN });
    atW = Math.max(atW, nx);
    atH += ny;
    dd[q * 2] = dd[q * 2 + 1] = (6 / SC[f]) * FK[k];
    tb[q * 4] = 0;
    tb[q * 4 + 1] = tabs[q].yo;
    tb[q * 4 + 2] = nx;
    tb[q * 4 + 3] = ny;
  }
  gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, atlas);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, atW, atH, 0, gl.RED, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.useProgram(prog);
  gl.uniform4iv(U.tb, tb);
  gl.uniform2fv(U.dd, dd);
  dirty = false;
}

export function ok() {
  if (dead) return false;
  if (!gl) {
    if (!init()) return false;
  } else if (gl.isContextLost() || !glCtx()) return fail('lost');
  return true;
}

/* draw the grid for sky time t into the render target. off = sky.off, ca/cb = cloud colours, bary = BARY. Returns false on any failure. */
export function render(t, off, ca, cb, bary) {
  if (!ok()) return false;
  const sv = {
    vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    arr: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    prog: gl.getParameter(gl.CURRENT_PROGRAM),
    fb: gl.getParameter(gl.FRAMEBUFFER_BINDING),
    at: gl.getParameter(gl.ACTIVE_TEXTURE),
    vp: gl.getParameter(gl.VIEWPORT)
  };
  try {
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    if (dirty) realloc();
    /* lattice origins in doubles; a table is rebuilt only when its origin (or the sky offset) moved */
    const sw = 0.3 * Math.sin(t * 0.05),
      t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let built = false;
    gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    for (let q = 0; q < NT; q++) {
      const f = q >> 2,
        k = q & 3,
        fk = FK[k],
        tab = tabs[q];
      const bx = (f === 0 ? (t * 3) / 420 + sw : f === 1 ? (t * 3) / 230 : (t * 3) / 600 - t * 0.002) * fk,
        by = f === 1 ? -t * 0.004 * fk : 0;
      const ix0 = Math.floor(bx),
        iy0 = Math.floor(by),
        o = off + (f === 1 ? 31 : f === 2 ? 57 : 0);
      org[q * 2] = bx - ix0;
      org[q * 2 + 1] = by - iy0;
      if (tab.ix0 !== ix0 || tab.iy0 !== iy0 || tab.off !== o) {
        const d = tab.d,
          nx = tab.nx,
          ny = tab.ny;
        for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) d[b * nx + a] = H(ix0 + a + o, iy0 + b);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, tab.yo, nx, ny, gl.RED, gl.FLOAT, d);
        tab.ix0 = ix0;
        tab.iy0 = iy0;
        tab.off = o;
        built = true;
        stats.tableBuilds++;
        stats.tableTexels += nx * ny;
      }
    }
    if (built) stats.tableMs += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    gl.uniform2fv(U.org, org);
    gl.uniform3f(U.ca, ca[0], ca[1], ca[2]);
    gl.uniform3f(U.cb, cb[0], cb[1], cb[2]);
    gl.uniform1f(U.bary, bary);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, HW, HH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    stats.renders++;
  } catch (e) {
    gl.bindTexture(gl.TEXTURE_2D, null);
    restore(sv);
    gl.viewport(sv.vp[0], sv.vp[1], sv.vp[2], sv.vp[3]);
    return fail('gl error: ' + ((e && e.message) || e));
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  restore(sv);
  gl.viewport(sv.vp[0], sv.vp[1], sv.vp[2], sv.vp[3]);
  return true;
}
function pack(src, dst) {
  for (let i = 0, n = HW * HH; i < n; i++) {
    dst[i * 3] = src[i * 4];
    dst[i * 3 + 1] = src[i * 4 + 1];
    dst[i * 3 + 2] = src[i * 4 + 2];
  }
}
const bindFb = () => {
  const p = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  return p;
};
/* frozen / forced frames: block on the read (still frames only) */
export function readSync(dst) {
  if (!ok()) return false;
  const p = bindFb();
  gl.readPixels(0, 0, HW, HH, gl.RGBA, gl.FLOAT, rbuf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, p);
  pack(rbuf, dst);
  return true;
}
/* live frames: queue the read into a pack buffer and a fence; readPoll later takes it without waiting */
export function readStart() {
  if (!ok()) return false;
  const p = bindFb();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
  gl.readPixels(0, 0, HW, HH, gl.RGBA, gl.FLOAT, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, p);
  dropFence();
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  fenceGen = gen;
  gl.flush();
  return !!fence;
}
/* 0 = not ready, 1 = packed into dst, -1 = nothing in flight or failed (caller restarts) */
export function readPoll(dst) {
  if (!ok() || !fence || fenceGen !== gen) {
    dropFence();
    return -1;
  }
  const r = gl.clientWaitSync(fence, 0, 0);
  if (r === gl.TIMEOUT_EXPIRED) return 0;
  gl.deleteSync(fence);
  fence = null;
  if (r === gl.WAIT_FAILED) return -1;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
  gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rbuf);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  pack(rbuf, dst);
  return 1;
}
export function error() {
  return gl ? gl.getError() : -1;
}
