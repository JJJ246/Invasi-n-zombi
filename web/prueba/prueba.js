// Prueba visual: los barrios pintados por Higgsfield con vecinos que caminan por sus calles, se contagian y se vacunan.
// El movimiento sigue lo que se usa en juegos de multitudes:
// - cada persona sigue su ruta por las calles con un punto que va unos pasos delante (las esquinas salen en curva);
// - cada una tiene su carril en la vereda y lo cambia para no chocar (la separación nunca la saca de la calle);
// - velocidad propia, con aceleración y frenado; pausas en los destinos y charlas cuando se cruzan;
// - el ciclo de pasos avanza con la distancia recorrida, así los pies no patinan.
import { MAPAS } from './mapas.js';
import { loadGrid, snap, findPath, cellCenter, isWalkable } from './navegacion.js';

const IMG = (n) => { const i = new Image(); i.src = `../img/prueba/${n}.webp`; return i; };
const art = { zombi: IMG('zombi'), dengue: IMG('dengue'), vacunado: IMG('vacunado') };
// Ciclos de caminata sacados de un video (fondo verde recortado): cuántos cuadros tiene cada tira.
const WALK = { sano: { img: IMG('camina_sano'), n: 17, cycle: 0.045 }, zombi: { img: IMG('camina_zombi'), n: 19, cycle: 0.03 } };
// Seis vecinos distintos para que el barrio no parezca lleno de clones (el primero camina con su ciclo animado).
const LOOKS = ['sano', 'estudiante', 'abuela', 'pescador', 'vendedora', 'obrero'];
const LOOK_IMG = Object.fromEntries(LOOKS.map((n) => [n, IMG(n)]));
const maps = Object.fromEntries(Object.keys(MAPAS).map((k) => [k, IMG(`mapa_${k}`)]));

const AR = 1920 / 1086; // ancho / alto de las imágenes de los barrios: las distancias se miden sin deformar
const LANE = 0.011; // medio ancho de la vereda, en unidades del alto de la imagen
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
let mapKey = 'tarqui';
let mode = 'zombi';
let people = [];
let mosquitoes = [];
let gloom = 0;
let grid = null; // dónde se puede caminar en el barrio actual
let places = []; // celdas de los destinos (casa, mercado, colegio…)
const grids = {};
let overlay = null;

// ---------- Rutas ----------
// Una ruta como línea con sus largos acumulados, para pedir "el punto a s del inicio".
function polyline(cells) {
  const pts = cells.map((i) => { const [x, y] = cellCenter(grid, i); return [x * AR, y]; });
  const acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, acc, len: acc.at(-1) };
}
function pointAt(pl, s) {
  s = Math.max(0, Math.min(pl.len, s));
  let k = 1;
  while (k < pl.acc.length - 1 && pl.acc[k] < s) k++;
  const a = pl.pts[k - 1];
  const b = pl.pts[k] ?? a;
  const seg = pl.acc[k] - pl.acc[k - 1] || 1;
  const t = (s - pl.acc[k - 1]) / seg;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
}
// Punto de la ruta con la esquina redondeada y corrido al carril de la persona.
function target(pl, s, lane) {
  const r = 0.03;
  const [x0, y0] = pointAt(pl, s - r);
  const [x1, y1, dx, dy] = pointAt(pl, s);
  const [x2, y2] = pointAt(pl, s + r);
  const x = (x0 + x1 * 2 + x2) / 4;
  const y = (y0 + y1 * 2 + y2) / 4;
  const ox = x - dy * lane * LANE;
  const oy = y + dx * lane * LANE;
  // Si el carril cae fuera de la vereda (una esquina angosta), se camina por el medio.
  return isWalkable(grid, ox / AR, oy) ? [ox, oy, dx] : [x, y, dx];
}

