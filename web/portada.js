// Portada: el motor real simula un brote en Manta y lo dibuja sobre el mapa satelital.
// Un botón cambia a la realidad "con el Comité": el mismo brote, otra historia.
import { DEFAULTS } from './engine/config.js';
import { CALIBRATION } from './engine/calibration.js';

const $ = (id) => document.getElementById(id);
const fmt = (x) => Math.round(x).toLocaleString('es-EC');
// Política que el optimizador elige en el escenario base (docs/resultados.md).
const BASE_POLICY = { priority: 'anillo', closures: true, quarantine: true, reserve: 0.5, fumigation: false };
// Días tranquilos rápido, el estallido más lento para que se vea.
const daysPerSecond = () => (trace[world].I[day] < trace.N * 0.01 ? 18 : 6);

// ---------- Mapa animado de la portada ----------
const canvas = $('heroMap');
const ctx = canvas.getContext('2d');
let trace = null;
let world = 'nada';
let day = 0;
let bg = null;
let px = null;
let py = null;
const img = new Image();
img.src = 'img/manta-satelite.jpg';
img.onload = () => resize();

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  const W = canvas.width;
  const H = canvas.height;
  // "cover": el mapa llena la pantalla; se corre un poco a la derecha para dejar sitio al texto.
  const aspect = trace?.layout.aspect ?? img.naturalWidth / img.naturalHeight;
  const scale = Math.max(W / aspect, H);
  const mw = scale * aspect;
  const mh = scale;
  const ox = (W - mw) / 2 + (W > 900 * dpr ? W * 0.08 : 0);
  const oy = (H - mh) / 2;
  bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  const b = bg.getContext('2d');
  b.fillStyle = '#07050f';
  b.fillRect(0, 0, W, H);
  if (img.complete && img.naturalWidth) b.drawImage(img, ox, oy, mw, mh);
  b.fillStyle = 'rgba(7, 5, 15, 0.55)';
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

// Orden de dibujo: lo tranquilo abajo, los zombis arriba con brillo.
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
  // Zombis: halo rojo con mezcla aditiva para que la plaga "brille".
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255, 40, 40, 0.16)';
  for (let i = 0; i < N; i++) if ((frame[i] & 7) === 2) ctx.fillRect(px[i] - 7 * k, py[i] - 7 * k, 14 * k, 14 * k);
  ctx.fillStyle = 'rgba(255, 60, 60, 0.35)';
  for (let i = 0; i < N; i++) if ((frame[i] & 7) === 2) ctx.fillRect(px[i] - 3 * k, py[i] - 3 * k, 6 * k, 6 * k);
  ctx.fillStyle = '#ff5050';
  for (let i = 0; i < N; i++) if ((frame[i] & 7) === 2) ctx.fillRect(px[i] - 1.8 * k, py[i] - 1.8 * k, 3.6 * k, 3.6 * k);
  ctx.globalCompositeOperation = 'source-over';
}

function updateHud() {
  const bitten = trace[world].cumulative[day] * trace.scale;
  $('hDay').textContent = day;
  const title = document.querySelector('h1.glitch');
  title.textContent = `MANTA, DÍA ${day}`;
  title.dataset.text = title.textContent;
  $('hBitten').textContent = fmt(bitten);
  $('hBitten').className = world === 'nada' ? 'red' : 'green';
  $('hWorldLabel').textContent = world === 'nada' ? 'Si nadie hace nada' : 'Con el Comité';
}

let last = 0;
let acc = 0;
let hold = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (trace) {
    if (day >= trace.days) {
      hold += dt;
      if (hold > 3) {
        hold = 0;
        acc = 0;
        day = 0;
      }
    } else {
      acc += dt * daysPerSecond();
      const next = Math.min(trace.days, Math.floor(acc));
      if (next !== day) {
        day = next;
        draw();
        updateHud();
      }
    }
  }
  requestAnimationFrame(tick);
}

const worker = new Worker('./worker.js', { type: 'module' });
worker.onmessage = ({ data }) => {
  if (data.type !== 'hero') return;
  trace = data.trace;
  worker.terminate();
  resize();
  updateHud();
  $('worldBtn').disabled = false;
  $('heroNote').textContent = `Simulación real del motor en tu navegador: ${fmt(trace.N)} personas sobre el mapa de Manta (cada una representa a ${fmt(trace.scale)}).`;
  requestAnimationFrame((t) => {
    last = t;
    tick(t);
  });
};
worker.postMessage({ type: 'hero', config: { ...DEFAULTS }, policy: BASE_POLICY });

