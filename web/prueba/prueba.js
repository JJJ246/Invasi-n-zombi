// Prueba visual: el barrio pintado por Higgsfield con personas que caminan por sus calles, se contagian y se vacunan.
// Las coordenadas van de 0 a 1 sobre la imagen del barrio (1920 x 1086).

const IMG = (n) => { const i = new Image(); i.src = `../img/prueba/${n}.webp`; return i; };
const art = { barrio: IMG('barrio'), zombi: IMG('zombi'), dengue: IMG('dengue'), vacunado: IMG('vacunado') };
// Seis vecinos distintos para que el barrio no parezca lleno de clones.
const LOOKS = ['sano', 'estudiante', 'abuela', 'pescador', 'vendedora', 'obrero'].map(IMG);

// Calles del barrio como un grafo pequeño: puntos y con quién se conectan.
const P = {
  casasA: [0.30, 0.90], calleA: [0.47, 0.78], calleB: [0.62, 0.67], parada: [0.66, 0.59], cruce: [0.77, 0.53],
  colegio: [0.69, 0.40], casasB: [0.84, 0.69], mercadoCalle: [0.41, 0.62], mercado: [0.33, 0.55], playa: [0.21, 0.42],
};
const EDGES = [['casasA', 'calleA'], ['calleA', 'calleB'], ['calleB', 'parada'], ['parada', 'cruce'], ['cruce', 'colegio'], ['cruce', 'casasB'], ['calleA', 'mercadoCalle'], ['mercadoCalle', 'mercado'], ['mercado', 'playa']];
const NEXT = {};
for (const [a, b] of EDGES) { (NEXT[a] ??= []).push(b); (NEXT[b] ??= []).push(a); }
const PLACES = ['casasA', 'casasB', 'mercado', 'colegio', 'parada', 'playa'];
// Camino más corto entre dos lugares (búsqueda en anchura).
function route(from, to) {
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const p = queue.shift();
    if (p === to) break;
    for (const q of NEXT[p]) if (!(q in prev)) { prev[q] = p; queue.push(q); }
  }
  const path = [];
  for (let p = to; p; p = prev[p]) path.unshift(p);
  return path;
}

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
let mode = 'zombi';
let people = [];
let mosquitoes = [];
let gloom = 0;