// ---------- Vecinos ----------
async function spawn() {
  const key = mapKey;
  grids[key] ??= await loadGrid(`../img/prueba/paso_${key}.png`);
  if (key !== mapKey) return; // cambiaron de barrio mientras cargaba
  grid = grids[key];
  overlay = null;
  const m = MAPAS[key];
  // Si una zona caminable no se une con otra (una avenida sin cruce), cada vecino pasea dentro de la suya.
  places = m.lugares.map((n) => snap(grid, m.puntos[n][0] / 100, m.puntos[n][1] / 100)).filter((i) => i >= 0);
  people = Array.from({ length: 48 }, (_, k) => {
    const near = places[k % places.length];
    const [cx, cy] = cellCenter(grid, near);
    const cell = snap(grid, cx + (Math.random() - 0.5) * 0.22, cy + (Math.random() - 0.5) * 0.16);
    if (grid.comp[cell] !== grid.comp[near]) return null; // repartidos por el barrio, pero en la misma zona
    const [x, y] = cellCenter(grid, cell);
    const p = { cell, x: x * AR, y, pl: null, s: 0, lane: Math.random() * 2 - 1, laneGoal: 0, speed: 0,
      cruise: 0.022 + Math.random() * 0.016, look: LOOKS[k % LOOKS.length], state: 'sano', since: 0, wait: Math.random() * 6, chat: 0, chatCool: 8 + Math.random() * 10, phase: Math.random() * 20, flip: Math.random() < 0.5, sway: Math.random() * 6 };
    p.laneGoal = p.lane;
    return p;
  }).filter(Boolean);
  mosquitoes = [];
  gloom = 0;
}
function pickTrip(p) {
  for (let tries = 0; tries < 6; tries++) {
    const mine = places.filter((c) => grid.comp[c] === grid.comp[p.cell]);
    if (mine.length < 2) break;
    const to = mine[Math.floor(Math.random() * mine.length)];
    if (to === p.cell) continue;
    const cells = findPath(grid, p.cell, to);
    if (!cells || cells.length < 2) continue;
    p.pl = polyline(cells);
    p.s = 0;
    p.dest = to;
    return;
  }
  p.wait = 3 + Math.random() * 4;
}

function update(dt, now) {
  const sickNow = (p) => p.state === 'zombi' || p.state === 'enfermo';
  for (const p of people) {
    p.chatCool -= dt;
    if (p.chat > 0) { p.chat -= dt; p.speed *= 0.85; continue; }
    if (p.wait > 0) { p.wait -= dt; p.speed *= 0.85; continue; }
    if (!p.pl) { pickTrip(p); continue; }
    // Velocidad: cada uno la suya; más lento si está enfermo; frena al llegar.
    const left = p.pl.len - p.s;
    const want = p.cruise * (p.state === 'zombi' ? 0.45 : p.state === 'enfermo' ? 0.55 : 1) * Math.min(1, left / 0.04 + 0.25);
    p.speed += (want - p.speed) * Math.min(1, dt * 2.5);
    p.s += p.speed * dt;
    // Cambiar de carril si alguien va delante muy cerca (sin salir de la vereda).
    p.lane += (p.laneGoal - p.lane) * Math.min(1, dt * 1.5);
    const [tx, ty, dx] = target(p.pl, p.s, p.lane);
    // La posición sigue al punto con un poco de inercia: el giro sale suave.
    p.x += (tx - p.x) * Math.min(1, dt * 6);
    p.y += (ty - p.y) * Math.min(1, dt * 6);
    if (Math.abs(dx) > 0.25) p.flip = dx < 0;
    p.phase += p.speed * dt;
    if (left <= 0.002) { p.cell = p.dest; p.pl = null; p.wait = 2 + Math.random() * 5; }
  }
  // Separación y charlas: se miran solo los vecinos cercanos.
  for (let i = 0; i < people.length; i++) {
    const a = people[i];
    for (let j = i + 1; j < people.length; j++) {
      const b = people[j];
      const d = Math.hypot(a.x - b.x, (a.y - b.y) * 1.8);
      if (d > 0.03) continue;
      if (d < 0.014 && a.pl && b.pl) {
        // El que viene detrás se corre al otro lado de la vereda.
        a.laneGoal = Math.max(-1, Math.min(1, a.lane + (a.lane >= b.lane ? 0.8 : -0.8)));
      }
      // Dos vecinos sanos que se cruzan a veces se paran a conversar.
      if (!sickNow(a) && !sickNow(b) && a.speed > 0.012 && b.speed > 0.012 && a.chatCool <= 0 && b.chatCool <= 0 && a.chat <= 0 && b.chat <= 0 && Math.random() < dt * 0.25) {
        a.chat = b.chat = 3 + Math.random() * 3;
        a.chatCool = b.chatCool = 25;
        a.flip = b.x < a.x;
        b.flip = a.x < b.x;
      }
    }
  }
  // Contagio: un zombi muerde a quien está muy cerca; en el dengue, el mosquito pica.
  const sick = people.filter(sickNow);
  for (const s of sick) {
    for (const p of people) {
      if (p.state !== 'sano') continue;
      const near = Math.hypot(p.x - s.x, (p.y - s.y) * 1.8) < (mode === 'zombi' ? 0.03 : 0.02);
      if (near && Math.random() < dt * (mode === 'zombi' ? 1.2 : 0.4)) { p.state = 'mordido'; p.since = now; }
    }
  }
  for (const p of people) {
    if (p.state === 'mordido' && now - p.since > 3) { p.state = mode === 'zombi' ? 'zombi' : 'enfermo'; p.since = now; }
    else if (sickNow(p) && now - p.since > 25) { p.state = 'vacunado'; p.recovered = true; }
  }
  // Mosquitos del dengue: vuelan entre las personas.
  if (mode === 'dengue') {
    while (mosquitoes.length < Math.min(24, 4 + sick.length * 3)) mosquitoes.push({ x: Math.random() * AR, y: 0.4 + Math.random() * 0.5, tx: 0, ty: 0, t: 0 });
    for (const m of mosquitoes) {
      m.t -= dt;
      if (m.t <= 0) { const who = people[Math.floor(Math.random() * people.length)]; m.tx = who.x; m.ty = who.y - 0.04; m.t = 1.5 + Math.random() * 2; }
      m.x += (m.tx - m.x) * dt * 1.2 + Math.sin(now * 13 + m.ty * 50) * 0.002;
      m.y += (m.ty - m.y) * dt * 1.2 + Math.cos(now * 11 + m.tx * 40) * 0.0015;
    }
  } else mosquitoes = [];
  // La neblina sube con los enfermos y se va cuando el barrio se vacuna.
  gloom += (Math.min(1, (sick.length / people.length) * 2.5) - gloom) * Math.min(1, dt * 0.8);
}

