// "El barrio, de cerca": la misma corrida que los mapas, vista como un juego de vecinos en perspectiva
// isométrica. Cada figura es una persona de la simulación: vive en su casa con su familia, sale cada
// mañana a su colegio, su trabajo (a pie o en bus) o al mercado, y vuelve en la tarde. El rombo sobre
// la cabeza es su estado ese día. Lo que hace el Comité también se ve: vacunas, hogares en cuarentena,
// mercado o colegio cerrados, brigadas de fumigación.
// Las casas y las personas son las de la simulación (las más cercanas entre sí en el mapa real); la
// calle y los edificios son un dibujo esquemático, no están a escala.
import { persona } from './vecino.js';
import { CITIES } from './engine/cities.js';

const G = 18; // casillas por lado
const ROAD = 9; // la calle principal ocupa las filas 8 y 9; su centro es y = 9
const STATE_COLOR = ['#5fd38d', '#facc15', '#ff3b3b', '#60a5fa', '#2dd4bf'];
const WALLS = ['#e9b872', '#d98b74', '#8fbcd4', '#a8cf94', '#efe0a8', '#c8a6dc', '#f2a65a', '#e4c1c1'];
const ROOFS = ['#a4553a', '#8a95a3', '#b8683f', '#6f7f8f'];
const SHIRTS = ['#e85d5d', '#4f8fe8', '#f2c94c', '#5bbf8a', '#f4f4f4', '#b07be0', '#f08a3c', '#3fb8c4', '#2f3b52', '#e87fb0'];
const SKIN = ['#8d5a3b', '#a86b47', '#c68a5e', '#e0ad84'];
const PANTS = ['#2f3b52', '#3c4a63', '#5a4a3a', '#24314a'];
const ZOMBIE_SKIN = '#93b07c';
const STRATS = [
  ['nada', 'Sin hacer nada'],
  ['azar', 'Al azar'],
  ['adaptativa', 'Plan del Comité'],
];

// Lugares del barrio: edificio, patio donde se queda la gente y zona que no puede tener casas.
const PLACES = {
  mercado: { label: 'Mercado', area: { x: 10.6, y: 0.6, w: 4.8, h: 5 } },
  colegio: { label: 'Colegio', box: { x: 0.6, y: 10.6, w: 3.6, h: 2.4, z: 1.15 }, wall: '#f1e7cf', roof: '#3d6fb0', area: { x: 0.6, y: 13.4, w: 4.4, h: 3.2 } },
  trabajo: { label: 'Atunera', box: { x: 12.6, y: 12.4, w: 4, h: 2.6, z: 1.45 }, wall: '#b9c4cf', roof: '#56657a', area: { x: 12.4, y: 15.2, w: 4.6, h: 2.2 } },
};
const STALLS = [[11, 1.2], [13.2, 1.2], [11, 3.6], [13.2, 3.6]];
const STOP = { x: 15.6, y: 7.55 };

