// Portada: 1) una película que el scroll recorre cuadro a cuadro, con la narración encima;
// 2) el motor real simulando un brote en vivo sobre el mapa satelital; 3) los números.
import { DEFAULTS } from './engine/config.js';
import { CALIBRATION } from './engine/calibration.js';

const $ = (id) => document.getElementById(id);
const fmt = (x) => Math.round(x).toLocaleString('es-EC');
const clamp = (x) => Math.max(0, Math.min(1, x));

// ---------- 1. La película ----------
// Fluidez a 60 fps: (1) cada cuadro se decodifica antes de necesitarlo (ImageBitmap, fuera del hilo
// principal), así dibujar nunca bloquea; (2) entre dos cuadros se hace un fundido, así el movimiento
// es continuo aunque el scroll avance de a poco; (3) solo se redibuja cuando algo cambió.
const FRAMES = 432;
const AHEAD = 24; // cuadros decodificados por delante y por detrás de lo que se ve
const film = $('film');
const fc = $('filmCanvas');
const fctx = fc.getContext('2d', { alpha: false });
const frames = new Array(FRAMES); // imágenes descargadas (comprimidas)
const bitmaps = new Map(); // cuadro → ImageBitmap listo para dibujar
const decoding = new Set();
let target = 0; // cuadro que pide el scroll
let shown = 0; // cuadro que se ve (se acerca suave al pedido)
let drawnAt = -1;
let firstReady = false;

// Orden de carga: primero 1 de cada 8 cuadros (la película ya se puede recorrer), luego 1 de cada 4, luego el resto.
const order = [];
const queued = new Uint8Array(FRAMES);
for (const step of [8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) if (!queued[i]) (queued[i] = 1), order.push(i);
let next = 0;
function loadMore() {
  if (next >= order.length) return;
  const i = order[next++];
  const img = new Image();
  img.onload = () => {
    frames[i] = img;
    if (next >= Math.ceil(FRAMES / 8)) $('filmLoading').style.opacity = 0;
    if (Math.abs(i - shown) <= AHEAD) decodeAround();
    loadMore();
  };
  img.onerror = loadMore;
  img.src = `film/${String(i).padStart(3, '0')}.webp`;
}
for (let k = 0; k < 6; k++) loadMore(); // 6 descargas en paralelo

// Mantiene decodificados los cuadros cercanos y libera la memoria de los lejanos.
function decodeAround() {
  const c = Math.round(shown);
  for (const [k, bmp] of bitmaps) {
    if (Math.abs(k - c) > AHEAD * 1.5) {
      bmp.close?.();
      bitmaps.delete(k);
    }
  }
  for (let d = 0; d <= AHEAD; d++) {
    for (const k of [c + d, c - d]) {
      if (k < 0 || k >= FRAMES || !frames[k] || bitmaps.has(k) || decoding.has(k)) continue;
      decoding.add(k);
      createImageBitmap(frames[k])
        .then((bmp) => {
          decoding.delete(k);
          if (Math.abs(k - shown) > AHEAD * 1.5) return bmp.close?.();
          bitmaps.set(k, bmp);
          drawnAt = -1;
        })
        .catch(() => decoding.delete(k));
    }
  }
}

// El cuadro decodificado más cercano a i (hacia atrás primero, para no adelantarse a la historia).
function nearestBitmap(i) {
  for (let d = 0; d < FRAMES; d++) {
    if (bitmaps.has(i - d)) return i - d;
    if (bitmaps.has(i + d)) return i + d;
  }
  return -1;
}

// El lienzo usa la resolución de la película (1280 px), no la de la pantalla: menos píxeles que pintar.
let cover = null;
function sizeFilm() {
  const w = Math.min(1600, fc.clientWidth);
  fc.width = Math.round(w);
  fc.height = Math.round((w * fc.clientHeight) / Math.max(1, fc.clientWidth));
  cover = null;
  drawnAt = -1;
}
new ResizeObserver(sizeFilm).observe(fc);

function blit(bmp, alpha) {
  if (!cover) {
    // "cover": la imagen llena la pantalla sin deformarse.
    const s = Math.max(fc.width / bmp.width, fc.height / bmp.height);
    const w = bmp.width * s;
    const h = bmp.height * s;
    cover = [(fc.width - w) / 2, (fc.height - h) / 2, w, h];
  }
  fctx.globalAlpha = alpha;
  fctx.drawImage(bmp, ...cover);
}

function drawFilm() {
  if (Math.abs(shown - drawnAt) < 0.004) return;
  const a = Math.floor(shown);
  const t = shown - a;
  const ka = bitmaps.has(a) ? a : nearestBitmap(a);
  if (ka < 0) return;
  drawnAt = shown;
  blit(bitmaps.get(ka), 1);
  // Fundido con el cuadro siguiente: el paso entre cuadros no se nota.
  if (ka === a && t > 0.02 && bitmaps.has(a + 1)) blit(bitmaps.get(a + 1), t);
  fctx.globalAlpha = 1;
  if (!firstReady) {
    firstReady = true;
    $('filmLoading').style.opacity = 0;
  }
}

const caps = [...document.querySelectorAll('.cap')].map((el) => ({ el, from: +el.dataset.from, to: +el.dataset.to, o: -1 }));
const bar = $('filmBar');
const hint = $('scrollHint');
let filmVisible = true;
function onFilmScroll() {
  const r = film.getBoundingClientRect();
  filmVisible = r.bottom > 0;
  const p = clamp(-r.top / Math.max(1, r.height - innerHeight));
  target = p * (FRAMES - 1);
  bar.style.transform = `scaleX(${p})`;
  hint.style.opacity = p > 0.02 ? 0 : 1;
  const fade = 0.025;
  for (const c of caps) {
    const o = Math.round(clamp((p - c.from) / fade) * clamp((c.to - p) / fade) * 100) / 100;
    if (o === c.o) continue; // solo se toca el estilo cuando cambia
    c.o = o;
    c.el.style.opacity = o;
    c.el.style.transform = `translate3d(0, ${(1 - o) * 18}px, 0)`;
    c.el.style.visibility = o ? 'visible' : 'hidden';
  }
}

let lastT = performance.now();
let lastDecode = -1;
function filmLoop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (filmVisible) {
    // Suavizado que no depende de los fps de la pantalla (60, 120 o 144 Hz se ven igual).
    shown += (target - shown) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - shown) < 0.002) shown = target;
    if (Math.round(shown) !== lastDecode) {
      lastDecode = Math.round(shown);
      decodeAround();
    }
    drawFilm();
  }
  requestAnimationFrame(filmLoop);
}
addEventListener('scroll', onFilmScroll, { passive: true });
addEventListener('resize', onFilmScroll);
onFilmScroll();
requestAnimationFrame(filmLoop);