// ---------- Dibujo ----------
let mouse = [0.5, 0.5];
addEventListener('pointermove', (e) => (mouse = [e.clientX / innerWidth, e.clientY / innerHeight]));
const cam = { x: 0.5, y: 0.5 };
let showStreets = false;

function draw(now) {
  const W = (canvas.width = Math.round(innerWidth * Math.min(2, devicePixelRatio)));
  const H = (canvas.height = Math.round(innerHeight * Math.min(2, devicePixelRatio)));
  const img = maps[mapKey];
  if (!img.naturalWidth || !grid) return;
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.08;
  const iw = img.naturalWidth * scale;
  const ih = img.naturalHeight * scale;
  cam.x += (mouse[0] - cam.x) * 0.03;
  cam.y += (mouse[1] - cam.y) * 0.03;
  const ox = (W - iw) * cam.x;
  const oy = (H - ih) * cam.y;
  ctx.drawImage(img, ox, oy, iw, ih);
  const tint = mode === 'zombi' ? [70, 140, 60] : [150, 110, 30];
  ctx.fillStyle = `rgba(${tint[0] * 0.3}, ${tint[1] * 0.3}, ${tint[2] * 0.3}, ${gloom * 0.45})`;
  ctx.fillRect(0, 0, W, H);
  const toScreen = (x, y) => [ox + (x / AR) * iw, oy + y * ih];
  if (showStreets) {
    // Lo caminable, en celeste sobre el barrio.
    if (!overlay) {
      overlay = document.createElement('canvas');
      overlay.width = grid.w;
      overlay.height = grid.h;
      const o = overlay.getContext('2d');
      const d = o.createImageData(grid.w, grid.h);
      for (let i = 0; i < grid.walk.length; i++) if (grid.walk[i]) { d.data[i * 4 + 1] = 255; d.data[i * 4 + 2] = 220; d.data[i * 4 + 3] = 110; }
      o.putImageData(d, 0, 0);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(overlay, ox, oy, iw, ih);
    ctx.imageSmoothingEnabled = true;
  }
  for (const p of [...people].sort((a, b) => a.y - b.y)) {
    const [sx, sy] = toScreen(p.x, p.y);
    // Un poco más grandes los que están más cerca de la cámara.
    const h = iw * 0.04 * (0.85 + 0.3 * p.y);
    const moving = p.speed > 0.004;
    let sprite = null;
    let frame = null;
    const walk = p.state === 'zombi' ? WALK.zombi : p.state === 'sano' && p.look === 'sano' ? WALK.sano : null;
    if (walk && walk.img.naturalWidth) {
      const fw = walk.img.naturalWidth / walk.n;
      const k = moving ? Math.floor((p.phase / walk.cycle) * walk.n) % walk.n : 0;
      sprite = walk.img;
      frame = [k * fw, 0, fw, walk.img.naturalHeight];
    } else {
      sprite = p.state === 'zombi' ? art.zombi : p.state === 'enfermo' ? art.dengue : p.state === 'vacunado' && p.recovered ? art.vacunado : LOOK_IMG[p.look];
    }
    if (!sprite?.naturalWidth) continue;
    const sw = frame ? frame[2] : sprite.naturalWidth;
    const sh = frame ? frame[3] : sprite.naturalHeight;
    const w = (sw / sh) * h;
    // Los que no tienen ciclo animado se balancean al caminar; quietos, respiran.
    const bob = !frame && moving ? Math.abs(Math.sin((p.phase / 0.02) * Math.PI)) * h * 0.03 : 0;
    const breathe = !moving ? Math.sin(now * 1.6 + p.sway) * h * 0.006 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, w * 0.4, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    const ring = { mordido: '#ffd166', zombi: '#ff5a5f', enfermo: '#ff5a5f', vacunado: '#7fd3f7' }[p.state];
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = Math.max(1.5, h * 0.03); ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.5, h * 0.1, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.save();
    ctx.translate(sx, sy - bob + breathe);
    if (p.flip) ctx.scale(-1, 1);
    if (!frame && p.state === 'zombi') ctx.rotate(Math.sin(now * 2 + p.sway) * 0.05);
    if (frame) ctx.drawImage(sprite, ...frame, -w / 2, -h, w, h);
    else ctx.drawImage(sprite, -w / 2, -h, w, h);
    ctx.restore();
    // Burbuja de charla.
    if (p.chat > 0 && Math.sin(now * 3 + p.sway) > 0.2) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `${Math.round(h * 0.22)}px Inter, sans-serif`;
      ctx.fillText('…', sx - h * 0.05, sy - h * 1.08);
    }
  }
  for (const m of mosquitoes) {
    const [mx, my] = toScreen(m.x, m.y);
    const s = iw * 0.004;
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(mx, my, s, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(220,230,255,0.6)';
    ctx.lineWidth = 1;
    const flap = Math.sin(now * 60) * s;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - s * 1.4, my - flap); ctx.moveTo(mx, my); ctx.lineTo(mx + s * 1.4, my - flap); ctx.stroke();
  }
  for (let j = 0; j < 4; j++) {
    const fx = ((now * 0.015 * (j + 1) + j * 0.31) % 1.4 - 0.2) * W;
    const fy = H * (0.55 + 0.12 * j);
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.45);
    g.addColorStop(0, `rgba(${tint.join(',')}, ${0.04 + gloom * 0.22})`);
    g.addColorStop(1, `rgba(${tint.join(',')}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${0.35 + gloom * 0.3})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  $('nS').textContent = people.filter((p) => p.state === 'sano').length;
  $('nI').textContent = people.filter((p) => p.state !== 'sano' && p.state !== 'vacunado').length;
  $('nV').textContent = people.filter((p) => p.state === 'vacunado').length;
}

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  update(dt, t / 1000);
  draw(t / 1000);
  requestAnimationFrame(frame);
}

// ---------- Botones ----------
$('mapas').innerHTML = Object.entries(MAPAS).map(([k, m]) => `<button type="button" data-map="${k}"${k === mapKey ? ' class="on"' : ''}>${m.nombre}</button>`).join('');
$('mapas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-map]');
  if (!b) return;
  mapKey = b.dataset.map;
  document.querySelectorAll('[data-map]').forEach((x) => x.classList.toggle('on', x === b));
  spawn();
});
for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
    spawn();
  });
}
$('brote').addEventListener('click', () => {
  const now = performance.now() / 1000;
  const first = people.filter((p) => p.state === 'sano')[Math.floor(Math.random() * 10)];
  if (first) { first.state = mode === 'zombi' ? 'zombi' : 'enfermo'; first.since = now; }
});
// El plan del Comité: vacuna primero a quienes están cerca de un enfermo (el anillo), nunca a un enfermo.
$('plan').addEventListener('click', () => {
  const sick = people.filter((p) => p.state === 'zombi' || p.state === 'enfermo' || p.state === 'mordido');
  const healthy = people.filter((p) => p.state === 'sano');
  const dist = (p) => Math.min(...sick.map((s) => Math.hypot(p.x - s.x, p.y - s.y)), 9);
  healthy.sort((a, b) => dist(a) - dist(b)).slice(0, 12).forEach((p) => (p.state = 'vacunado'));
});
$('calles').addEventListener('click', () => { showStreets = !showStreets; $('calles').classList.toggle('on', showStreets); });
$('corte').addEventListener('click', () => {
  const v = $('cut');
  v.src = mode === 'zombi' ? '../img/zombi.mp4' : '../img/prueba/mosquito.mp4';
  v.classList.remove('out');
  v.hidden = false;
  v.currentTime = 0;
  v.play().catch(() => (v.hidden = true));
  v.onended = () => { v.classList.add('out'); setTimeout(() => (v.hidden = true), 600); };
});

spawn();
requestAnimationFrame(frame);