$('worldBtn').addEventListener('click', () => {
  world = world === 'nada' ? 'adaptativa' : 'nada';
  $('worldBtn').textContent = world === 'nada' ? '🛡️ Ahora con el Comité' : '☠️ Ver sin hacer nada';
  day = 0;
  acc = 0;
  hold = 0;
  draw();
  updateHud();
});

// ---------- Secciones ----------
// Brote sorpresa: % de brotes que despegan en que la estrategia gana al azar (docs/resultados.md, 200 corridas).
const SCENARIOS = [
  ['Valores por defecto', 94],
  ['×2 contagio', 89],
  ['½ vacunas', 96],
  ['Empieza en el mercado', 96],
  ['Empieza en un colegio', 100],
  ['Vacuna cubre a medias', 94],
  ['Respuesta 10 días tarde', 100],
  ['½ presupuesto', 96],
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
  svg.innerHTML = `${bars}<path d="${line}" fill="none" stroke="#2dd4bf" stroke-width="3"/>
    <text x="${pad}" y="18" fill="#a39cc4" font-size="12">Casos por semana · SE 1–52</text>
    <rect x="${W - 210}" y="8" width="10" height="10" fill="#ff8a1f"/><text x="${W - 195}" y="17" fill="#ece8ff" font-size="12">Reales (MSP)</text>
    <rect x="${W - 110}" y="12" width="14" height="3" fill="#2dd4bf"/><text x="${W - 92}" y="17" fill="#ece8ff" font-size="12">Modelo</text>`;
})();

// ---------- Scroll ----------
// Títulos palabra por palabra: se envuelve cada palabra en un <span> con su retraso.
document.querySelectorAll('.words').forEach((h) => {
  let n = 0;
  const wrap = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part.trim()) frag.append(part);
          else {
            const w = document.createElement('span');
            w.className = 'w';
            w.style.setProperty('--i', n++);
            w.textContent = part;
            frag.append(w);
          }
        }
        child.replaceWith(frag);
      } else wrap(child);
    }
  };
  wrap(h);
});
// Retraso escalonado entre tarjetas hermanas.
document.querySelectorAll('.reveal').forEach((el) => {
  const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
  el.style.setProperty('--i', siblings.indexOf(el));
});

// Aparición de secciones, tarjetas, títulos y contadores al entrar en pantalla.
const countUp = (el) => {
  const target = Number(el.dataset.count);
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / 1400);
    el.textContent = fmt(target * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const el = e.target;
    el.classList.add(el.classList.contains('section') ? 'visible' : 'in');
    el.querySelectorAll('[data-count]').forEach(countUp);
    el.querySelectorAll('[data-w]').forEach((b) => (b.style.width = `${b.dataset.w}%`));
    io.unobserve(el);
  }
}, { threshold: 0.25 });
document.querySelectorAll('.section, .reveal, .words').forEach((el) => io.observe(el));

// Escenas: --e (entrada, abre el iris y enfoca) y --p (avance, zoom lento); frases del prólogo;
// barra de "nivel de contagio" según cuánto se ha bajado.
const scenes = [...document.querySelectorAll('.scene')];
const lines = [...document.querySelectorAll('.line')];
const clamp = (x) => Math.max(0, Math.min(1, x));
let ticking = false;
function onScroll() {
  ticking = false;
  const vh = innerHeight;
  for (const sc of scenes) {
    const r = sc.getBoundingClientRect();
    if (r.bottom < -vh || r.top > 2 * vh) continue;
    sc.style.setProperty('--e', clamp((vh - r.top) / (vh * 0.9)).toFixed(3));
    sc.style.setProperty('--p', clamp(-r.top / Math.max(1, r.height - vh)).toFixed(3));
  }
  for (const l of lines) {
    const r = l.getBoundingClientRect();
    const center = (r.top + r.height / 2) / vh; // 0 arriba · 1 abajo
    l.style.setProperty('--o', clamp(1 - Math.abs(center - 0.5) * 2.4).toFixed(3));
  }
  const total = document.documentElement.scrollHeight - vh;
  const pct = Math.round(clamp(scrollY / Math.max(1, total)) * 100);
  $('infectionBar').style.width = `${pct}%`;
  $('infectionLabel').textContent = pct >= 99 ? 'Brote contenido ✓' : `Nivel de contagio ${pct} %`;
}
addEventListener('scroll', () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(onScroll);
  }
}, { passive: true });
addEventListener('resize', onScroll);
onScroll();