// ---------- 2. El motor en vivo ----------
// Política que el optimizador elige en el escenario base (docs/resultados.md).
const BASE_POLICY = { priority: 'anillo', closures: true, quarantine: true, reserve: 0.5, fumigation: false };
const canvas = $('heroMap');
const ctx = canvas.getContext('2d');
let trace = null;
let world = 'nada';
let day = 0;
let bg = null;
let px = null;
let py = null;
const mapImg = new Image();
mapImg.src = 'img/manta-satelite.jpg';
mapImg.onload = () => resize();

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  const W = canvas.width;
  const H = canvas.height;
  const aspect = trace?.layout.aspect ?? mapImg.naturalWidth / mapImg.naturalHeight;
  const scale = Math.max(W / aspect, H);
  const mw = scale * aspect;
  const mh = scale;
  const ox = (W - mw) / 2 + (W > 900 * dpr ? W * 0.12 : 0); // a la derecha, para dejar sitio al texto
  const oy = (H - mh) / 2;
  bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  const b = bg.getContext('2d');
  b.fillStyle = '#06050c';
  b.fillRect(0, 0, W, H);
  if (mapImg.complete && mapImg.naturalWidth) b.drawImage(mapImg, ox, oy, mw, mh);
  b.fillStyle = 'rgba(6, 5, 12, 0.5)';
  b.fillRect(0, 0, W, H);
  if (trace) {
    px = new Float32Array(trace.N);
    py = new Float32Array(trace.N);
    for (let i = 0; i < trace.N; i++) {
      px[i] = ox + trace.layout.x[i] * mw;
      py[i] = oy + trace.layout.y[i] * mh;
    }
  }
  canvas.dpr = dpr;
  draw();
}
new ResizeObserver(resize).observe(canvas);

const LAYERS = [
  { code: 0, color: 'rgba(74, 222, 128, 0.35)', size: 1.6 },
  { code: 3, color: 'rgba(96, 165, 250, 0.55)', size: 1.8 },
  { code: 4, color: 'rgba(45, 212, 191, 0.9)', size: 2.2 },
  { code: 1, color: '#facc15', size: 2.2 },
];

function draw() {
  if (!bg) return;
  ctx.drawImage(bg, 0, 0);
  if (!trace || !px) return;
  const N = trace.N;
  const frame = trace[world].frames.subarray(day * N, (day + 1) * N);
  const k = canvas.dpr * Math.max(1, canvas.width / (1400 * canvas.dpr));
  for (const { code, color, size } of LAYERS) {
    ctx.fillStyle = color;
    const s = size * k;
    for (let i = 0; i < N; i++) if ((frame[i] & 7) === code) ctx.fillRect(px[i] - s / 2, py[i] - s / 2, s, s);
  }
  // Los zombis brillan: halo rojo con mezcla aditiva.
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255, 40, 40, 0.16)';
  for (let i = 0; i < N; i++) if ((frame[i] & 7) === 2) ctx.fillRect(px[i] - 7 * k, py[i] - 7 * k, 14 * k, 14 * k);
  ctx.fillStyle = '#ff5050';
  for (let i = 0; i < N; i++) if ((frame[i] & 7) === 2) ctx.fillRect(px[i] - 1.8 * k, py[i] - 1.8 * k, 3.6 * k, 3.6 * k);
  ctx.globalCompositeOperation = 'source-over';
}