function spawn() {
  people = Array.from({ length: 46 }, (_, k) => {
    const home = k % 2 ? 'casasA' : 'casasB';
    const jitter = [(Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.06];
    return { home, at: home, path: [], x: P[home][0] + jitter[0], y: P[home][1] + jitter[1], jitter, look: LOOKS[k % LOOKS.length], speed: 0.02 + Math.random() * 0.025, state: 'sano', since: 0, wait: Math.random() * 3, flip: false };
  });
  mosquitoes = [];
}

function pickTrip(p) {
  const to = PLACES[Math.floor(Math.random() * PLACES.length)];
  p.path = route(p.at, to).slice(1);
  p.wait = 1 + Math.random() * 3;
}

function update(dt, now) {
  for (const p of people) {
    if (p.wait > 0) { p.wait -= dt; continue; }
    if (!p.path.length) { pickTrip(p); continue; }
    const target = P[p.path[0]];
    const tx = target[0] + p.jitter[0] * 0.8;
    const ty = target[1] + p.jitter[1] * 0.8;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    // Los zombis y los enfermos caminan más lento.
    const v = p.speed * (p.state === 'zombi' ? 0.45 : p.state === 'enfermo' ? 0.6 : 1) * dt;
    if (d < v) { p.at = p.path.shift(); p.x = tx; p.y = ty; if (!p.path.length) p.wait = 2 + Math.random() * 4; }
    else { p.x += (dx / d) * v; p.y += (dy / d) * v; p.flip = dx < 0; }
  }
  // Contagio: un zombi muerde a quien está muy cerca; en el dengue, el mosquito pica.
  const sick = people.filter((p) => p.state === 'enfermo' || p.state === 'zombi');
  for (const s of sick) {
    for (const p of people) {
      if (p.state !== 'sano') continue;
      const near = Math.hypot(p.x - s.x, (p.y - s.y) * 1.6) < (mode === 'zombi' ? 0.025 : 0.015);
      if (near && Math.random() < dt * (mode === 'zombi' ? 1.6 : 0.5)) { p.state = 'mordido'; p.since = now; }
    }
  }
  for (const p of people) {
    if (p.state === 'mordido' && now - p.since > 3) { p.state = mode === 'zombi' ? 'zombi' : 'enfermo'; p.since = now; }
    else if ((p.state === 'zombi' || p.state === 'enfermo') && now - p.since > 22) { p.state = 'vacunado'; p.recovered = true; }
  }
  // Mosquitos del dengue: vuelan entre los enfermos y los demás.
  if (mode === 'dengue') {
    while (mosquitoes.length < Math.min(24, 4 + sick.length * 3)) mosquitoes.push({ x: Math.random(), y: 0.5 + Math.random() * 0.4, tx: 0, ty: 0, t: 0 });
    for (const m of mosquitoes) {
      m.t -= dt;
      if (m.t <= 0) { const who = people[Math.floor(Math.random() * people.length)]; m.tx = who.x; m.ty = who.y - 0.03; m.t = 1.5 + Math.random() * 2; }
      m.x += (m.tx - m.x) * dt * 1.2 + Math.sin(now * 13 + m.ty * 50) * 0.0015;
      m.y += (m.ty - m.y) * dt * 1.2 + Math.cos(now * 11 + m.tx * 40) * 0.0015;
    }
  } else mosquitoes = [];
  // La neblina sube con los enfermos y se va cuando el barrio se vacuna.
  const share = sick.length / people.length;
  gloom += (Math.min(1, share * 2.5) - gloom) * Math.min(1, dt * 0.8);
}

// Cámara: el barrio llena la pantalla y se mueve un poco con el mouse.
let mouse = [0.5, 0.5];
addEventListener('pointermove', (e) => (mouse = [e.clientX / innerWidth, e.clientY / innerHeight]));
const cam = { x: 0.5, y: 0.5 };

function draw(now) {
  const W = (canvas.width = Math.round(innerWidth * Math.min(2, devicePixelRatio)));
  const H = (canvas.height = Math.round(innerHeight * Math.min(2, devicePixelRatio)));
  const img = art.barrio;
  if (!img.naturalWidth) return;
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.08;
  const iw = img.naturalWidth * scale;
  const ih = img.naturalHeight * scale;
  cam.x += (mouse[0] - cam.x) * 0.03;
  cam.y += (mouse[1] - cam.y) * 0.03;
  const ox = (W - iw) * cam.x;
  const oy = (H - ih) * cam.y;
  ctx.drawImage(img, ox, oy, iw, ih);
  // Tinte del brote: verde para los zombis, ámbar húmedo para el dengue.
  const tint = mode === 'zombi' ? [70, 140, 60] : [150, 110, 30];
  ctx.fillStyle = `rgba(${tint[0] * 0.3}, ${tint[1] * 0.3}, ${tint[2] * 0.3}, ${gloom * 0.45})`;
  ctx.fillRect(0, 0, W, H);
  const toScreen = (x, y) => [ox + x * iw, oy + y * ih];
  // Personas, de atrás hacia adelante.
  const h = iw * 0.045;
  for (const p of [...people].sort((a, b) => a.y - b.y)) {
    const sprite = p.state === 'zombi' ? art.zombi : p.state === 'enfermo' ? art.dengue : p.state === 'vacunado' && !p.recovered ? p.look : p.state === 'vacunado' ? art.vacunado : p.look;
    if (!sprite.naturalWidth) continue;
    const [sx, sy] = toScreen(p.x, p.y);
    const w = (sprite.naturalWidth / sprite.naturalHeight) * h;
    const walking = p.wait <= 0 && p.path.length;
    const bob = walking ? Math.abs(Math.sin(now * (p.state === 'zombi' ? 4 : 8) + p.jitter[0] * 100)) * h * 0.04 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, w * 0.45, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // Anillo de estado en el piso: amarillo mordido, rojo enfermo, azul vacunado.
    const ring = { mordido: '#ffd166', zombi: '#ff5a5f', enfermo: '#ff5a5f', vacunado: '#7fd3f7' }[p.state];
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = Math.max(1.5, h * 0.03); ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.55, h * 0.11, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.save();
    ctx.translate(sx, sy - bob);
    if (p.flip) ctx.scale(-1, 1);
    if (p.state === 'zombi') ctx.rotate(Math.sin(now * 2 + p.jitter[1] * 90) * 0.05);
    ctx.drawImage(sprite, -w / 2, -h, w, h);
    ctx.restore();
  }
  for (const m of mosquitoes) {
    const [mx, my] = toScreen(m.x, m.y);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(mx, my, h * 0.05, h * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,230,255,0.6)';
    ctx.lineWidth = 1;
    const flap = Math.sin(now * 60) * h * 0.04;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - h * 0.06, my - flap); ctx.moveTo(mx, my); ctx.lineTo(mx + h * 0.06, my - flap); ctx.stroke();
  }
  // Neblina que se mueve por abajo.
  for (let j = 0; j < 4; j++) {
    const fx = ((now * 0.015 * (j + 1) + j * 0.31) % 1.4 - 0.2) * W;
    const fy = H * (0.55 + 0.12 * j);
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.45);
    g.addColorStop(0, `rgba(${tint.join(',')}, ${0.05 + gloom * 0.22})`);
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

// Botones
for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
    spawn();
  });
}
$('brote').addEventListener('click', () => {
  const now = performance.now() / 1000;
  const first = people.filter((p) => p.state === 'sano').sort((a, b) => a.y - b.y)[0];
  if (first) { first.state = mode === 'zombi' ? 'zombi' : 'enfermo'; first.since = now; }
});
// El plan del Comité: vacuna primero a quienes están cerca de un enfermo (el anillo), nunca a un enfermo.
$('plan').addEventListener('click', () => {
  const sick = people.filter((p) => p.state === 'zombi' || p.state === 'enfermo' || p.state === 'mordido');
  const healthy = people.filter((p) => p.state === 'sano');
  const dist = (p) => Math.min(...sick.map((s) => Math.hypot(p.x - s.x, p.y - s.y)), 9);
  healthy.sort((a, b) => dist(a) - dist(b)).slice(0, 12).forEach((p) => (p.state = 'vacunado'));
});
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