// Número pseudoaleatorio estable en [0, 1) para (a, b): la misma persona hace siempre lo mismo.
function hash(a, b = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

// Casillas para casas: en filas frente a la calle, sin pisar el mercado, el colegio ni la atunera.
function houseSlots() {
  const blocked = Object.values(PLACES).flatMap((p) => [p.area, p.box].filter(Boolean));
  const free = (x, y) => !blocked.some((b) => x < b.x + b.w + 0.3 && x + 1.3 > b.x && y < b.y + b.h + 0.3 && y + 2.2 > b.y);
  const slots = [];
  for (const bx of [0, 10]) {
    for (const ys of [[0.6, 3.1, 5.6], [10.6, 13, 15.4]]) {
      for (const y of ys) for (let k = 0; k < 4; k++) if (free(bx + 0.6 + 2 * k, y)) slots.push({ x: bx + 0.6 + 2 * k, y });
    }
  }
  // Primero las más cerca del centro del barrio.
  return slots.sort((a, b) => Math.hypot(a.x - 8.5, a.y - 8.5) - Math.hypot(b.x - 8.5, b.y - 8.5));
}
const SLOTS = houseSlots();

export class Barrio {
  constructor(root, player) {
    this.root = root;
    this.player = player;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.stratsEl = root.querySelector('.barrio-strats');
    this.clockEl = root.querySelector('.barrio-clock');
    this.nameEl = root.querySelector('.barrio-name');
    this.captionEl = root.querySelector('.barrio-caption');
    this.strategy = 'adaptativa';
    this.active = true;
    this.trace = null;
    this.hits = [];
    this.mouse = null;
    this.countsDay = -1;
    this.stratsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-strategy]');
      if (!b) return;
      this.strategy = b.dataset.strategy;
      this.countsDay = -1;
    });
    root.querySelector('.barrio-next').addEventListener('click', () => this.nextBarrio());
    this.canvas.addEventListener('click', (e) => {
      const i = this.hitAt(e);
      if (i >= 0) this.player.select(i);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse = [(e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr];
      this.canvas.style.cursor = this.hitAt(e) >= 0 ? 'pointer' : 'default';
    });
    this.canvas.addEventListener('mouseleave', () => (this.mouse = null));
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    const loop = () => {
      if (this.active && this.trace && !document.hidden) this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  load(trace, cfg, theme, terms) {
    this.trace = trace;
    this.theme = theme;
    this.terms = terms;
    this.zombie = theme === 'zombi';
    this.closeDays = cfg.closeDays;
    this.fumigationDays = cfg.fumigationDays;
    this.zones = CITIES[trace.city].zones;
    this.indexHomes();
    this.centers = this.rankCenters();
    this.centerIdx = 0;
    this.build(this.centers[0]);
  }

  setActive(on) {
    this.active = on;
    this.player.rate = on ? 1 / 15 : 1; // en el barrio un día dura más: se ve la rutina
  }

  // Hogares con su posición en el mapa real y sus integrantes.
  indexHomes() {
    const t = this.trace;
    const map = new Map();
    for (let i = 0; i < t.N; i++) {
      const h = t.people.home[i];
      if (!map.has(h)) map.set(h, { h, x: t.layout.x[i] * t.layout.aspect, y: t.layout.y[i], members: [] });
      map.get(h).members.push(i);
    }
    this.homes = [...map.values()];
    this.homeIndex = map;
  }

  nearestHomes(cx, cy, k) {
    const d = this.homes.map((h) => (h.x - cx) ** 2 + (h.y - cy) ** 2);
    return Array.from(d.keys()).sort((a, b) => d[a] - d[b]).slice(0, k).map((j) => this.homes[j]);
  }

  // Barrios con historia: muchos mordidos si nadie hace nada, muchos salvados por el plan y algo de
  // trabajo del Comité (vacunas) para ver.
  rankCenters() {
    const t = this.trace;
    const n = t.nada.story;
    const c = t.adaptativa.story;
    const score = (h) => h.members.reduce((s, i) => s + (n.infectedDay[i] >= 0) + 2 * (n.infectedDay[i] >= 0 && c.infectedDay[i] < 0) + 0.6 * (c.vaccinatedDay[i] >= 0), 0);
    const step = Math.max(1, Math.floor(this.homes.length / 160));
    const list = [];
    for (let k = 0; k < this.homes.length; k += step) {
      const h = this.homes[k];
      const near = this.nearestHomes(h.x, h.y, SLOTS.length);
      list.push({ home: h, score: near.reduce((s, x) => s + score(x), 0) });
    }
    list.sort((a, b) => b.score - a.score);
    // Que los siguientes barrios no sean casi el mismo.
    const out = [];
    for (const x of list) if (out.every((o) => Math.hypot(o.home.x - x.home.x, o.home.y - x.home.y) > 0.06)) out.push(x);
    return out.map((x) => x.home);
  }

  nextBarrio() {
    if (!this.centers?.length) return;
    this.centerIdx = (this.centerIdx + 1) % this.centers.length;
    this.build(this.centers[this.centerIdx]);
  }

  // Si eligen a alguien que no vive en este barrio, se muestra el suyo.
  focus(i) {
    if (!this.trace || this.byPerson?.has(i)) return;
    this.build(this.homeIndex.get(this.trace.people.home[i]));
  }

  build(center) {
    const t = this.trace;
    const P = t.people;
    const homes = this.nearestHomes(center.x, center.y, SLOTS.length);
    this.houses = homes.map((h, k) => {
      const s = SLOTS[k];
      const r = hash(h.h, 7);
      return { ...s, home: h.h, members: h.members, wall: pick(WALLS, r), roof: pick(ROOFS, hash(h.h, 8)), skin: pick(SKIN, hash(h.h, 9)) };
    });
    this.people = [];
    this.byPerson = new Map();
    const zoneCount = new Map();
    for (const [hk, house] of this.houses.entries()) {
      house.members.forEach((i, k) => {
        const who = persona(t, i);
        const scale = who.age < 12 ? 0.72 : who.age < 18 ? 0.86 : 1;
        const r = (n) => hash(i, n);
        const p = {
          i, house: hk, who, scale,
          role: P.role[i],
          bus: P.role[i] === 2 && P.bus[i] >= 0,
          yard: { x: house.x + 0.2 + (k % 3) * 0.32, y: house.y + 1.25 + Math.floor(k / 3) * 0.3 },
          shirt: pick(SHIRTS, r(1)), pants: pick(PANTS, r(2)), skin: house.skin,
          hair: who.age >= 65 ? '#d6d3cc' : pick(['#1d1612', '#2e2018', '#4a2f1d'], r(3)),
          j1: r(4), j2: r(5), j3: r(6),
        };
        const spot = (a) => ({ x: a.x + 0.3 + r(10) * (a.w - 0.6), y: a.y + 0.3 + r(11) * (a.h - 0.6) });
        p.dest = p.role === 1 ? spot(PLACES.colegio.area) : p.role === 2 ? (p.bus ? { x: STOP.x - 0.6 + r(12) * 1.4, y: STOP.y + 0.05 } : spot(PLACES.trabajo.area)) : spot(PLACES.mercado.area);
        this.byPerson.set(i, p);
        this.people.push(p);
        zoneCount.set(P.parroquia[i], (zoneCount.get(P.parroquia[i]) ?? 0) + 1);
      });
    }
    this.zone = [...zoneCount].sort((a, b) => b[1] - a[1])[0][0];
    this.zoneName = this.zones[this.zone];
    this.hasBus = this.people.some((p) => p.bus);
    // Palmeras en las casillas que sobran.
    this.trees = SLOTS.slice(this.houses.length).map((s) => ({ x: s.x + 0.5, y: s.y + 0.6 }));
    this.nameEl.textContent = `Un barrio de ${this.zoneName} · ${this.houses.length} casas · ${this.people.length} vecinos`;
    this.countsDay = -1;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(300, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.round(w * 0.56);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.tw = Math.min(w / 18.8, h / 10.2); // ancho de una casilla en pantalla
    this.ox = w / 2;
    this.oy = (h - 9 * this.tw) / 2 + 0.55 * this.tw;
    if (this.trace) this.ground = this.drawGround(w, h);
  }

  // Casilla (x, y) a la altura z → píxel en pantalla.
  P(x, y, z = 0) {
    return [this.ox + ((x - y) * this.tw) / 2, this.oy + ((x + y) * this.tw) / 4 - (z * this.tw) / 2];
  }

  poly(ctx, pts, fill, stroke) {
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  rect(ctx, x, y, w, h, fill) {
    this.poly(ctx, [this.P(x, y), this.P(x + w, y), this.P(x + w, y + h), this.P(x, y + h)], fill);
  }

  // El suelo no cambia: se dibuja una vez (pasto, calles, veredas, patios).
  drawGround(w, h) {
    const bg = document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    const ctx = bg.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#16202b');
    sky.addColorStop(1, '#0c1117');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // Base de tierra (el "tablero" del juego).
    this.poly(ctx, [this.P(0, G), this.P(G, G), this.P(G, G, -0.5), this.P(0, G, -0.5)], '#5b4630');
    this.poly(ctx, [this.P(G, 0), this.P(G, G), this.P(G, G, -0.5), this.P(G, 0, -0.5)], '#47361f');
    for (let x = 0; x < G; x++) {
      for (let y = 0; y < G; y++) {
        const r = hash(x * 31 + y, 3);
        this.rect(ctx, x, y, 1, 1, r < 0.5 ? '#7aa257' : r < 0.85 ? '#739951' : '#80a95d');
      }
    }
    // Veredas y calles: una horizontal (filas 8–9) y una vertical (columnas 8–9).
    this.rect(ctx, 0, 7.75, G, 2.5, '#bdb6a6');
    this.rect(ctx, 7.75, 0, 2.5, G, '#bdb6a6');
    this.rect(ctx, 0, 8, G, 2, '#4b5059');
    this.rect(ctx, 8, 0, 2, G, '#4b5059');
    ctx.lineWidth = Math.max(1, this.tw * 0.04);
    ctx.strokeStyle = '#e8d27a';
    ctx.setLineDash([this.tw * 0.25, this.tw * 0.25]);
    for (const [a, b] of [[[0, ROAD], [8, ROAD]], [[10, ROAD], [G, ROAD]], [[9, 0], [9, 8]], [[9, 10], [9, G]]]) {
      ctx.beginPath();
      ctx.moveTo(...this.P(...a));
      ctx.lineTo(...this.P(...b));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Cruce peatonal.
    for (let k = 0; k < 4; k++) this.rect(ctx, 10.15, 8.15 + k * 0.45, 0.6, 0.25, '#e8e4da');
    // Patios del colegio, la atunera y el piso del mercado.
    this.rect(ctx, PLACES.colegio.area.x, PLACES.colegio.area.y, PLACES.colegio.area.w, PLACES.colegio.area.h, '#c9b48a');
    this.rect(ctx, PLACES.trabajo.area.x, PLACES.trabajo.area.y, PLACES.trabajo.area.w, PLACES.trabajo.area.h, '#a9a49a');
    const m = PLACES.mercado.area;
    this.rect(ctx, m.x, m.y, m.w, m.h, '#c7b79a');
    // Caminitos de cada casa a la vereda.
    for (const hs of this.houses ?? []) {
      const toRoad = hs.y < ROAD ? 7.75 - (hs.y + 1) : 0;
      if (toRoad > 0) this.rect(ctx, hs.x + 0.38, hs.y + 1, 0.24, toRoad, '#cdbf9f');
      this.rect(ctx, hs.x - 0.1, hs.y + 1.05, 1.2, 0.75, '#86ad60');
    }
    // Cancha del colegio.
    const c = PLACES.colegio.area;
    ctx.strokeStyle = '#f4efe2';
    ctx.lineWidth = Math.max(1, this.tw * 0.03);
    this.poly(ctx, [this.P(c.x + 0.4, c.y + 0.4), this.P(c.x + c.w - 0.4, c.y + 0.4), this.P(c.x + c.w - 0.4, c.y + c.h - 0.4), this.P(c.x + 0.4, c.y + c.h - 0.4)], 'rgba(0,0,0,0)', '#f4efe2');
    return bg;
  }

  // Caja isométrica (casa, edificio, puesto, bus) con techo a cuatro aguas o plano.
  box(ctx, { x, y, w, h, z }, wall, roof, roofType = 'hip') {
    const P = (a, b, c) => this.P(a, b, c);
    this.poly(ctx, [P(x + w, y, 0), P(x + w, y + h, 0), P(x + w, y + h, z), P(x + w, y, z)], shade(wall, -0.22));
    this.poly(ctx, [P(x, y + h, 0), P(x + w, y + h, 0), P(x + w, y + h, z), P(x, y + h, z)], wall);
    const e = 0.08; // alero
    const [x0, y0, x1, y1] = [x - e, y - e, x + w + e, y + h + e];
    if (roofType === 'flat') {
      this.poly(ctx, [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], roof);
      this.poly(ctx, [P(x0, y1, z), P(x1, y1, z), P(x1, y1, z + 0.12), P(x0, y1, z + 0.12)], shade(roof, 0.15));
      this.poly(ctx, [P(x1, y0, z), P(x1, y1, z), P(x1, y1, z + 0.12), P(x1, y0, z + 0.12)], shade(roof, -0.15));
      return;
    }
    const top = P(x + w / 2, y + h / 2, z + 0.5 * Math.min(w, h));
    this.poly(ctx, [P(x0, y0, z), P(x1, y0, z), top], shade(roof, -0.1));
    this.poly(ctx, [P(x0, y0, z), P(x0, y1, z), top], shade(roof, -0.05));
    this.poly(ctx, [P(x1, y0, z), P(x1, y1, z), top], shade(roof, -0.3));
    this.poly(ctx, [P(x0, y1, z), P(x1, y1, z), top], shade(roof, 0.08));
  }

  // Ventana o puerta en la cara de adelante (+y) o la de la derecha (+x).
  pane(ctx, face, b, a0, a1, z0, z1, fill) {
    const P = (u, z) => (face === 'y' ? this.P(b.x + u, b.y + b.h, z) : this.P(b.x + b.w, b.y + u, z));
    this.poly(ctx, [P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], fill);
  }

  drawHouse(ctx, hs, night, quarantined) {
    const b = { x: hs.x, y: hs.y, w: 1, h: 1, z: 0.82 };
    this.box(ctx, b, hs.wall, hs.roof);
    const glass = night > 0.3 ? `rgba(255, 214, 120, ${0.5 + 0.5 * night})` : '#33485c';
    this.pane(ctx, 'y', b, 0.38, 0.62, 0, 0.5, '#6b4a33');
    this.pane(ctx, 'y', b, 0.1, 0.28, 0.32, 0.6, glass);
    this.pane(ctx, 'y', b, 0.72, 0.9, 0.32, 0.6, glass);
    this.pane(ctx, 'x', b, 0.3, 0.7, 0.32, 0.6, glass);
    if (quarantined) {
      // Cinta morada en la fachada: hogar en cuarentena.
      ctx.lineWidth = Math.max(1.5, this.tw * 0.06);
      ctx.strokeStyle = '#c084fc';
      ctx.beginPath();
      ctx.moveTo(...this.P(b.x, b.y + 1, 0.75));
      ctx.lineTo(...this.P(b.x + 1, b.y + 1, 0.1));
      ctx.moveTo(...this.P(b.x, b.y + 1, 0.1));
      ctx.lineTo(...this.P(b.x + 1, b.y + 1, 0.75));
      ctx.stroke();
    }
  }

  drawPalm(ctx, x, y, now) {
    const [bx, by] = this.P(x, y);
    const [tx, ty] = this.P(x, y, 1.5);
    const sway = Math.sin(now / 1400 + x) * this.tw * 0.04;
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = this.tw * 0.07;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + this.tw * 0.08, (by + ty) / 2, tx + sway, ty);
    ctx.stroke();
    ctx.fillStyle = '#3f8a4a';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.ellipse(tx + sway + Math.cos(a) * this.tw * 0.18, ty + Math.sin(a) * this.tw * 0.07, this.tw * 0.2, this.tw * 0.055, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawStall(ctx, x, y, k, closed) {
    const b = { x, y, w: 1.4, h: 1, z: 0.5 };
    this.box(ctx, b, '#8a6440', '#8a6440', 'flat');
    // Toldo a rayas.
    const colors = [['#e85d5d', '#f4efe2'], ['#4f8fe8', '#f4efe2'], ['#f2c94c', '#e85d5d'], ['#5bbf8a', '#f4efe2']][k % 4];
    for (let s = 0; s < 4; s++) this.poly(ctx, [this.P(x - 0.1 + s * 0.4, y - 0.1, 0.95), this.P(x + 0.3 + s * 0.4, y - 0.1, 0.95), this.P(x + 0.3 + s * 0.4, y + 1.15, 0.8), this.P(x - 0.1 + s * 0.4, y + 1.15, 0.8)], colors[s % 2]);
    if (!closed) {
      for (let s = 0; s < 3; s++) {
        const [fx, fy] = this.P(x + 0.3 + s * 0.4, y + 1, 0.55);
        ctx.fillStyle = ['#f2994a', '#6fcf97', '#eb5757'][s];
        ctx.beginPath();
        ctx.arc(fx, fy, this.tw * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Cartel con texto sobre un punto del mundo.
  sign(ctx, x, y, z, text, bg = '#1b2230', color = '#f4f4f4') {
    const [sx, sy] = this.P(x, y, z);
    const fs = Math.max(10, this.tw * 0.26);
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + fs * 0.9;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(sx - w / 2, sy - fs * 1.5, w, fs * 1.5, fs * 0.35);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, sx, sy - fs * 0.45);
    ctx.textAlign = 'start';
  }

  drawBus(ctx, x) {
    const b = { x, y: 8.25, w: 2.4, h: 0.85, z: 0.85 };
    this.box(ctx, b, '#f2c94c', '#e9e4d4', 'flat');
    for (let k = 0; k < 4; k++) this.pane(ctx, 'y', b, 0.2 + k * 0.55, 0.6 + k * 0.55, 0.42, 0.72, '#2c3e50');
    this.pane(ctx, 'x', b, 0.15, 0.7, 0.4, 0.75, '#2c3e50');
    this.pane(ctx, 'y', b, 0, 2.4, 0.18, 0.26, '#2f80ed');
  }

  // ---------- Personas ----------
  // Dónde está cada persona en este momento del día (fase 0 = medianoche, 0.5 = mediodía).
  where(p, day, phase, code, closed, now) {
    const quarantined = (code & 8) !== 0;
    const state = code & 7;
    const roaming = this.zombie && state === 2 && !quarantined;
    const night = phase < 0.2 || phase > 0.9;
    if (night) {
      if (!roaming) return null; // de noche todos en casa…
      // …menos los zombis, que vagan por la calle.
      const x = 0.5 + ((p.j1 * 17 + now / 4000) % 17);
      return { x, y: ROAD + (p.j2 - 0.5) * 1.4, walking: true, dir: 1 };
    }
    const idle = (pt, amp = 0.07) => ({ x: pt.x + amp * Math.sin(now / 900 + p.j1 * 9), y: pt.y + amp * Math.cos(now / 1100 + p.j2 * 9), walking: false, dir: Math.sin(now / 2000 + p.j3 * 6) > 0 ? 1 : -1 });
    let goes = !quarantined;
    if (p.role === 0) goes &&= hash(p.i, day) < 0.35 && !closed.mercado; // al mercado algunos días
    if (p.role === 1) goes &&= !closed.colegio;
    if (!goes) return idle(p.yard, 0.12);
    const L = 0.28 + p.j1 * 0.04;
    const B = 0.66 + p.j2 * 0.05;
    const travel = 0.045;
    if (phase < L || phase >= B + travel) return idle(p.yard);
    if (p.bus && phase > 0.335 && phase < 0.645) return null; // se fue en el bus
    const path = (from, to, f) => {
      const dir = to.x >= from.x ? 1 : -1;
      const lane = ROAD + (dir > 0 ? -0.35 : 0.35);
      const pts = [from, { x: from.x, y: lane }, { x: to.x, y: lane }, to];
      const seg = pts.slice(1).map((q, k) => Math.hypot(q.x - pts[k].x, q.y - pts[k].y));
      let d = f * seg.reduce((a, b) => a + b, 0);
      for (let k = 0; k < 3; k++) {
        if (d <= seg[k] || k === 2) {
          const u = seg[k] ? Math.min(1, d / seg[k]) : 1;
          return { x: pts[k].x + (pts[k + 1].x - pts[k].x) * u, y: pts[k].y + (pts[k + 1].y - pts[k].y) * u, walking: true, dir };
        }
        d -= seg[k];
      }
    };
    if (phase < L + travel) return path(p.yard, p.dest, (phase - L) / travel);
    if (phase < B) return idle(p.dest, p.bus ? 0.03 : 0.18);
    return path(p.dest, p.yard, (phase - B) / travel);
  }

  drawPerson(ctx, p, pos, state, now) {
    const [sx, sy] = this.P(pos.x, pos.y);
    const s = p.scale;
    const u = this.tw * 0.105 * s;
    const zombie = this.zombie && state === 2;
    const skin = zombie ? ZOMBIE_SKIN : p.skin;
    const speed = zombie ? 0.006 : 0.012;
    const swing = pos.walking ? Math.sin(now * speed + p.j1 * 10) * u * 0.45 : 0;
    const lean = zombie ? u * 0.35 * pos.dir : 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, u * 1.3, u * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'round';
    // Piernas.
    ctx.strokeStyle = p.pants;
    ctx.lineWidth = u * 0.5;
    ctx.beginPath();
    ctx.moveTo(sx - u * 0.3, sy - u * 1.6);
    ctx.lineTo(sx - u * 0.3 + swing, sy - u * 0.15);
    ctx.moveTo(sx + u * 0.3, sy - u * 1.6);
    ctx.lineTo(sx + u * 0.3 - swing, sy - u * 0.15);
    ctx.stroke();
    // Cuerpo.
    ctx.fillStyle = zombie ? shade(p.shirt, -0.35) : p.shirt;
    ctx.beginPath();
    ctx.roundRect(sx - u * 0.72 + lean * 0.5, sy - u * 3.2, u * 1.44, u * 1.8, u * 0.45);
    ctx.fill();
    // Brazos: los zombis los llevan estirados hacia adelante.
    ctx.strokeStyle = skin;
    ctx.lineWidth = u * 0.4;
    ctx.beginPath();
    if (zombie) {
      for (const k of [-1, 1]) {
        ctx.moveTo(sx + k * u * 0.6 + lean, sy - u * 2.8);
        ctx.lineTo(sx + k * u * 0.3 + pos.dir * u * 1.5 + lean, sy - u * 2.7 + k * u * 0.15);
      }
    } else {
      ctx.moveTo(sx - u * 0.75, sy - u * 2.9);
      ctx.lineTo(sx - u * 0.95 - swing * 0.6, sy - u * 1.75);
      ctx.moveTo(sx + u * 0.75, sy - u * 2.9);
      ctx.lineTo(sx + u * 0.95 + swing * 0.6, sy - u * 1.75);
    }
    ctx.stroke();
    // Cabeza y pelo.
    const hx = sx + lean;
    const hy = sy - u * 3.85;
    if (p.who.female && p.who.age >= 6 && !zombie) {
      ctx.fillStyle = p.hair;
      ctx.beginPath();
      ctx.roundRect(hx - u * 0.68, hy - u * 0.3, u * 1.36, u * 1.05, u * 0.3);
      ctx.fill();
    }
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx, hy, u * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = zombie ? '#4b5a3c' : p.hair;
    ctx.beginPath();
    ctx.arc(hx, hy - u * 0.08, u * 0.64, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    if (zombie) {
      ctx.fillStyle = '#ff2b2b';
      ctx.fillRect(hx - u * 0.32, hy, u * 0.18, u * 0.18);
      ctx.fillRect(hx + u * 0.14, hy, u * 0.18, u * 0.18);
    }
    return { sx, sy, top: sy - u * 4.6, u };
  }

  // El rombo de los Sims sobre la cabeza: el color es el estado del día.
  drawPlumbob(ctx, x, y, u, color, now, j) {
    const bob = Math.sin(now / 420 + j * 7) * u * 0.25;
    const w = u * 0.55;
    const h = u * 1.05;
    const cy = y - h - bob;
    ctx.shadowColor = color;
    ctx.shadowBlur = u * 1.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, cy - h);
    ctx.lineTo(x + w, cy);
    ctx.lineTo(x, cy + h);
    ctx.lineTo(x - w, cy);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(x, cy - h);
    ctx.lineTo(x + w, cy);
    ctx.lineTo(x, cy + h * 0.15);
    ctx.closePath();
    ctx.fill();
  }

  bubble(ctx, x, y, text, color) {
    const fs = Math.max(10, this.tw * 0.24);
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + fs * 0.9;
    const h = fs * 1.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h - fs * 0.45, w, h, h / 2);
    ctx.moveTo(x - fs * 0.3, y - fs * 0.46);
    ctx.lineTo(x, y);
    ctx.lineTo(x + fs * 0.3, y - fs * 0.46);
    ctx.fill();
    ctx.fillStyle = '#10141a';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y - fs * 0.85);
    ctx.textAlign = 'start';
  }

  hitAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * this.dpr;
    const y = (e.clientY - r.top) * this.dpr;
    let best = -1;
    let bestD = (this.tw * 0.45) ** 2;
    for (const h of this.hits) {
      const d = (h.x - x) ** 2 + (h.y - y) ** 2;
      if (d < bestD) [best, bestD] = [h.i, d];
    }
    return best;
  }

  // Cuántos vecinos de este barrio están mal, en cada una de las tres realidades, hoy.
  updateCounts(day) {
    if (this.countsDay === day) return;
    this.countsDay = day;
    const t = this.trace;
    const T = this.terms;
    this.stratsEl.innerHTML = STRATS.map(([k, label]) => {
      const run = t[k];
      let active = 0;
      let total = 0;
      for (const p of this.people) {
        if ((run.frames[day * t.N + p.i] & 7) === 2) active++;
        const d = run.story.infectedDay[p.i];
        if (d >= 0 && d <= day) total++;
      }
      return `<button type="button" data-strategy="${k}" class="${k === this.strategy ? 'on' : ''}" aria-pressed="${k === this.strategy}"><b>${label}</b><span>${active} ${this.zombie ? (active === 1 ? 'zombi' : 'zombis') : active === 1 ? 'caso activo' : 'casos activos'} hoy · ${total} ${T.bittenM}</span></button>`;
    }).join('');
  }

  draw() {
    const t = this.trace;
    const ctx = this.ctx;
    const now = performance.now();
    const time = Math.min(t.days + 0.999, Math.max(0, this.player.time ?? 0));
    const day = Math.min(t.days, Math.floor(time));
    const phase = time - Math.floor(time);
    const run = t[this.strategy];
    const story = run.story;
    const base = day * t.N;
    const inRange = (list, len) => (list ?? []).some((c) => c.parroquia === this.zoneName && day > c.day && day <= c.day + len);
    const closed = {
      mercado: inRange(run.closures.filter((c) => c.layer === 'mercado'), this.closeDays),
      colegio: inRange(run.closures.filter((c) => c.layer === 'colegio'), this.closeDays),
    };
    const fumigating = inRange(run.fumigations, this.fumigationDays);
    // Noche: 0 de día, 1 de noche (con amanecer y atardecer suaves).
    const night = phase < 0.17 ? 1 : phase < 0.26 ? 1 - (phase - 0.17) / 0.09 : phase < 0.8 ? 0 : phase < 0.91 ? (phase - 0.8) / 0.11 : 1;

    this.updateCounts(day);
    const hours = Math.floor(phase * 24);
    this.clockEl.textContent = `Día ${day} · ${String(hours).padStart(2, '0')}:${String(Math.floor((phase * 24 - hours) * 60 / 15) * 15).padStart(2, '0')}`;

    ctx.drawImage(this.ground, 0, 0);
    // Todo lo que tiene altura se ordena de atrás hacia adelante.
    const items = [];
    for (const hs of this.houses) {
      const quarantined = hs.members.some((i) => run.frames[base + i] & 8);
      items.push({ key: hs.x + hs.y + 1, draw: () => this.drawHouse(ctx, hs, night, quarantined) });
    }
    for (const tr of this.trees) items.push({ key: tr.x + tr.y, draw: () => this.drawPalm(ctx, tr.x, tr.y, now) });
    STALLS.forEach(([x, y], k) => items.push({ key: x + y + 1.2, draw: () => this.drawStall(ctx, x, y, k, closed.mercado) }));
    for (const key of ['colegio', 'trabajo']) {
      const pl = PLACES[key];
      items.push({ key: pl.box.x + pl.box.y + (pl.box.w + pl.box.h) / 2, draw: () => {
        this.box(ctx, pl.box, pl.wall, pl.roof, 'flat');
        const glass = night > 0.3 ? 'rgba(255, 214, 120, 0.8)' : '#3b5268';
        for (let k = 0; k < 4; k++) this.pane(ctx, 'y', pl.box, 0.3 + k * 0.85, 0.75 + k * 0.85, 0.45, 0.85, glass);
        for (let k = 0; k < 2; k++) this.pane(ctx, 'x', pl.box, 0.3 + k * 1.1, 0.9 + k * 1.1, 0.45, 0.85, glass);
      } });
    }
    // Parada y bus.
    items.push({ key: STOP.x + STOP.y - 0.3, draw: () => {
      const b = { x: STOP.x - 0.5, y: STOP.y - 0.55, w: 1.1, h: 0.35, z: 0.75 };
      this.box(ctx, b, '#5d6d7e', '#2f80ed', 'flat');
    } });
    if (this.hasBus) {
      const busX = phase >= 0.3 && phase < 0.37 ? -3 + ((phase - 0.3) / 0.07) * 23 : phase >= 0.61 && phase < 0.68 ? -3 + ((phase - 0.61) / 0.07) * 23 : null;
      if (busX !== null) items.push({ key: busX + 8.6 + 1.6, draw: () => this.drawBus(ctx, busX) });
    }

    const drawn = [];
    for (const p of this.people) {
      const code = run.frames[base + p.i];
      const pos = this.where(p, day, phase, code, closed, now);
      if (!pos) continue;
      const state = code & 7;
      if (this.zombie && state === 2) pos.x += 0.04 * Math.sin(now / 300 + p.j3 * 9);
      items.push({ key: pos.x + pos.y, draw: () => drawn.push({ p, state, ...this.drawPerson(ctx, p, pos, state, now) }) });
    }
    items.sort((a, b) => a.key - b.key);
    for (const it of items) it.draw();

    // Fumigación: niebla que cruza el barrio.
    if (fumigating) {
      for (let k = 0; k < 26; k++) {
        const x = ((hash(k, 1) * G + now / 2500) % (G + 2)) - 1;
        const y = hash(k, 2) * G;
        const [fx, fy] = this.P(x, y, 0.3);
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, this.tw * 1.3);
        g.addColorStop(0, 'rgba(210, 255, 235, 0.32)');
        g.addColorStop(1, 'rgba(210, 255, 235, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(fx - this.tw * 1.3, fy - this.tw * 1.3, this.tw * 2.6, this.tw * 2.6);
      }
    }
    // Noche: el barrio se oscurece; ventanas, rombos y carteles quedan encima.
    if (night > 0) {
      ctx.fillStyle = `rgba(8, 14, 40, ${0.55 * night})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (phase > 0.7) {
      ctx.fillStyle = `rgba(255, 140, 60, ${0.12 * Math.min(1, (phase - 0.7) / 0.08)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (night > 0.3) {
      for (const hs of this.houses) {
        const b = { x: hs.x, y: hs.y, w: 1, h: 1 };
        ctx.globalAlpha = night;
        this.pane(ctx, 'y', b, 0.1, 0.28, 0.32, 0.6, '#ffd678');
        this.pane(ctx, 'y', b, 0.72, 0.9, 0.32, 0.6, '#ffd678');
        this.pane(ctx, 'x', b, 0.3, 0.7, 0.32, 0.6, '#ffd678');
        ctx.globalAlpha = 1;
      }
    }

    // Carteles de los lugares.
    this.sign(ctx, 13, 3, 1.6, closed.mercado ? 'Mercado · CERRADO' : 'Mercado', closed.mercado ? '#b42318' : '#1b2230');
    const cb = PLACES.colegio.box;
    this.sign(ctx, cb.x + cb.w / 2, cb.y + cb.h / 2, cb.z + 0.9, closed.colegio ? 'Colegio · CERRADO' : 'Colegio', closed.colegio ? '#b42318' : '#1b2230');
    const tb = PLACES.trabajo.box;
    this.sign(ctx, tb.x + tb.w / 2, tb.y + tb.h / 2, tb.z + 0.9, 'Atunera');
    if (this.hasBus) this.sign(ctx, STOP.x, STOP.y - 0.4, 1.35, 'Bus', '#2f80ed');
    if (fumigating) this.sign(ctx, 4, 4, 2.2, 'Brigada de fumigación', '#0f766e');

    // Encima de todo: rombos, globos de lo que pasó hoy y la línea de quién mordió a quién.
    this.hits = [];
    const hover = this.mouse ? this.hitAtPoint(drawn) : -1;
    const byI = new Map(drawn.map((d) => [d.p.i, d]));
    for (const d of drawn) {
      this.hits.push({ i: d.p.i, x: d.sx, y: d.sy - d.u * 2.4 });
      this.drawPlumbob(ctx, d.sx + (this.zombie && d.state === 2 ? d.u * 0.35 : 0), d.top, d.u / d.p.scale, STATE_COLOR[d.state] ?? STATE_COLOR[0], now, d.p.j1);
    }
    if (phase > 0.33) {
      for (const d of drawn) {
        const i = d.p.i;
        const by = story.infectedBy[i];
        if (story.infectedDay[i] === day && day > 0 && byI.has(by) && phase < 0.68) {
          const a = byI.get(by);
          ctx.strokeStyle = '#ff3b3b';
          ctx.lineWidth = Math.max(1.5, this.tw * 0.05);
          ctx.setLineDash([this.tw * 0.15, this.tw * 0.1]);
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy - a.u * 2.5);
          ctx.lineTo(d.sx, d.sy - d.u * 2.5);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    for (const d of drawn) {
      const i = d.p.i;
      const f = d.p.who.female;
      const y = d.top - d.u * 2.6;
      if (story.infectedDay[i] === day && day > 0 && phase > 0.33) this.bubble(ctx, d.sx, y, this.zombie ? (f ? '¡Mordida!' : '¡Mordido!') : f ? 'Contagiada' : 'Contagiado', '#ff6b6b');
      else if (story.vaccinatedDay[i] === day) this.bubble(ctx, d.sx, y, f ? 'Vacunada' : 'Vacunado', '#2dd4bf');
      else if (story.detectedDay[i] === day) this.bubble(ctx, d.sx, y, 'Reportado', '#f2b33d');
    }
    // Persona elegida (Modo Vecino) o bajo el cursor: anillo y nombre.
    for (const i of new Set([this.player.selected, hover])) {
      const d = byI.get(i);
      if (!d) continue;
      const pulse = 1 + 0.15 * Math.sin(now / 200);
      ctx.strokeStyle = i === this.player.selected ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = Math.max(1.5, this.tw * 0.05);
      ctx.beginPath();
      ctx.ellipse(d.sx, d.sy, d.u * 2.2 * pulse, d.u * 1 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      const fs = Math.max(11, this.tw * 0.26);
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0c1117';
      const label = `${d.p.who.name}, ${d.p.who.age}`;
      ctx.strokeText(label, d.sx, d.sy + fs * 1.4);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, d.sx, d.sy + fs * 1.4);
      ctx.textAlign = 'start';
    }
    this.caption(day, phase, closed, fumigating);
  }

  hitAtPoint(drawn) {
    let best = -1;
    let bestD = (this.tw * 0.45) ** 2;
    for (const d of drawn) {
      const dd = (d.sx - this.mouse[0]) ** 2 + (d.sy - d.u * 2.4 - this.mouse[1]) ** 2;
      if (dd < bestD) [best, bestD] = [d.p.i, dd];
    }
    return best;
  }

  // Una línea que cuenta qué está pasando en el barrio.
  caption(day, phase, closed, fumigating) {
    const key = `${this.strategy}:${day}:${phase < 0.2 || phase > 0.9 ? 'n' : 'd'}:${closed.mercado}${closed.colegio}${fumigating}`;
    if (key === this.captionKey) return;
    this.captionKey = key;
    const run = this.trace[this.strategy];
    const s = run.story;
    let vax = 0, bit = 0, q = 0;
    for (const p of this.people) {
      if (s.vaccinatedDay[p.i] === day) vax++;
      if (s.infectedDay[p.i] === day && day > 0) bit++;
    }
    for (const hs of this.houses) if (hs.members.some((i) => run.frames[day * this.trace.N + i] & 8)) q++;
    const parts = [];
    if (bit) parts.push(`${bit} ${bit === 1 ? (this.zombie ? 'vecino mordido' : 'vecino contagiado') : this.zombie ? 'vecinos mordidos' : 'vecinos contagiados'} hoy`);
    if (vax) parts.push(`${vax} ${vax === 1 ? 'vacuna' : 'vacunas'} en el barrio`);
    if (q) parts.push(`${q} ${q === 1 ? 'casa' : 'casas'} en cuarentena (cinta morada)`);
    if (closed.mercado) parts.push(`el mercado de ${this.zoneName} está cerrado`);
    if (closed.colegio) parts.push('el colegio está cerrado: los niños se quedan en casa');
    if (fumigating) parts.push('pasa la brigada de fumigación');
    const nightNote = this.zombie && (phase < 0.2 || phase > 0.9) ? ' De noche todos duermen… menos los zombis.' : '';
    this.captionEl.textContent = (parts.length ? `${parts.join(' · ')}.` : 'Un día normal en el barrio.') + nightNote;
  }
}