function updateHud() {
  $('hDay').textContent = day;
  $('liveTitle').textContent = `Manta, día ${day}`;
  $('hBitten').textContent = fmt(trace[world].cumulative[day] * trace.scale);
  $('hBitten').className = world === 'nada' ? 'red' : 'green';
  $('hWorldLabel').textContent = world === 'nada' ? 'Si nadie hace nada' : 'Con el plan del Comité';
}

// Días tranquilos rápido; el estallido más lento para que se vea.
const daysPerSecond = () => (trace[world].I[day] < trace.N * 0.01 ? 18 : 6);
let last = 0;
let acc = 0;
let hold = 0;
let visible = false;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (trace && visible) {
    if (day >= trace.days) {
      hold += dt;
      if (hold > 3) [hold, acc, day] = [0, 0, 0];
    } else {
      acc += dt * daysPerSecond();
      const n = Math.min(trace.days, Math.floor(acc));
      if (n !== day) {
        day = n;
        draw();
        updateHud();
      }
    }
  }
  requestAnimationFrame(tick);
}

// La simulación arranca solo cuando el lector llega a esta sección.
let started = false;
new IntersectionObserver(([e]) => {
  visible = e.isIntersecting;
  if (!visible || started) return;
  started = true;
  const worker = new Worker('./worker.js', { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type !== 'hero') return;
    trace = data.trace;
    worker.terminate();
    resize();
    updateHud();
    $('worldBtn').disabled = false;
    $('heroNote').textContent = `Simulación real en tu navegador: ${fmt(trace.N)} personas; cada una representa a ${fmt(trace.scale)} habitantes de Manta.`;
    requestAnimationFrame((t) => {
      last = t;
      tick(t);
    });
  };
  worker.postMessage({ type: 'hero', config: { ...DEFAULTS }, policy: BASE_POLICY });
}, { rootMargin: '300px' }).observe($('motor'));

$('worldBtn').addEventListener('click', () => {
  world = world === 'nada' ? 'adaptativa' : 'nada';
  $('worldBtn').textContent = world === 'nada' ? 'Ver con el plan del Comité' : 'Ver sin hacer nada';
  [day, acc, hold] = [0, 0, 0];
  draw();
  updateHud();
});

// ---------- 3. Los números ----------
// Brote sorpresa: % de brotes que despegan en que el plan gana al azar (docs/resultados.md, 200 corridas).
const SCENARIOS = [
  ['Valores por defecto', 94],
  ['El doble de contagioso', 89],
  ['La mitad de vacunas', 96],
  ['Empieza en otro mercado', 96],
  ['Empieza en un colegio', 100],
  ['La vacuna protege a medias', 94],
  ['Se actúa 10 días tarde', 100],
  ['La mitad del presupuesto', 96],
  ['Todo junto (el peor caso)', 67],
];
$('bars').innerHTML = SCENARIOS.map(([name, pct]) => `<div class="bar${pct < 80 ? ' warn' : ''}"><span>${name}</span><i><b data-w="${pct}"></b></i><em>${pct} %</em></div>`).join('');

// Calibración: barras = casos reales del MSP; línea = el modelo.
(function drawCalibration() {
  const svg = $('calib');
  const obs = CALIBRATION.observed;
  const mod = CALIBRATION.model;
  const W = 520, H = 220, pad = 28;
  const max = Math.max(...obs, ...mod) * 1.1;
  const bw = (W - 2 * pad) / obs.length;
  const y = (v) => H - pad - (v / max) * (H - 2 * pad);
  const bars = obs.map((v, i) => `<rect x="${pad + i * bw + 1}" y="${y(v)}" width="${bw - 2}" height="${H - pad - y(v)}" fill="#ff8a1f" opacity="0.75"/>`).join('');
  const line = mod.map((v, i) => `${i ? 'L' : 'M'}${pad + i * bw + bw / 2},${y(v)}`).join('');
  svg.innerHTML = `${bars}<path d="${line}" fill="none" stroke="#4ade80" stroke-width="3"/>
    <text x="${pad}" y="18" fill="#a39cc4" font-size="12">Dengue en Manabí 2024 · casos por semana</text>
    <rect x="${W - 200}" y="8" width="10" height="10" fill="#ff8a1f"/><text x="${W - 185}" y="17" fill="#ece8ff" font-size="12">Reales (MSP)</text>
    <rect x="${W - 100}" y="12" width="14" height="3" fill="#4ade80"/><text x="${W - 82}" y="17" fill="#ece8ff" font-size="12">Modelo</text>`;
})();

const countUp = (el) => {
  const goal = Number(el.dataset.count);
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / 1400);
    el.textContent = fmt(goal * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('visible');
    e.target.querySelectorAll('[data-count]').forEach(countUp);
    e.target.querySelectorAll('[data-w]').forEach((b) => (b.style.width = `${b.dataset.w}%`));
    io.unobserve(e.target);
  }
}, { threshold: 0.2 });
document.querySelectorAll('.section').forEach((s) => io.observe(s));
