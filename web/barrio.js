// "El barrio, de cerca": la misma corrida que los mapas, vista como un juego de vecinos en perspectiva
// isométrica. Cada figura es una persona de la simulación: vive en su casa con su familia, sale cada
// mañana a su colegio, su trabajo (a pie o en bus) o al mercado, y vuelve en la tarde. El rombo sobre
// la cabeza es su estado ese día. Lo que hace el Comité también se ve: vacunas, hogares en cuarentena,
// mercado o colegio cerrados, brigadas de fumigación.
// Cada zona tiene su propio aspecto (barrios.js). Las casas y las personas son las de la simulación
// (los hogares más cercanos entre sí en el mapa real); calles y edificios son un dibujo esquemático.
import { persona } from './vecino.js';
import { CITIES } from './engine/cities.js';
import { lookOf } from './barrios.js';

const G = 30; // casillas por lado
// Calles y manzanas: cambian con cada zona (setStreets), así cada barrio tiene su propio trazado.
let ROADS = [10, 20]; // centro de las calles (horizontales y verticales), de 2 casillas de ancho
let SPANS = [[0, 9], [11, 19], [21, 30]]; // manzanas entre calles
function setStreets(roads) {
  ROADS = roads;
  SPANS = [[0, roads[0] - 1], [roads[0] + 1, roads[1] - 1], [roads[1] + 1, G]];
}
// Distribuciones posibles: qué hay en el centro del barrio y qué alrededor.
const LAYOUTS = {
  mercado: { market: [1, 1], work: [2, 1], school: [1, 0], plaza: [2, 2] },
  plaza: { plaza: [1, 1], market: [1, 0], school: [2, 1], work: [2, 0] },
  trabajo: { work: [1, 1], market: [2, 1], school: [1, 0], plaza: [2, 2] },
  escuela: { school: [1, 1], market: [1, 0], work: [2, 1], plaza: [2, 2] },
};
const STATE_COLOR = ['#5fd38d', '#facc15', '#ff3b3b', '#60a5fa', '#2dd4bf'];
const SHIRTS = ['#e85d5d', '#4f8fe8', '#f2c94c', '#5bbf8a', '#f4f4f4', '#b07be0', '#f08a3c', '#3fb8c4', '#2f3b52', '#e87fb0'];
const SKIN = ['#8d5a3b', '#a86b47', '#c68a5e', '#e0ad84'];
const PANTS = ['#2f3b52', '#3c4a63', '#5a4a3a', '#24314a'];
const ZOMBIE_SKIN = '#93b07c';
const GROUND = {
  verde: ['#7aa257', '#739951', '#80a95d'],
  seco: ['#a9a56b', '#a09c62', '#b2ad74'],
  tierra: ['#b59a6a', '#ab8f60', '#bca377'],
  arena: ['#d9c48f', '#d2bc86', '#e0cc98'],
  urbano: ['#a5a097', '#9d988f', '#aca79e'],
};
const WATER = { mar: '#2b7a9c', rio: '#76694a', estero: '#4d6a55' };
const ROOF = { losa: '#bdb7ad', zinc: '#97a0a8', teja: '#b4643c' };
const STRATS = [
  ['nada', 'Sin hacer nada'],
  ['azar', 'Al azar'],
  ['adaptativa', 'Plan del Comité'],
];

// Número pseudoaleatorio estable en [0, 1) para (a, b): la misma persona hace siempre lo mismo.
function hash(a, b = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

// Aclara (k > 0) u oscurece (k < 0) un color "#rrggbb" o "rgb(r, g, b)".
function shade(color, k) {
  const [r, g, b] = color[0] === '#' ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) : color.match(/\d+/g).map(Number);
  const f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
const block = (bi, bj) => ({ x0: SPANS[bi][0], x1: SPANS[bi][1], y0: SPANS[bj][0], y1: SPANS[bj][1] });
const nearestRoad = (v) => (Math.abs(v - ROADS[0]) <= Math.abs(v - ROADS[1]) ? ROADS[0] : ROADS[1]);

// Plano del barrio según su aspecto. El agua (mar, río o estero) ocupa la esquina izquierda: todo lo
// que cumple y − x > T. En pantalla es una franja a la izquierda, siempre a la vista.
const T = 11;
function planFor(look) {
  const water = !!look.water;
  const shore = water ? T - (look.beach ? 1.6 : 0.8) : Infinity; // más allá: playa o malecón, luego agua
  const landX = (y) => Math.max(0, y - shore); // primer x en tierra firme para esa fila
  // El mercado en el centro (ahí empieza el brote de la demo); el trabajo, el colegio y la plaza alrededor.
  const blocks = LAYOUTS[look.layout ?? 'mercado'];
  // Con agua, la plaza se cambia por más casas: el agua ya ocupa una esquina del barrio.
  const used = new Set(Object.entries(blocks).filter(([k, [i, j]]) => !(water && k === 'plaza' && !(i === 1 && j === 1))).map(([, [i, j]]) => `${i},${j}`));
  const slots = [];
  for (let bi = 0; bi < 3; bi++) {
    for (let bj = 0; bj < 3; bj++) {
      if (used.has(`${bi},${bj}`)) continue;
      const r = block(bi, bj);
      for (let y = r.y0 + 0.4; y + 2.2 <= r.y1 + 0.05; y += 2.75) {
        for (let x = r.x0 + 0.5; x + 1 <= r.x1 - 0.3; x += 2) if (y + 2.2 - x < shore - 0.2) slots.push({ x, y });
      }
    }
  }
  // Casas sobre el agua (palafitos), cerca de la orilla, con su pasarela.
  if (look.palafitos) {
    for (let y = 0.4; y + 2.2 <= G; y += 2.75) {
      for (let x = 0.5; x + 1 <= G; x += 2) {
        const near = y - (x + 1) > T + 0.4 && y + 2.2 - x < T + 4.2;
        if (near && hash(Math.round(x * 10), Math.round(y * 10) + 77) < look.palafitos) slots.push({ x, y, stilts: true });
      }
    }
  }
  const c = G / 2;
  slots.sort((a, b) => Math.hypot(a.x + 0.5 - c, a.y + 0.5 - c) - Math.hypot(b.x + 0.5 - c, b.y + 0.5 - c));
  const plazaHouses = water && !(blocks.plaza[0] === 1 && blocks.plaza[1] === 1);
  return { water, shore, landX, blocks, slots, plazaHouses };
}

// Lugares: edificio (caja), patio donde se queda la gente y adornos según el tipo.
function placesFor(look, plan) {
  const at = (key) => block(...plan.blocks[key]);
  const s = at('school');
  const m = at('market');
  const w = at('work');
  const wx = w.x0 + 0.6;
  const kind = look.work.kind;
  const tall = { oficinas: 4.6, atunera: 1.7, astillero: 1.6, laboratorio: 0.75, bodegas: 1.3, puerto: 1.2, mall: 1.5, fabrica: 1.5, taller: 0.95 }[kind] ?? 1.3;
  const wall = { oficinas: '#9fb7c9', atunera: '#c9d1d8', astillero: '#b9a88e', laboratorio: '#e8eef0', bodegas: '#c5c0b4', puerto: '#b9c4cf', mall: '#e9e4da', fabrica: '#b9c4cf', taller: '#c9b9a0' }[kind] ?? '#b9c4cf';
  const roof = { oficinas: '#6f8ea8', atunera: '#7f8c99', astillero: '#8a95a3', laboratorio: '#5d8aa8', bodegas: '#8f979f', puerto: '#56657a', mall: '#c0473d', fabrica: '#56657a', taller: '#97a0a8' }[kind] ?? '#56657a';
  const bw = Math.min(kind === 'oficinas' ? 3 : 4.6, w.x1 - 0.4 - wx);
  return {
    school: { label: look.school, box: { x: s.x0 + 0.6, y: s.y0 + 0.6, w: 4.4, h: 2.6, z: 1.25 }, wall: '#f1e7cf', roof: '#3d6fb0', area: { x: s.x0 + 0.6, y: s.y0 + 3.8, w: 6.8, h: 3.6 } },
    market: { label: look.market, area: { x: m.x0 + 0.6, y: m.y0 + 0.6, w: 7.2, h: 7 } },
    work: { label: look.work.label, kind, box: { x: wx, y: w.y0 + 0.6, w: bw, h: kind === 'bodegas' ? 1.5 : 3, z: tall }, wall, roof, area: { x: wx, y: w.y0 + 4.2, w: Math.min(6.6, w.x1 - 0.4 - wx), h: 3.4 } },
    plaza: at('plaza'),
  };
}

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
    this.zoneEl = root.querySelector('.barrio-zone');
    this.strategy = 'adaptativa';
    this.active = true;
    this.trace = null;
    this.hits = [];
    this.mouse = null;
    this.countsDay = -1;
    this.zoom = 1;
    this.center = [G / 2, G / 2];
    this.stratsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-strategy]');
      if (!b) return;
      this.strategy = b.dataset.strategy;
      this.countsDay = -1;
      this.captionKey = '';
    });
    this.zoneEl.addEventListener('change', () => this.showZone(Number(this.zoneEl.value)));
    // Vistas fijas: todo el barrio o un acercamiento a las casas, el mercado o el trabajo.
    this.camsEl = root.querySelector('.barrio-cams');
    this.camsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cam]');
      if (b) this.view(b.dataset.cam);
    });
    // Arrastrar para mover la cámara; tocar a alguien para conocerlo.
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, center: [...this.center], moved: false };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse = [(e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr];
      if (drag) {
        const dx = ((e.clientX - drag.x) * this.dpr * 2) / this.tw;
        const dy = ((e.clientY - drag.y) * this.dpr * 4) / this.tw;
        if (Math.abs(dx) + Math.abs(dy) > 0.15) drag.moved = true;
        // Pantalla → casillas: x − y cambia con el arrastre horizontal, x + y con el vertical.
        const [mx, my] = this.mirror ? [-(dx - dy) / 2, -(dx + dy) / 2] : [-(dx + dy) / 2, -(dy - dx) / 2];
        this.camTarget = null;
        this.setCenter(drag.center[0] + mx, drag.center[1] + my);
      }
      this.canvas.style.cursor = drag?.moved ? 'grabbing' : this.hitAt(e) >= 0 ? 'pointer' : 'grab';
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) {
        const i = this.hitAt(e);
        if (i >= 0) this.player.select(i);
      }
      drag = null;
    });
    this.canvas.addEventListener('pointerleave', () => (this.mouse = null));
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    const loop = () => {
      if (this.active && this.trace && this.houses && !document.hidden) {
        this.moveCamera();
        this.draw();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  load(trace, cfg, theme, terms) {
    this.trace = trace;
    this.terms = terms;
    this.zombie = theme === 'zombi';
    this.closeDays = cfg.closeDays;
    this.fumigationDays = cfg.fumigationDays;
    this.zones = CITIES[trace.city].zones;
    this.zoneEl.innerHTML = this.zones.map((z, k) => `<option value="${k}">${z}</option>`).join('');
    this.indexHomes();
    this.centers = this.rankCenters();
    this.build(this.centers[0]);
  }

  setActive(on) {
    this.active = on;
    // En el barrio un día dura mucho más que en los mapas: se ve la mañana, la tarde y la noche.
    this.player.rate = on ? 1 / 40 : 1;
  }

  // Hogares con su posición en el mapa real, su zona y sus integrantes.
  indexHomes() {
    const t = this.trace;
    const map = new Map();
    for (let i = 0; i < t.N; i++) {
      const h = t.people.home[i];
      if (!map.has(h)) map.set(h, { h, x: t.layout.x[i] * t.layout.aspect, y: t.layout.y[i], zone: t.people.parroquia[i], members: [] });
      map.get(h).members.push(i);
    }
    this.homes = [...map.values()];
    this.homeIndex = map;
  }

  nearestHomes(cx, cy, k, zone = -1) {
    const pool = zone >= 0 ? this.homes.filter((h) => h.zone === zone) : this.homes;
    const d = pool.map((h) => (h.x - cx) ** 2 + (h.y - cy) ** 2);
    return Array.from(d.keys()).sort((a, b) => d[a] - d[b]).slice(0, k).map((j) => pool[j]);
  }

  // Barrios con historia: muchos mordidos si nadie hace nada, muchos salvados por el plan y algo de
  // trabajo del Comité (vacunas) para ver. Se guarda el mejor de cada zona.
  rankCenters() {
    const t = this.trace;
    const n = t.nada.story;
    const c = t.adaptativa.story;
    const score = (h) => h.members.reduce((s, i) => s + (n.infectedDay[i] >= 0) + 2 * (n.infectedDay[i] >= 0 && c.infectedDay[i] < 0) + 0.6 * (c.vaccinatedDay[i] >= 0), 0);
    const step = Math.max(1, Math.floor(this.homes.length / 160));
    const list = [];
    for (let k = 0; k < this.homes.length; k += step) {
      const h = this.homes[k];
      const near = this.nearestHomes(h.x, h.y, 60);
      list.push({ home: h, score: near.reduce((s, x) => s + score(x), 0) });
    }
    list.sort((a, b) => b.score - a.score);
    this.bestByZone = new Map();
    for (const x of list) if (!this.bestByZone.has(x.home.zone)) this.bestByZone.set(x.home.zone, x.home);
    return list.map((x) => x.home);
  }

  showZone(zone) {
    const home = this.bestByZone.get(zone) ?? this.homes.find((h) => h.zone === zone);
    if (home) this.build(home);
  }

  // Si eligen a alguien que no vive en este barrio, se muestra el suyo.
  focus(i) {
    if (!this.trace || this.byPerson?.has(i)) return;
    this.build(this.homeIndex.get(this.trace.people.home[i]));
  }

  build(center) {
    const t = this.trace;
    const P = t.people;
    this.zone = center.zone;
    this.zoneName = this.zones[this.zone];
    this.zoneEl.value = String(this.zone);
    const look = lookOf(t.city, this.zoneName);
    this.look = look;
    setStreets(look.roads ?? [10, 20]);
    this.mirror = !!look.mirror;
    this.plan = planFor(look);
    this.places = placesFor(look, this.plan);
    // Los hogares de la misma zona más cercanos a este; el del centro, en el centro del barrio.
    const homes = this.nearestHomes(center.x, center.y, this.plan.slots.length, this.zone);
    const [s0, s1] = look.houses.stories;
    this.houses = homes.map((h, k) => {
      const s = this.plan.slots[k];
      const r = (n) => hash(h.h, n);
      const stories = s.stilts ? 1 : s0 + Math.floor(r(1) * (s1 - s0 + 1));
      const roof = s.stilts ? 'zinc' : pick(look.houses.roofs, r(2));
      return { ...s, home: h.h, members: h.members, stories, z: 0.62 + 0.5 * (stories - 1), roof, roofColor: roof === 'teja' ? pick(['#b4643c', '#a65a36', '#c0703f', '#9c4f30'], r(3)) : ROOF[roof], wall: pick(look.houses.colors, r(4)), cana: r(5) < (look.houses.cana ?? 0), tank: roof === 'losa' && r(6) < 0.55, skin: pick(SKIN, r(7)) };
    });
    this.people = [];
    this.byPerson = new Map();
    const pl = this.places;
    this.stop = { x: 6, y: ROADS[0] - 1.35 };
    for (const [hk, house] of this.houses.entries()) {
      house.members.forEach((i, k) => {
        const who = persona(t, i);
        const r = (n) => hash(i, n);
        const p = {
          i, house: hk, who,
          scale: who.age < 12 ? 0.72 : who.age < 18 ? 0.86 : 1,
          role: P.role[i],
          bus: P.role[i] === 2 && P.bus[i] >= 0,
          yard: { x: house.x + 0.2 + (k % 3) * 0.32, y: house.y + 1.25 + Math.floor(k / 3) * 0.3 },
          // Estudiantes con uniforme (camisa blanca, pantalón azul), como en los colegios de Manta.
          shirt: P.role[i] === 1 ? '#f1f1ec' : pick(SHIRTS, r(1)), pants: P.role[i] === 1 ? '#22305a' : pick(PANTS, r(2)), skin: house.skin,
          hair: who.age >= 65 ? '#d6d3cc' : pick(['#1d1612', '#2e2018', '#4a2f1d'], r(3)),
          j1: r(4), j2: r(5), j3: r(6),
        };
        const spot = (a) => ({ x: a.x + 0.3 + r(10) * (a.w - 0.6), y: a.y + 0.3 + r(11) * (a.h - 0.6) });
        p.dest = p.role === 1 ? spot(pl.school.area) : p.role === 2 ? (p.bus ? { x: this.stop.x - 0.8 + r(12) * 1.6, y: this.stop.y + 0.1 } : spot(pl.work.area)) : spot(pl.market.area);
        p.route = this.route(p.yard, p.dest);
        this.byPerson.set(i, p);
        this.people.push(p);
      });
    }
    this.hasBus = this.people.some((p) => p.bus);
    this.decor = this.makeDecor();
    this.nameEl.textContent = `${look.blurb[0].toUpperCase()}${look.blurb.slice(1)}. ${this.houses.length} casas y ${this.people.length} vecinos.`;
    this.countsDay = -1;
    this.captionKey = '';
    this.zoom = 1;
    this.center = [G / 2, G / 2];
    this.camTarget = null;
    this.camName = 'todo';
    this.renderCams();
    this.resize();
  }

  // Vistas: a dónde mira la cámara y con cuánto acercamiento.
  cams() {
    const pl = this.places;
    const mid = (a) => [a.x + a.w / 2, a.y + a.h / 2];
    const hs = this.houses.filter((h) => !h.stilts);
    const homes = [hs.reduce((s, h) => s + h.x, 0) / hs.length + 0.5, hs.reduce((s, h) => s + h.y, 0) / hs.length + 1];
    const near = hs.slice().sort((a, b) => Math.hypot(a.x - homes[0], a.y - homes[1]) - Math.hypot(b.x - homes[0], b.y - homes[1]))[0];
    return {
      todo: { label: 'Todo', icon: 'i-map', zoom: 1, center: [G / 2, G / 2] },
      casas: { label: 'Casa', icon: 'i-home', zoom: 1.9, center: [near.x + 0.5, near.y + 1] },
      bus: { label: 'Bus', icon: 'i-bus', zoom: 1.9, center: [this.stop.x + 0.6, this.stop.y + 0.8] },
      colegio: { label: pl.school.label, icon: 'i-school', zoom: 1.8, center: mid(pl.school.area) },
      mercado: { label: 'Mercado', icon: 'i-market', zoom: 1.8, center: mid(pl.market.area) },
      trabajo: { label: pl.work.label, icon: 'i-users', zoom: 1.7, center: mid(pl.work.area) },
    };
  }

  renderCams() {
    const c = this.cams();
    this.camsEl.innerHTML = Object.entries(c).map(([k, v]) => `<button type="button" data-cam="${k}" class="${k === this.camName ? 'on' : ''}"><svg class="ic"><use href="#${v.icon}"/></svg>${v.label}</button>`).join('');
  }

  view(name) {
    this.camName = name;
    const c = this.cams()[name];
    this.camTarget = { zoom: c.zoom, center: c.center };
    this.camsEl.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === name));
  }

  // La cámara se acerca suave a la vista elegida.
  moveCamera() {
    const t = this.camTarget;
    if (!t) return;
    const k = 0.12;
    const z = this.zoom + (t.zoom - this.zoom) * k;
    const cx = this.center[0] + (t.center[0] - this.center[0]) * k;
    const cy = this.center[1] + (t.center[1] - this.center[1]) * k;
    const done = Math.abs(z - t.zoom) < 0.003 && Math.hypot(cx - t.center[0], cy - t.center[1]) < 0.02;
    this.center = done ? t.center : [cx, cy];
    this.setZoom(done ? t.zoom : z);
    if (done) this.camTarget = null;
  }

  // Camino por las calles: de la casa a la calle más cercana, por la calle y, si hace falta, cruzando.
  route(a, b) {
    const ya = nearestRoad(a.y);
    const yb = nearestRoad(b.y);
    const dir = b.x >= a.x ? 1 : -1;
    const off = dir > 0 ? -0.4 : 0.4;
    const lx = (y) => this.plan.landX(y) + 0.3;
    const pts = [a, { x: Math.max(a.x, lx(ya)), y: ya + off }];
    if (ya !== yb) {
      const vx = nearestRoad((a.x + b.x) / 2) + (yb > ya ? 0.4 : -0.4);
      pts.push({ x: vx, y: ya + off }, { x: vx, y: yb + off });
    }
    pts.push({ x: Math.max(b.x, lx(yb)), y: yb + off }, b);
    const seg = pts.slice(1).map((q, k) => Math.hypot(q.x - pts[k].x, q.y - pts[k].y));
    const len = seg.reduce((s, x) => s + x, 0);
    return { pts, seg, len, travel: Math.min(0.09, Math.max(0.035, len * 0.0035)) };
  }

  along(rt, f, back) {
    let d = (back ? 1 - f : f) * rt.len;
    const { pts, seg } = rt;
    for (let k = 0; k < seg.length; k++) {
      if (d <= seg[k] || k === seg.length - 1) {
        const u = seg[k] ? Math.min(1, d / seg[k]) : 1;
        const a = pts[k];
        const b = pts[k + 1];
        const dir = Math.sign((b.x - a.x) - (b.y - a.y)) * (back ? -1 : 1) || 1;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, walking: true, dir };
      }
      d -= seg[k];
    }
  }

  // Adornos fijos: árboles, botes, autos, iglesia. Estables para cada barrio.
  makeDecor() {
    const look = this.look;
    const plan = this.plan;
    const out = [];
    const tree = look.trees.kind;
    const z = this.zone * 101;
    for (const c of ROADS) {
      for (let x = plan.landX(c) + 0.8; x < G - 0.5; x += 1.6) {
        if (Math.abs(x - 10) < 1.6 || Math.abs(x - 20) < 1.6) continue;
        if (hash(Math.round(x * 10) + z, c) < look.trees.amount * 0.7) out.push({ type: tree, x, y: c - 1.45 });
      }
    }
    for (const s of plan.slots.slice(this.houses.length)) if (!s.stilts) out.push({ type: tree, x: s.x + 0.5, y: s.y + 0.7 });
    const p = this.places.plaza;
    if (plan.plazaHouses) {
      // (sin plaza: ese espacio es de casas)
    } else if (look.plaza === 'parque') {
      for (let k = 0; k < 9; k++) out.push({ type: tree, x: p.x0 + 1 + (k % 3) * 3, y: p.y0 + 1 + Math.floor(k / 3) * 3 });
    } else if (look.plaza === 'iglesia') {
      out.push({ type: 'iglesia', x: p.x0 + 1.4, y: p.y0 + 0.8 });
      for (let k = 0; k < 4; k++) out.push({ type: tree, x: p.x0 + 1 + k * 2, y: p.y0 + 6.8 });
    } else {
      out.push({ type: tree, x: p.x0 + 0.6, y: p.y0 + 0.6 }, { type: tree, x: p.x1 - 0.6, y: p.y0 + 0.6 });
    }
    if (look.water) {
      // Botes en el agua (y − x > T + 1) y, en las playas de pescadores, algunos varados en la arena.
      const n = look.boats === 'atuneros' ? 3 : look.boats ? 7 : 0;
      for (let k = 0; k < n; k++) {
        const big = look.boats === 'atuneros';
        const y = T + 3 + ((k + hash(k, z + 4)) / n) * (G - T - 4);
        const x = 0.3 + hash(k, z + 3) * Math.max(0.5, y - T - (big ? 3.4 : 2.4));
        out.push({ type: 'bote', big, yate: look.boats === 'yates', x, y: y - (big ? 2.2 : 1.1), color: pick(['#2f6fb5', '#e85d5d', '#f4f4f4', '#2a9d8f', '#f2c94c'], hash(k, z + 5)) });
      }
      if (look.beach && look.boats === 'pesca') {
        for (let k = 0; k < 4; k++) {
          const y = 12 + k * 4.5;
          out.push({ type: 'bote', x: y - T + 0.5, y: y - 1.1, color: pick(['#2f6fb5', '#e85d5d', '#2a9d8f'], hash(k, z + 6)), beached: true });
        }
      }
    }
    // Faroles a lo largo de las calles, unidos por cables de luz.
    for (const c of ROADS) {
      let prev = null;
      for (let x = plan.landX(c) + 1.5; x < G; x += 3) {
        const d = { type: 'farol', x, y: c - 1.2 };
        if (prev) prev.next = d;
        out.push(d);
        prev = d;
      }
    }
    // Patios: ropa tendida y plantas junto a la puerta.
    for (const hs of this.houses) {
      if (hs.stilts) continue;
      if (hash(hs.home, 41) < 0.35) out.push({ type: 'ropa', x: hs.x + 0.05, y: hs.y + 1.62, k: hs.home });
      if (hash(hs.home, 42) < 0.5) out.push({ type: 'maceta', x: hs.x + 0.82, y: hs.y + 1.14 });
    }
    const sa = this.places.school.area;
    out.push({ type: 'bandera', x: sa.x + 0.5, y: sa.y + 0.5 }, { type: 'aro', x: sa.x + sa.w - 0.6, y: sa.y + sa.h / 2 });
    const ma = this.places.market.area;
    out.push({ type: 'tacho', x: ma.x + ma.w - 0.3, y: ma.y + ma.h - 0.3 }, { type: 'tacho', x: sa.x + 0.3, y: sa.y + sa.h - 0.3 });
    for (let k = 0; k < 6; k++) {
      const c = ROADS[k % 2];
      out.push({ type: 'auto', x: plan.landX(c) + 2 + hash(k, z + 8) * (G - plan.landX(c) - 4), y: c + 0.62, color: pick(['#e85d5d', '#f4f4f4', '#2f3b52', '#4f8fe8', '#f2c94c'], hash(k, z + 9)) });
    }
    return out;
  }

  // ---------- Cámara ----------
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(300, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(200, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.setZoom(this.zoom);
  }

  // Con zoom 1 el barrio llena justo la vista; nunca se ve el borde del tablero.
  setZoom(z) {
    const { width: W, height: H } = this.canvas;
    this.zoom = Math.max(1, Math.min(2.6, z));
    this.tw = ((2 * H + W) / (G - 0.6)) * this.zoom;
    this.setCenter(...this.center);
  }

  setCenter(cx, cy) {
    const { width: W, height: H } = this.canvas;
    const fits = (x, y) => {
      for (const [sx, sy] of [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]]) {
        const a = (sx * 2) / this.tw + (this.mirror ? y - x : x - y);
        const b = (sy * 4) / this.tw + x + y;
        const gx = (a + b) / 2;
        const gy = (b - a) / 2;
        if (gx < -0.2 || gy < -0.2 || gx > G + 0.2 || gy > G + 0.2) return false;
      }
      return true;
    };
    let [x, y] = [cx, cy];
    // Si se sale del tablero, se acerca al centro hasta que entre.
    for (let k = 0; k < 30 && !fits(x, y); k++) [x, y] = [x + (G / 2 - x) * 0.25, y + (G / 2 - y) * 0.25];
    if (!fits(x, y)) [x, y] = [G / 2, G / 2];
    this.center = [x, y];
    this.ox = W / 2 - ((this.mirror ? y - x : x - y) * this.tw) / 2;
    this.oy = H / 2 - ((x + y) * this.tw) / 4;
    this.groundAt = null;
  }

  // Casilla (x, y) a la altura z → píxel en pantalla.
  // En los barrios "espejo" se intercambian x e y: el mismo dibujo visto desde el otro lado.
  P(x, y, z = 0) {
    if (this.mirror) [x, y] = [y, x];
    return [this.ox + ((x - y) * this.tw) / 2, this.oy + ((x + y) * this.tw) / 4 - (z * this.tw) / 2];
  }

  poly(ctx, pts, fill) {
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  rect(ctx, x, y, w, h, fill, z = 0) {
    this.poly(ctx, [this.P(x, y, z), this.P(x + w, y, z), this.P(x + w, y + h, z), this.P(x, y + h, z)], fill);
  }

  line(ctx, a, b, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
  }

  // El suelo solo cambia al mover la cámara: se dibuja aparte y se reutiliza.
  drawGround() {
    const { width: w, height: h } = this.canvas;
    const bg = this.groundCanvas ?? document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    const ctx = bg.getContext('2d');
    const look = this.look;
    const { landX } = this.plan;
    const tw = this.tw;
    ctx.fillStyle = '#0c0a12';
    ctx.fillRect(0, 0, w, h);
    const tones = GROUND[look.ground];
    for (let x = 0; x < G; x++) {
      for (let y = 0; y < G; y++) {
        const [sx, sy] = this.P(x + 0.5, y + 0.5);
        if (sx < -tw || sx > w + tw || sy < -tw || sy > h + tw) continue;
        const r = hash(x * 31 + y, 3);
        this.rect(ctx, x, y, 1.02, 1.02, pick(tones, r));
      }
    }
    // Calles: asfalto con línea amarilla o tierra con huellas.
    const dirt = look.road === 'tierra';
    const roadColor = dirt ? '#a2865c' : '#4b5059';
    for (const c of ROADS) {
      if (!dirt) {
        this.rect(ctx, landX(c), c - 1.3, G - landX(c), 2.6, '#bdb6a6');
        this.rect(ctx, c - 1.3, 0, 2.6, G, '#bdb6a6');
      }
    }
    for (const c of ROADS) {
      this.rect(ctx, landX(c), c - 1, G - landX(c), 2, roadColor);
      this.rect(ctx, c - 1, 0, 2, G, roadColor);
    }
    ctx.setLineDash(dirt ? [] : [tw * 0.25, tw * 0.25]);
    for (const c of ROADS) {
      if (dirt) {
        for (const o of [-0.45, 0.45]) {
          this.line(ctx, this.P(landX(c), c + o), this.P(G, c + o), 'rgba(90, 70, 40, 0.35)', tw * 0.06);
          this.line(ctx, this.P(c + o, 0), this.P(c + o, G), 'rgba(90, 70, 40, 0.35)', tw * 0.06);
        }
      } else {
        this.line(ctx, this.P(landX(c), c), this.P(G, c), '#e8d27a', Math.max(1, tw * 0.035));
        this.line(ctx, this.P(c, 0), this.P(c, G), '#e8d27a', Math.max(1, tw * 0.035));
      }
    }
    ctx.setLineDash([]);
    if (!dirt) for (const c of ROADS) for (let k = 0; k < 4; k++) this.rect(ctx, c + 1.15, c - 0.85 + k * 0.45, 0.6, 0.25, '#e8e4da');
    // Lugares.
    const pl = this.places;
    const sa = pl.school.area;
    this.rect(ctx, sa.x, sa.y, sa.w, sa.h, '#c9b48a');
    ctx.strokeStyle = '#f4efe2';
    ctx.lineWidth = Math.max(1, tw * 0.03);
    ctx.beginPath();
    [[sa.x + 0.4, sa.y + 0.4], [sa.x + sa.w - 0.4, sa.y + 0.4], [sa.x + sa.w - 0.4, sa.y + sa.h - 0.4], [sa.x + 0.4, sa.y + sa.h - 0.4]].forEach(([x, y], k) => (k ? ctx.lineTo(...this.P(x, y)) : ctx.moveTo(...this.P(x, y))));
    ctx.closePath();
    ctx.stroke();
    const wa = pl.work.area;
    this.rect(ctx, wa.x, wa.y, wa.w, wa.h, '#a9a49a');
    if (pl.work.kind === 'laboratorio') for (let k = 0; k < 3; k++) this.rect(ctx, wa.x + 0.3 + k * 2.1, wa.y + 0.4, 1.7, 1.4, '#4f9cc0');
    const ma = pl.market.area;
    this.rect(ctx, ma.x, ma.y, ma.w, ma.h, '#c7b79a');
    const p = pl.plaza;
    if (this.plan.plazaHouses) {
      // Sin plaza: ahí hay casas.
    } else if (look.plaza === 'cancha') {
      this.rect(ctx, p.x0 + 0.5, p.y0 + 0.5, p.x1 - p.x0 - 1, p.y1 - p.y0 - 1, '#b8a06a');
      this.rect(ctx, p.x0 + 1.2, p.y0 + 1.2, p.x1 - p.x0 - 2.4, p.y1 - p.y0 - 2.4, '#6f9a4f');
      this.line(ctx, this.P(p.x0 + 1.2, (p.y0 + p.y1) / 2), this.P(p.x1 - 1.2, (p.y0 + p.y1) / 2), '#f4efe2', Math.max(1, tw * 0.03));
    } else if (look.plaza === 'iglesia') {
      this.rect(ctx, p.x0 + 0.4, p.y0 + 0.4, p.x1 - p.x0 - 0.8, p.y1 - p.y0 - 0.8, '#d8cfb8');
    } else {
      this.rect(ctx, p.x0 + 0.4, p.y0 + 0.4, p.x1 - p.x0 - 0.8, p.y1 - p.y0 - 0.8, '#6f9a4f');
      this.rect(ctx, (p.x0 + p.x1) / 2 - 0.3, p.y0 + 0.4, 0.6, p.y1 - p.y0 - 0.8, '#d8cfb8');
      this.rect(ctx, p.x0 + 0.4, (p.y0 + p.y1) / 2 - 0.3, p.x1 - p.x0 - 0.8, 0.6, '#d8cfb8');
    }
    for (const hs of this.houses) if (!hs.stilts) this.rect(ctx, hs.x - 0.1, hs.y + 1.05, 1.2, 0.8, shade(tones[0], 0.12));
    if (look.water) {
      // Orilla (playa o malecón) y agua, como franjas en diagonal; tapan el final de las calles.
      const T2 = this.plan.shore;
      this.poly(ctx, [this.P(0, T2), this.P(G - T2, G), this.P(0, G)], look.beach ? '#dcc795' : '#cfc6b4');
      this.poly(ctx, [this.P(0, T), this.P(G - T, G), this.P(0, G)], WATER[look.water]);
      this.line(ctx, this.P(0, T), this.P(G - T, G), 'rgba(255, 255, 255, 0.4)', Math.max(1.5, tw * 0.05));
      // Pasarelas de los palafitos hasta la orilla.
      for (const hs of this.houses) {
        if (!hs.stilts) continue;
        const toShore = hs.y + 1.2 - T2 - hs.x - 0.5;
        this.rect(ctx, hs.x + 0.5, hs.y + 1.05, Math.max(0.5, toShore), 0.32, '#8a6a45');
      }
    }
    // Sombras de los edificios (el sol viene de la izquierda) y textura del suelo.
    const shadow = (x, y, w, h, z) => this.rect(ctx, x + 0.12, y + 0.08, w + 0.42 * z, h + 0.06, 'rgba(0, 0, 0, 0.2)');
    for (const hs of this.houses) if (!hs.stilts) shadow(hs.x, hs.y, 1, 1, hs.z);
    for (const pl2 of [this.places.school, this.places.work]) shadow(pl2.box.x, pl2.box.y, pl2.box.w, pl2.box.h, pl2.box.z);
    if (!this.noise) {
      const n = document.createElement('canvas');
      n.width = n.height = 128;
      const nctx = n.getContext('2d');
      const img = nctx.createImageData(128, 128);
      for (let k = 0; k < img.data.length; k += 4) {
        const v = hash(k, 5) * 255;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
        img.data[k + 3] = 22;
      }
      nctx.putImageData(img, 0, 0);
      this.noise = n;
    }
    ctx.fillStyle = ctx.createPattern(this.noise, 'repeat');
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    // Luz de la tarde: un poco más clara arriba a la izquierda, más oscura en las esquinas.
    const v = ctx.createRadialGradient(w * 0.35, h * 0.3, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(255, 240, 210, 0.06)');
    v.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    this.groundCanvas = bg;
    this.groundAt = `${this.ox},${this.oy},${this.tw},${w},${h}`;
  }

  // ---------- Dibujos ----------
  // Caja isométrica con techo a cuatro aguas (teja), plano (losa) o de una caída (zinc).
  box(ctx, { x, y, w, h, z }, wall, roofColor, roofType = 'losa', base = 0, opts = {}) {
    const P = (a, b, c) => this.P(a, b, c);
    // Paredes con luz: más claras arriba y más oscuras junto al piso (como la sombra real del suelo).
    const face = (pts, color, dark) => {
      const top = Math.min(...pts.map((q) => q[1]));
      const bottom = Math.max(...pts.map((q) => q[1]));
      const g = this.ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, shade(color, dark + 0.06));
      g.addColorStop(1, shade(color, dark - 0.16));
      this.poly(ctx, pts, g);
    };
    face([P(x + w, y, base), P(x + w, y + h, base), P(x + w, y + h, base + z), P(x + w, y, base + z)], wall, -0.24);
    face([P(x, y + h, base), P(x + w, y + h, base), P(x + w, y + h, base + z), P(x, y + h, base + z)], wall, 0);
    // Hiladas de bloque: líneas finas que dan textura a la pared.
    if (opts.texture && this.tw > 40) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0.14; k < z; k += 0.14) {
        ctx.moveTo(...P(x, y + h, base + k));
        ctx.lineTo(...P(x + w, y + h, base + k));
        ctx.lineTo(...P(x + w, y, base + k));
      }
      ctx.stroke();
    }
    // Arista iluminada en la esquina.
    this.line(ctx, P(x + w, y + h, base), P(x + w, y + h, base + z), 'rgba(255, 255, 255, 0.18)', Math.max(1, this.tw * 0.012));
    const Z = base + z;
    const e = 0.08;
    const [x0, y0, x1, y1] = [x - e, y - e, x + w + e, y + h + e];
    if (roofType === 'teja') {
      const top = P(x + w / 2, y + h / 2, Z + 0.45 * Math.min(w, h));
      this.poly(ctx, [P(x0, y0, Z), P(x1, y0, Z), top], shade(roofColor, -0.1));
      this.poly(ctx, [P(x0, y0, Z), P(x0, y1, Z), top], shade(roofColor, -0.05));
      this.poly(ctx, [P(x1, y0, Z), P(x1, y1, Z), top], shade(roofColor, -0.32));
      this.poly(ctx, [P(x0, y1, Z), P(x1, y1, Z), top], shade(roofColor, 0.1));
      // Filas de tejas.
      if (this.tw > 40) {
        ctx.strokeStyle = 'rgba(60, 20, 10, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 1; k < 4; k++) {
          const f = k / 4;
          const a = P(x0 + (x + w / 2 - x0) * f, y1 + (y + h / 2 - y1) * f, Z + 0.45 * Math.min(w, h) * f);
          const b = P(x1 + (x + w / 2 - x1) * f, y1 + (y + h / 2 - y1) * f, Z + 0.45 * Math.min(w, h) * f);
          ctx.moveTo(...a);
          ctx.lineTo(...b);
        }
        ctx.stroke();
      }
    } else if (roofType === 'zinc') {
      // Una caída hacia adelante, con las ondas de la plancha y algo de óxido.
      this.poly(ctx, [P(x1, y0, Z + 0.22), P(x1, y1, Z), P(x1, y1, Z - 0.03), P(x1, y0, Z + 0.19)], shade(roofColor, -0.3));
      const a = P(x0, y0, Z + 0.22);
      const b = P(x1, y1, Z);
      const g = this.ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, shade(roofColor, 0.12));
      g.addColorStop(1, shade(roofColor, -0.12));
      this.poly(ctx, [a, P(x1, y0, Z + 0.22), b, P(x0, y1, Z)], g);
      ctx.strokeStyle = shade(roofColor, -0.2);
      ctx.lineWidth = Math.max(0.5, this.tw * 0.012);
      ctx.beginPath();
      for (let k = 1; k < 8; k++) {
        const u = x0 + ((x1 - x0) * k) / 8;
        ctx.moveTo(...P(u, y0, Z + 0.22));
        ctx.lineTo(...P(u, y1, Z));
      }
      ctx.stroke();
      if (opts.rust) this.poly(ctx, [P(x0 + 0.1, y1 - 0.3, Z + 0.06), P(x0 + 0.45, y1 - 0.3, Z + 0.06), P(x0 + 0.45, y1, Z), P(x0 + 0.1, y1, Z)], 'rgba(150, 80, 40, 0.35)');
    } else {
      this.poly(ctx, [P(x0, y0, Z), P(x1, y0, Z), P(x1, y1, Z), P(x0, y1, Z)], roofColor);
      // Manchas de humedad en la losa.
      this.poly(ctx, [P(x0 + 0.15, y0 + 0.2, Z), P(x0 + 0.5, y0 + 0.2, Z), P(x0 + 0.5, y0 + 0.55, Z), P(x0 + 0.15, y0 + 0.55, Z)], 'rgba(0, 0, 0, 0.06)');
      this.poly(ctx, [P(x0, y1, Z), P(x1, y1, Z), P(x1, y1, Z + 0.08), P(x0, y1, Z + 0.08)], shade(roofColor, 0.12));
      this.poly(ctx, [P(x1, y0, Z), P(x1, y1, Z), P(x1, y1, Z + 0.08), P(x1, y0, Z + 0.08)], shade(roofColor, -0.15));
    }
  }

  // Ventana o puerta en la cara de adelante (+y) o la de la derecha (+x).
  pane(ctx, face, b, a0, a1, z0, z1, fill, base = 0) {
    const P = (u, z) => (face === 'y' ? this.P(b.x + u, b.y + b.h, base + z) : this.P(b.x + b.w, b.y + u, base + z));
    this.poly(ctx, [P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], fill);
  }

  windowsOf(hs) {
    const out = [];
    for (let s = 0; s < hs.stories; s++) {
      const z0 = 0.2 + s * 0.5;
      if (s > 0) out.push(['y', 0.38, 0.62, z0, z0 + 0.24]);
      out.push(['y', 0.1, 0.28, z0, z0 + 0.24], ['y', 0.72, 0.9, z0, z0 + 0.24], ['x', 0.3, 0.7, z0, z0 + 0.24]);
    }
    return out;
  }

  drawHouse(ctx, hs, night, quarantined) {
    const base = hs.stilts ? 0.25 : 0;
    const b = { x: hs.x, y: hs.y, w: 1, h: 1, z: hs.z };
    if (hs.stilts) {
      for (const [sx, sy] of [[0.1, 1], [0.9, 1], [0.9, 0.1]]) this.line(ctx, this.P(hs.x + sx, hs.y + sy, -0.15), this.P(hs.x + sx, hs.y + sy, base), '#6b4f33', Math.max(1, this.tw * 0.03));
      this.rect(ctx, hs.x - 0.05, hs.y + 1, 1.1, 0.7, '#8a6a45', base);
    }
    this.box(ctx, b, hs.wall, hs.roofColor, hs.roof, base, { texture: !hs.cana, rust: hash(hs.home, 21) < 0.5 });
    if (hs.cana) {
      ctx.strokeStyle = shade(hs.wall, -0.25);
      ctx.lineWidth = Math.max(0.5, this.tw * 0.012);
      ctx.beginPath();
      for (let k = 1; k < 8; k++) {
        ctx.moveTo(...this.P(hs.x + k / 8, hs.y + 1, base));
        ctx.lineTo(...this.P(hs.x + k / 8, hs.y + 1, base + hs.z));
      }
      ctx.stroke();
    }
    const glass = night > 0.3 ? `rgba(255, 214, 120, ${0.5 + 0.5 * night})` : '#33485c';
    // Puerta con marco y escalón.
    this.pane(ctx, 'y', b, 0.35, 0.65, 0, 0.5, shade(hs.wall, 0.35), base);
    this.pane(ctx, 'y', b, 0.38, 0.62, 0, 0.46, hash(hs.home, 33) < 0.5 ? '#6b4a33' : '#3d4f5f', base);
    this.pane(ctx, 'y', b, 0.56, 0.59, 0.2, 0.25, '#e6c36a', base);
    if (!hs.stilts) this.rect(ctx, hs.x + 0.34, hs.y + 1, 0.32, 0.12, '#a39d92', 0.03);
    for (const [f, a0, a1, z0, z1] of this.windowsOf(hs)) {
      this.pane(ctx, f, b, a0 - 0.03, a1 + 0.03, z0 - 0.03, z1 + 0.03, 'rgba(240, 235, 225, 0.75)', base);
      this.pane(ctx, f, b, a0, a1, z0, z1, glass, base);
      // Reflejo del cielo en el vidrio.
      if (night < 0.3) this.pane(ctx, f, b, a0, a0 + (a1 - a0) * 0.35, z0 + (z1 - z0) * 0.4, z1, 'rgba(180, 210, 235, 0.25)', base);
    }
    // Rejas en las ventanas de abajo, muy comunes en la costa.
    if (!hs.stilts && this.tw > 34 && hash(hs.home, 31) < 0.6) {
      ctx.strokeStyle = 'rgba(25, 20, 18, 0.75)';
      ctx.lineWidth = Math.max(0.6, this.tw * 0.012);
      ctx.beginPath();
      for (const [f, a0, a1, z0, z1] of this.windowsOf(hs)) {
        if (z0 > 0.5) continue;
        const Q = (u, z) => (f === 'y' ? this.P(b.x + u, b.y + 1, base + z) : this.P(b.x + 1, b.y + u, base + z));
        for (let u = a0 + 0.045; u < a1; u += 0.06) {
          ctx.moveTo(...Q(u, z0 - 0.02));
          ctx.lineTo(...Q(u, z1 + 0.02));
        }
      }
      ctx.stroke();
    }
    // Balcón con baranda en las casas de dos pisos o más.
    if (hs.stories >= 2 && !hs.stilts && hash(hs.home, 32) < 0.7) {
      const z = base + 0.5;
      const [u0, u1, d] = [0.18, 0.82, 0.2];
      this.poly(ctx, [this.P(b.x + u0, b.y + 1, z), this.P(b.x + u1, b.y + 1, z), this.P(b.x + u1, b.y + 1 + d, z), this.P(b.x + u0, b.y + 1 + d, z)], '#ddd6ca');
      this.poly(ctx, [this.P(b.x + u0, b.y + 1 + d, z), this.P(b.x + u1, b.y + 1 + d, z), this.P(b.x + u1, b.y + 1 + d, z - 0.05), this.P(b.x + u0, b.y + 1 + d, z - 0.05)], '#a39b8f');
      ctx.strokeStyle = 'rgba(40, 34, 30, 0.85)';
      ctx.lineWidth = Math.max(0.6, this.tw * 0.012);
      ctx.beginPath();
      ctx.moveTo(...this.P(b.x + u0, b.y + 1 + d, z + 0.17));
      ctx.lineTo(...this.P(b.x + u1, b.y + 1 + d, z + 0.17));
      for (let u = u0; u <= u1 + 0.001; u += 0.08) {
        ctx.moveTo(...this.P(b.x + u, b.y + 1 + d, z));
        ctx.lineTo(...this.P(b.x + u, b.y + 1 + d, z + 0.17));
      }
      ctx.stroke();
    }
    // Aire acondicionado en la pared del costado.
    if (!hs.stilts && !hs.cana && hash(hs.home, 34) < 0.4) this.box(ctx, { x: b.x + 1, y: b.y + 0.25, w: 0.09, h: 0.26, z: 0.16 }, '#dfe4e8', '#cfd5da', 'losa', base + 0.55);
    if (hs.tank) {
      // Tanque de agua azul en la losa, típico de la costa.
      const [tx, ty] = this.P(hs.x + 0.3, hs.y + 0.3, base + hs.z + 0.05);
      const r = this.tw * 0.09;
      ctx.fillStyle = '#2f6fb5';
      ctx.fillRect(tx - r, ty - r * 1.6, r * 2, r * 1.6);
      ctx.beginPath();
      ctx.ellipse(tx, ty - r * 1.6, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4f8fe8';
      ctx.fill();
    }
    if (quarantined) {
      // Cinta morada en la fachada: hogar en cuarentena.
      ctx.lineWidth = Math.max(1.5, this.tw * 0.06);
      ctx.strokeStyle = '#c084fc';
      ctx.beginPath();
      ctx.moveTo(...this.P(b.x, b.y + 1, base + 0.55));
      ctx.lineTo(...this.P(b.x + 1, b.y + 1, base + 0.08));
      ctx.moveTo(...this.P(b.x, b.y + 1, base + 0.08));
      ctx.lineTo(...this.P(b.x + 1, b.y + 1, base + 0.55));
      ctx.stroke();
    }
  }

  drawTree(ctx, d, now) {
    const [bx, by] = this.P(d.x, d.y);
    const tw = this.tw;
    const sh = ctx.createRadialGradient(bx + tw * 0.15, by, 0, bx + tw * 0.15, by, tw * 0.45);
    sh.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
    sh.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(bx + tw * 0.15, by, tw * 0.45, tw * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    const sway = Math.sin(now / 1400 + d.x) * tw * 0.03;
    if (d.type === 'palma') {
      const [tx, ty] = this.P(d.x, d.y, 1.7);
      ctx.strokeStyle = '#8a6a48';
      ctx.lineWidth = tw * 0.075;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + tw * 0.1, (by + ty) / 2, tx + sway, ty);
      ctx.stroke();
      // Anillos del tronco.
      ctx.strokeStyle = 'rgba(60, 40, 20, 0.35)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 6; k++) {
        const f = k / 6;
        const yy = by + (ty - by) * f;
        const xx = bx + (tx + sway - bx) * f + tw * 0.04 * Math.sin(f * Math.PI);
        ctx.beginPath();
        ctx.moveTo(xx - tw * 0.035, yy);
        ctx.lineTo(xx + tw * 0.035, yy);
        ctx.stroke();
      }
      // Hojas: arcos que caen, con un lado más claro.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        const ex = tx + sway + Math.cos(a) * tw * 0.42;
        const ey = ty + Math.sin(a) * tw * 0.16 + tw * 0.12;
        ctx.strokeStyle = k % 2 ? '#2f6b34' : '#4b8f43';
        ctx.lineWidth = tw * 0.06;
        ctx.beginPath();
        ctx.moveTo(tx + sway, ty);
        ctx.quadraticCurveTo(tx + sway + Math.cos(a) * tw * 0.25, ty - tw * 0.12, ex, ey);
        ctx.stroke();
      }
      ctx.fillStyle = '#5a4a2a';
      ctx.beginPath();
      ctx.arc(tx + sway, ty + tw * 0.03, tw * 0.05, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const [tx, ty] = this.P(d.x, d.y, 1);
      ctx.strokeStyle = '#5e4630';
      ctx.lineWidth = tw * 0.08;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // Copa en varias capas: sombra abajo a la derecha, luz arriba a la izquierda.
      const blobs = [[0.1, 0.05, 0.36, '#2c5a2a'], [-0.14, -0.02, 0.28, '#356b31'], [0.16, -0.08, 0.26, '#2f6230'], [0, -0.16, 0.3, '#3f7d3a'], [-0.08, -0.22, 0.2, '#5a9a4c']];
      for (const [dx, dy, r, c] of blobs) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(tx + dx * tw + sway, ty + dy * tw, r * tw, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Bote con casco en punta, borda clara y, en los grandes, cabina y mástil.
  drawBoat(ctx, d, now) {
    const bob = d.beached ? 0 : Math.sin(now / 700 + d.y) * 0.04;
    const L = d.big ? 2.4 : 1.2;
    const w = d.big ? 0.8 : 0.42;
    const hz = d.big ? 0.32 : 0.16;
    const { x, y } = d;
    const outline = (z) => [this.P(x, y, z), this.P(x + w, y, z), this.P(x + w, y + L * 0.72, z), this.P(x + w / 2, y + L, z), this.P(x, y + L * 0.72, z)];
    const hull = d.big ? '#7a2e2e' : d.color;
    if (!d.beached) this.poly(ctx, outline(-0.02).map(([a, b2]) => [a, b2 + this.tw * 0.04]), 'rgba(255, 255, 255, 0.18)');
    const lo = outline(bob);
    const hi = outline(bob + hz);
    // Costados visibles: el de la derecha y los dos de la proa.
    this.poly(ctx, [lo[1], lo[2], hi[2], hi[1]], shade(hull, -0.3));
    this.poly(ctx, [lo[2], lo[3], hi[3], hi[2]], shade(hull, -0.12));
    this.poly(ctx, [lo[3], lo[4], hi[4], hi[3]], hull);
    this.poly(ctx, hi, d.yate ? '#f4f4f4' : '#9a7650');
    ctx.strokeStyle = '#f4efe2';
    ctx.lineWidth = Math.max(1, this.tw * 0.02);
    ctx.beginPath();
    hi.forEach(([a, b2], k) => (k ? ctx.lineTo(a, b2) : ctx.moveTo(a, b2)));
    ctx.closePath();
    ctx.stroke();
    if (d.big || d.yate) this.box(ctx, { x: x + 0.12, y: y + L * 0.2, w: w - 0.24, h: L * 0.3, z: d.big ? 0.5 : 0.2 }, '#f4f4f4', '#dfe7ec', 'losa', bob + hz);
    if (d.big) this.line(ctx, this.P(x + w / 2, y + L * 0.6, bob + hz), this.P(x + w / 2, y + L * 0.6, bob + hz + 1.2), '#3a3f47', Math.max(1, this.tw * 0.03));
    else if (!d.yate) {
      // Motor fuera de borda.
      this.box(ctx, { x: x + w * 0.3, y: y - 0.12, w: w * 0.4, h: 0.14, z: 0.18 }, '#2f3b52', '#2f3b52', 'losa', bob + 0.05);
    }
  }

  drawCar(ctx, d) {
    this.box(ctx, { x: d.x, y: d.y, w: 0.85, h: 0.38, z: 0.2 }, d.color, d.color, 'losa', 0.05);
    this.box(ctx, { x: d.x + 0.2, y: d.y + 0.04, w: 0.45, h: 0.3, z: 0.14 }, '#2c3e50', shade(d.color, 0.1), 'losa', 0.25);
  }

  drawChurch(ctx, d, night) {
    const body = { x: d.x, y: d.y, w: 3.2, h: 2, z: 1.4 };
    this.box(ctx, body, '#efe6d2', '#b4643c', 'teja');
    const tower = { x: d.x + 3.2, y: d.y + 1, w: 0.9, h: 0.9, z: 2.8 };
    this.box(ctx, tower, '#e8dcc2', '#b4643c', 'teja');
    const [cx, cy] = this.P(d.x + 3.65, d.y + 1.45, 3.4);
    ctx.strokeStyle = '#3a3f47';
    ctx.lineWidth = Math.max(1, this.tw * 0.03);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - this.tw * 0.25);
    ctx.moveTo(cx - this.tw * 0.08, cy - this.tw * 0.17);
    ctx.lineTo(cx + this.tw * 0.08, cy - this.tw * 0.17);
    ctx.stroke();
    this.pane(ctx, 'y', body, 1.35, 1.85, 0, 0.75, '#6b4a33');
    for (const a of [0.4, 2.4]) this.pane(ctx, 'y', body, a, a + 0.35, 0.55, 1.05, night > 0.3 ? '#ffd678' : '#5a7a99');
  }

  // Farol de calle con su cable hasta el siguiente.
  drawLamp(ctx, d, night) {
    const tw = this.tw;
    const base = this.P(d.x, d.y);
    const top = this.P(d.x, d.y, 1.45);
    this.line(ctx, base, top, '#4a4f57', Math.max(1, tw * 0.035));
    const arm = this.P(d.x, d.y + 0.35, 1.4);
    this.line(ctx, top, arm, '#4a4f57', Math.max(1, tw * 0.025));
    ctx.fillStyle = night > 0.3 ? '#ffe6a3' : '#c9cdd2';
    ctx.beginPath();
    ctx.ellipse(arm[0], arm[1] + tw * 0.02, tw * 0.07, tw * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    if (d.next) {
      const b = this.P(d.next.x, d.next.y, 1.45);
      ctx.strokeStyle = 'rgba(20, 18, 22, 0.55)';
      ctx.lineWidth = Math.max(0.6, tw * 0.01);
      ctx.beginPath();
      ctx.moveTo(...top);
      ctx.quadraticCurveTo((top[0] + b[0]) / 2, (top[1] + b[1]) / 2 + tw * 0.12, b[0], b[1]);
      ctx.stroke();
    }
  }

  // Cordel con ropa tendida en el patio; se mueve con el viento.
  drawLaundry(ctx, d, now) {
    const tw = this.tw;
    const a = this.P(d.x, d.y, 0.5);
    const b = this.P(d.x + 0.95, d.y, 0.5);
    this.line(ctx, this.P(d.x, d.y), a, '#6b5a48', Math.max(1, tw * 0.02));
    this.line(ctx, this.P(d.x + 0.95, d.y), b, '#6b5a48', Math.max(1, tw * 0.02));
    this.line(ctx, a, b, 'rgba(230, 230, 230, 0.7)', Math.max(0.5, tw * 0.008));
    const colors = ['#e85d5d', '#f4f4f4', '#4f8fe8', '#f2c94c', '#5bbf8a', '#e87fb0'];
    for (let k = 0; k < 4; k++) {
      const f = 0.12 + k * 0.22;
      const x = a[0] + (b[0] - a[0]) * f;
      const y = a[1] + (b[1] - a[1]) * f;
      const sway = Math.sin(now / 600 + k + d.x) * tw * 0.015;
      ctx.fillStyle = colors[(k + d.k) % colors.length];
      ctx.beginPath();
      ctx.moveTo(x - tw * 0.06, y);
      ctx.lineTo(x + tw * 0.06, y + tw * 0.03);
      ctx.lineTo(x + tw * 0.06 + sway, y + tw * 0.17);
      ctx.lineTo(x - tw * 0.06 + sway, y + tw * 0.14);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawPot(ctx, d) {
    const [x, y] = this.P(d.x, d.y, 0.08);
    const u = this.tw;
    ctx.fillStyle = '#a0522d';
    ctx.beginPath();
    ctx.moveTo(x - u * 0.06, y - u * 0.08);
    ctx.lineTo(x + u * 0.06, y - u * 0.08);
    ctx.lineTo(x + u * 0.045, y + u * 0.02);
    ctx.lineTo(x - u * 0.045, y + u * 0.02);
    ctx.fill();
    for (const [dx, dy, r, c] of [[-0.04, -0.14, 0.07, '#2f6b34'], [0.04, -0.15, 0.06, '#3f8a43'], [0, -0.2, 0.06, '#4b9a4c']]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x + dx * u, y + dy * u, r * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBin(ctx, d) {
    this.box(ctx, { x: d.x - 0.12, y: d.y - 0.12, w: 0.24, h: 0.24, z: 0.32 }, '#2f7d4f', '#256b42');
  }

  // Asta con la bandera del Ecuador en el patio del colegio.
  drawFlag(ctx, d, now) {
    const tw = this.tw;
    const base = this.P(d.x, d.y);
    const top = this.P(d.x, d.y, 2.2);
    this.line(ctx, base, top, '#d5d8dc', Math.max(1, tw * 0.03));
    const wave = (k) => Math.sin(now / 350 + k * 1.7) * tw * 0.025;
    const L = tw * 0.5;
    const h = tw * 0.1;
    ['#f7d117', '#0b4ea2', '#e1251b'].forEach((c, k) => {
      const y0 = top[1] + (k === 0 ? 0 : k === 1 ? h * 2 : h * 3);
      const hh = k === 0 ? h * 2 : h;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(top[0], y0);
      ctx.quadraticCurveTo(top[0] + L / 2, y0 + wave(1), top[0] + L, y0 + wave(2));
      ctx.lineTo(top[0] + L, y0 + hh + wave(2));
      ctx.quadraticCurveTo(top[0] + L / 2, y0 + hh + wave(1), top[0], y0 + hh);
      ctx.fill();
    });
  }

  // Aro de básquet de la cancha del colegio.
  drawHoop(ctx, d) {
    const tw = this.tw;
    this.line(ctx, this.P(d.x, d.y), this.P(d.x, d.y, 1.5), '#5d6d7e', Math.max(1, tw * 0.04));
    const [bx, by] = this.P(d.x - 0.1, d.y, 1.55);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(bx - tw * 0.16, by - tw * 0.2, tw * 0.32, tw * 0.2);
    ctx.strokeStyle = '#e85d5d';
    ctx.lineWidth = Math.max(1, tw * 0.02);
    ctx.strokeRect(bx - tw * 0.07, by - tw * 0.12, tw * 0.14, tw * 0.1);
    ctx.beginPath();
    ctx.ellipse(bx - tw * 0.08, by + tw * 0.01, tw * 0.08, tw * 0.03, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawStall(ctx, x, y, k, closed) {
    const b = { x, y, w: 1.4, h: 1, z: 0.5 };
    this.box(ctx, b, '#8a6440', '#8a6440');
    const colors = [['#e85d5d', '#f4efe2'], ['#4f8fe8', '#f4efe2'], ['#f2c94c', '#e85d5d'], ['#5bbf8a', '#f4efe2']][k % 4];
    for (let s = 0; s < 4; s++) this.poly(ctx, [this.P(x - 0.1 + s * 0.4, y - 0.1, 0.95), this.P(x + 0.3 + s * 0.4, y - 0.1, 0.95), this.P(x + 0.3 + s * 0.4, y + 1.15, 0.8), this.P(x - 0.1 + s * 0.4, y + 1.15, 0.8)], colors[s % 2]);
    if (!closed) {
      const fish = /marisco|pescado/i.test(this.places.market.label);
      for (let s = 0; s < 3; s++) {
        for (let r = 0; r < 3; r++) {
          const [fx, fy] = this.P(x + 0.18 + s * 0.42 + r * 0.1, y + 0.9 - r * 0.08, 0.55);
          if (fish && k % 2 === 0) {
            // Pescado sobre hielo.
            ctx.fillStyle = r === 1 ? '#c9d6df' : '#9fb3c2';
            ctx.beginPath();
            ctx.ellipse(fx, fy, this.tw * 0.07, this.tw * 0.025, -0.3, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = [['#f2994a', '#f2c94c', '#eb5757'], ['#6fcf97', '#27ae60', '#a3d977'], ['#eb5757', '#c0392b', '#f2994a']][s][r];
            ctx.beginPath();
            ctx.arc(fx, fy, this.tw * 0.04, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // Gavetas apiladas delante del puesto.
      this.box(ctx, { x: x + 1.05, y: y + 1.12, w: 0.3, h: 0.22, z: 0.16 }, '#b07a45', '#8a5a30');
      this.box(ctx, { x: x + 1.05, y: y + 1.12, w: 0.3, h: 0.22, z: 0.14 }, '#c08a55', k % 2 ? '#6fcf97' : '#f2994a', 'losa', 0.16);
    }
  }

  // Edificio de trabajo según el tipo: atunera con chimenea, astillero con un barco, oficinas de vidrio…
  drawWork(ctx, w, night, now) {
    const b = w.box;
    const glass = night > 0.3 ? 'rgba(255, 214, 120, 0.8)' : '#3b5268';
    if (w.kind === 'bodegas') {
      for (const dy of [0, 2]) {
        const bb = { ...b, y: b.y + dy };
        this.box(ctx, bb, w.wall, w.roof, 'zinc');
        this.pane(ctx, 'y', bb, 0.5, 1.6, 0, 0.8, '#5b636b');
        this.pane(ctx, 'y', bb, 2.3, 3.4, 0, 0.8, '#5b636b');
      }
      return;
    }
    this.box(ctx, b, w.wall, w.roof, w.kind === 'astillero' || w.kind === 'taller' ? 'zinc' : 'losa');
    if (w.kind === 'oficinas') {
      for (let f = 0; f < 8; f++) {
        for (let k = 0; k < 4; k++) this.pane(ctx, 'y', b, 0.15 + k * 0.7, 0.65 + k * 0.7, 0.2 + f * 0.55, 0.55 + f * 0.55, glass);
        for (let k = 0; k < 4; k++) this.pane(ctx, 'x', b, 0.15 + k * 0.7, 0.65 + k * 0.7, 0.2 + f * 0.55, 0.55 + f * 0.55, glass);
      }
    } else {
      for (let k = 0; k < Math.floor(b.w); k++) this.pane(ctx, 'y', b, 0.3 + k, 0.8 + k, b.z * 0.45, b.z * 0.8, glass);
    }
    if (w.kind === 'atunera' || w.kind === 'fabrica') {
      // Chimenea con humo.
      const c = { x: b.x + b.w - 0.9, y: b.y + 0.3, w: 0.45, h: 0.45, z: b.z + 1.3 };
      this.box(ctx, c, '#9b8f84', '#5d5650');
      for (let k = 0; k < 4; k++) {
        const t = (now / 2600 + k / 4) % 1;
        const [sx, sy] = this.P(c.x + 0.22 + t * 0.6, c.y + 0.22, c.z + 0.2 + t * 1.6);
        ctx.fillStyle = `rgba(220, 220, 220, ${0.35 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, this.tw * (0.12 + t * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (w.kind === 'astillero') this.drawBoat(ctx, { x: w.area.x + 2.8, y: w.area.y + 0.4, big: true, beached: true }, now);
    if (w.kind === 'puerto') {
      for (let k = 0; k < 6; k++) this.box(ctx, { x: w.area.x + 0.3 + (k % 3) * 1.4, y: w.area.y + 1.6 + Math.floor(k / 3) * 0.8, w: 1.2, h: 0.55, z: 0.5 }, pick(['#c0473d', '#2f6fb5', '#2a9d8f', '#f2994a'], hash(k, 9)), '#8a95a3');
      const g = this.P(b.x - 0.4, b.y + 1.5);
      const top = this.P(b.x - 0.4, b.y + 1.5, 3.2);
      this.line(ctx, g, top, '#f2c94c', this.tw * 0.08);
      this.line(ctx, top, this.P(b.x - 2.6, b.y + 1.5, 3.2), '#f2c94c', this.tw * 0.06);
    }
    if (w.kind === 'mall') this.pane(ctx, 'y', b, 0.6, b.w - 0.6, b.z * 0.62, b.z * 0.88, '#c0473d');
  }

  // Cartel con texto sobre un punto del mundo.
  sign(ctx, x, y, z, text, bg = '#16121f', color = '#f4f4f4') {
    const [sx, sy] = this.P(x, y, z);
    const fs = Math.max(11, this.tw * 0.2);
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(text).width + fs * 0.9;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(sx - w / 2, sy - fs * 1.5, w, fs * 1.5, fs * 0.3);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, sx, sy - fs * 0.45);
    ctx.textAlign = 'start';
  }

  // Bus urbano: carrocería blanca con franjas, ventanas con pasajeros, parabrisas, letrero y ruedas.
  drawBus(ctx, x, y, riders = []) {
    const b = { x, y, w: 2.4, h: 0.85, z: 0.85 };
    const tw = this.tw;
    this.box(ctx, b, '#f1efe8', '#dcd8cc', 'losa', 0.1);
    this.pane(ctx, 'y', b, 0, 2.4, 0.2, 0.3, '#2f80ed', 0.1);
    this.pane(ctx, 'y', b, 0, 2.4, 0.3, 0.34, '#f2c94c', 0.1);
    for (let k = 0; k < 4; k++) this.pane(ctx, 'y', b, 0.15 + k * 0.5, 0.58 + k * 0.5, 0.4, 0.72, '#22313f', 0.1);
    this.pane(ctx, 'y', b, 2.1, 2.32, 0.05, 0.7, '#3b4b5a', 0.1); // puerta
    // Cabezas de los pasajeros en las ventanas, con el color de su estado.
    riders.slice(0, 8).forEach((r, k) => {
      const [hx, hy] = this.P(x + 0.28 + (k % 4) * 0.5 + (k >= 4 ? 0.2 : 0), y + b.h, 0.1 + 0.6);
      ctx.fillStyle = r.skin;
      ctx.beginPath();
      ctx.arc(hx, hy, tw * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(hx, hy - tw * 0.1, tw * 0.025, 0, Math.PI * 2);
      ctx.fill();
    });
    this.pane(ctx, 'x', b, 0.08, 0.77, 0.38, 0.76, '#2c4a63', 0.1); // parabrisas
    this.pane(ctx, 'x', b, 0.2, 0.65, 0.77, 0.83, '#111', 0.1);
    ctx.fillStyle = '#ffb347';
    const [lx, ly] = this.P(x + b.w, y + 0.42, 0.9);
    ctx.font = `700 ${Math.max(7, tw * 0.07)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('MANTA', lx, ly);
    ctx.textAlign = 'start';
    for (const u of [0.45, 1.95]) {
      const [wx, wy] = this.P(x + u, y + b.h, 0.1);
      ctx.fillStyle = '#16161a';
      ctx.beginPath();
      ctx.ellipse(wx, wy, tw * 0.11, tw * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a7f87';
      ctx.beginPath();
      ctx.ellipse(wx, wy, tw * 0.045, tw * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Personas ----------
  // Dónde está cada persona en este momento del día (fase 0 = medianoche, 0.5 = mediodía).
  where(p, day, phase, code, closed, now) {
    const quarantined = (code & 8) !== 0;
    const state = code & 7;
    const roaming = this.zombie && state === 2 && !quarantined;
    if (phase < 0.2 || phase > 0.9) {
      if (!roaming) return null; // de noche todos en casa…
      // …menos los zombis, que vagan por la calle.
      const c = ROADS[p.j3 < 0.5 ? 0 : 1];
      const x0 = this.plan.landX(c) + 0.5;
      const x = x0 + ((p.j1 * 23 + now / 4000) % (G - x0 - 1));
      return { x, y: c + (p.j2 - 0.5) * 1.4, walking: true, dir: 1 };
    }
    const idle = (pt, amp = 0.07) => ({ x: pt.x + amp * Math.sin(now / 900 + p.j1 * 9), y: pt.y + amp * Math.cos(now / 1100 + p.j2 * 9), walking: false, dir: Math.sin(now / 2000 + p.j3 * 6) > 0 ? 1 : -1 });
    let goes = !quarantined;
    if (p.role === 0) goes &&= hash(p.i, day) < 0.35 && !closed.mercado; // al mercado algunos días
    if (p.role === 1) goes &&= !closed.colegio;
    if (!goes) return idle(p.yard, 0.12);
    const { travel } = p.route;
    const L = 0.27 + p.j1 * 0.05;
    const B = 0.66 + p.j2 * 0.06;
    if (phase < L || phase >= B + travel) return idle(p.yard);
    if (p.bus && phase > 0.37 && phase < 0.645) return null; // se fue en el bus
    if (phase < L + travel) return this.along(p.route, (phase - L) / travel, false);
    if (phase < B) return idle(p.dest, p.bus ? 0.03 : 0.18);
    return this.along(p.route, (phase - B) / travel, true);
  }

  // Figura con proporciones de persona (cabeza chica, piernas largas), luz desde la izquierda y sombra suave.
  drawPerson(ctx, p, pos, state, now) {
    const [sx, sy] = this.P(pos.x, pos.y);
    const s = p.scale;
    const u = this.tw * 0.085 * s;
    const zombie = this.zombie && state === 2;
    const skin = zombie ? ZOMBIE_SKIN : p.skin;
    const t = now * (zombie ? 0.005 : 0.011) + p.j1 * 10;
    const swing = pos.walking ? Math.sin(t) * u * 0.5 : 0;
    const bob = pos.walking ? Math.abs(Math.cos(t)) * u * 0.12 : 0;
    const lean = zombie ? u * 0.45 * pos.dir : 0;
    const y0 = sy - bob;
    // Sombra en el piso.
    const sh = ctx.createRadialGradient(sx, sy, 0, sx, sy, u * 1.6);
    sh.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    sh.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(sx, sy, u * 1.6, u * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'round';
    // Piernas y zapatos.
    const hipY = y0 - u * 2.5;
    ctx.strokeStyle = p.pants;
    ctx.lineWidth = u * 0.52;
    ctx.beginPath();
    ctx.moveTo(sx - u * 0.28, hipY);
    ctx.lineTo(sx - u * 0.3 + swing, y0 - u * 0.25);
    ctx.moveTo(sx + u * 0.28, hipY);
    ctx.lineTo(sx + u * 0.3 - swing, y0 - u * 0.25);
    ctx.stroke();
    ctx.fillStyle = '#1b1712';
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx + k * u * 0.3 - k * swing, y0 - u * 0.12, u * 0.32, u * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Torso con volumen.
    const tx = sx + lean * 0.5;
    const torsoTop = y0 - u * 4.25;
    if (p.role === 1 && !zombie) {
      ctx.fillStyle = pick(['#c0392b', '#2f6fb5', '#27ae60', '#8e44ad'], p.j2);
      ctx.beginPath();
      ctx.roundRect(tx - u * 0.62 - pos.dir * u * 0.35, torsoTop + u * 0.2, u * 1.24, u * 1.5, u * 0.3);
      ctx.fill();
    }
    const g = ctx.createLinearGradient(tx - u * 0.8, 0, tx + u * 0.8, 0);
    const shirt = zombie ? shade(p.shirt, -0.45) : p.shirt;
    g.addColorStop(0, shade(shirt, 0.18));
    g.addColorStop(1, shade(shirt, -0.28));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(tx - u * 0.72, torsoTop, u * 1.44, u * 1.95, [u * 0.5, u * 0.5, u * 0.22, u * 0.22]);
    ctx.fill();
    if (zombie) {
      // Ropa rota y manchada.
      ctx.fillStyle = '#5a0f0f';
      ctx.beginPath();
      ctx.arc(tx + u * 0.2, torsoTop + u * 0.9, u * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.moveTo(tx - u * 0.7, torsoTop + u * 1.95);
      for (let k = 0; k <= 6; k++) ctx.lineTo(tx - u * 0.7 + (k * u * 1.4) / 6, torsoTop + u * (k % 2 ? 1.7 : 1.95));
      ctx.fill();
    }
    // Brazos: manga, antebrazo y mano. Los zombis los llevan estirados hacia adelante.
    const shoulderY = torsoTop + u * 0.35;
    const arm = (k, hx, hy) => {
      const sx0 = tx + k * u * 0.66;
      const mx = (sx0 + hx) / 2;
      const my = (shoulderY + hy) / 2;
      ctx.lineWidth = u * 0.36;
      ctx.strokeStyle = shirt;
      ctx.beginPath();
      ctx.moveTo(sx0, shoulderY);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.lineWidth = u * 0.28;
      ctx.strokeStyle = skin;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(hx, hy, u * 0.17, 0, Math.PI * 2);
      ctx.fill();
    };
    if (zombie) for (const k of [-1, 1]) arm(k, tx + k * u * 0.25 + pos.dir * u * 1.7, shoulderY + u * 0.15 + k * u * 0.12);
    else for (const k of [-1, 1]) arm(k, tx + k * u * 0.85 + k * swing * 0.35 * (k > 0 ? 1 : -1), shoulderY + u * 1.75);
    // Cuello, cabeza y pelo.
    const hx = sx + lean;
    const hy = torsoTop - u * 0.62;
    ctx.fillStyle = shade(skin, -0.15);
    ctx.fillRect(hx - u * 0.16, torsoTop - u * 0.25, u * 0.32, u * 0.3);
    if (p.who.female && p.who.age >= 6 && !zombie) {
      ctx.fillStyle = p.hair;
      ctx.beginPath();
      ctx.roundRect(hx - u * 0.52, hy - u * 0.2, u * 1.04, u * 1.1, u * 0.3);
      ctx.fill();
    }
    const hg = ctx.createRadialGradient(hx - u * 0.18, hy - u * 0.2, u * 0.05, hx, hy, u * 0.55);
    hg.addColorStop(0, shade(skin, 0.15));
    hg.addColorStop(1, shade(skin, -0.2));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(hx, hy, u * 0.44, u * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = zombie ? '#3e4a33' : p.hair;
    ctx.beginPath();
    ctx.ellipse(hx, hy - u * 0.18, u * 0.47, u * 0.36, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    if (this.tw > 60) {
      ctx.fillStyle = zombie ? '#ff2b2b' : '#1b1712';
      ctx.fillRect(hx - u * 0.2 + pos.dir * u * 0.06, hy - u * 0.02, u * 0.1, u * 0.1);
      ctx.fillRect(hx + u * 0.1 + pos.dir * u * 0.06, hy - u * 0.02, u * 0.1, u * 0.1);
    }
    if (zombie) {
      // Un leve resplandor verde: se distinguen de lejos.
      ctx.fillStyle = 'rgba(120, 255, 90, 0.12)';
      ctx.beginPath();
      ctx.ellipse(hx, hy + u * 1.5, u * 1.3, u * 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return { sx, sy, top: hy - u * 0.7, u: u * 1.12 };
  }

  // El rombo sobre la cabeza: el color es el estado del día.
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
    const fs = Math.max(11, this.tw * 0.22);
    ctx.font = `800 ${fs}px Inter, system-ui, sans-serif`;
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
      const activeText = this.zombie ? (active === 1 ? 'zombi' : 'zombis') : active === 1 ? 'caso activo' : 'casos activos';
      return `<button type="button" data-strategy="${k}" class="${k === this.strategy ? 'on' : ''}" aria-pressed="${k === this.strategy}"><b>${label}</b><span><em>${active}</em> ${activeText} hoy, <em>${total}</em> ${T.bittenM} en total</span></button>`;
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
    const prevBase = Math.max(0, day - 1) * t.N;
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
    const mins = Math.floor(((phase * 24 - hours) * 60) / 15) * 15;
    this.clockEl.innerHTML = `<b>Día ${day}</b> ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} <span>${night > 0.5 ? 'noche' : phase < 0.5 ? 'mañana' : 'tarde'}</span>`;

    const camKey = `${this.ox},${this.oy},${this.tw},${this.canvas.width},${this.canvas.height}`;
    if (this.groundAt !== camKey) this.drawGround();
    ctx.drawImage(this.groundCanvas, 0, 0);
    // Olas: líneas que se mueven sobre el agua.
    if (this.look.water) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = Math.max(1, this.tw * 0.025);
      ctx.beginPath();
      for (let k = 0; k < 50; k++) {
        const y = T + 1 + ((hash(k, 12) * (G - T) + now / 3000) % (G - T - 1));
        const x = hash(k, 11) * Math.max(0, y - T - 1.2);
        ctx.moveTo(...this.P(x, y));
        ctx.lineTo(...this.P(x + 0.5, y));
      }
      ctx.stroke();
    }

    // Todo lo que tiene altura se ordena de atrás hacia adelante.
    const items = [];
    for (const hs of this.houses) {
      const quarantined = hs.members.some((i) => run.frames[base + i] & 8);
      items.push({ key: hs.x + hs.y + 1, draw: () => this.drawHouse(ctx, hs, night, quarantined) });
    }
    for (const d of this.decor) {
      const special = { bote: () => this.drawBoat(ctx, d, now), auto: () => this.drawCar(ctx, d), iglesia: () => this.drawChurch(ctx, d, night), farol: () => this.drawLamp(ctx, d, night), ropa: () => this.drawLaundry(ctx, d, now), maceta: () => this.drawPot(ctx, d), tacho: () => this.drawBin(ctx, d), bandera: () => this.drawFlag(ctx, d, now), aro: () => this.drawHoop(ctx, d) };
      const draw = special[d.type] ?? (() => this.drawTree(ctx, d, now));
      items.push({ key: d.type === 'iglesia' ? d.x + d.y + 2.6 : d.x + d.y + (d.type === 'bote' ? 0.8 : 0), draw });
    }
    const ma = this.places.market.area;
    for (let k = 0; k < 6; k++) {
      const x = ma.x + 0.4 + (k % 2) * 3.6;
      const y = ma.y + 0.5 + Math.floor(k / 2) * 2.3;
      items.push({ key: x + y + 1.2, draw: () => this.drawStall(ctx, x, y, k, closed.mercado) });
    }
    const sb = this.places.school;
    items.push({ key: sb.box.x + sb.box.y + (sb.box.w + sb.box.h) / 2, draw: () => {
      this.box(ctx, sb.box, sb.wall, sb.roof, 'losa', 0, { texture: true });
      this.pane(ctx, 'y', sb.box, 0, sb.box.w, 0, 0.22, '#3d6fb0');
      this.pane(ctx, 'y', sb.box, 0, sb.box.w, 0.22, 0.27, '#f2c94c');
      this.pane(ctx, 'y', sb.box, sb.box.w / 2 - 0.3, sb.box.w / 2 + 0.3, 0, 0.62, '#5a3d28');
      const glass = night > 0.3 ? 'rgba(255, 214, 120, 0.8)' : '#3b5268';
      for (let k = 0; k < 4; k++) this.pane(ctx, 'y', sb.box, 0.3 + k * 1.05, 0.8 + k * 1.05, 0.45, 0.9, glass);
      for (let k = 0; k < 2; k++) this.pane(ctx, 'x', sb.box, 0.3 + k * 1.2, 0.95 + k * 1.2, 0.45, 0.9, glass);
    } });
    const wk = this.places.work;
    items.push({ key: wk.box.x + wk.box.y + (wk.box.w + wk.box.h) / 2, draw: () => this.drawWork(ctx, wk, night, now) });
    const st = this.stop;
    items.push({ key: st.x + st.y - 0.6, draw: () => this.box(ctx, { x: st.x - 0.55, y: st.y - 0.5, w: 1.1, h: 0.3, z: 0.75 }, '#5d6d7e', '#2f80ed') });
    let busVisible = false;
    if (this.hasBus) {
      const c = ROADS[0];
      const x0 = this.plan.landX(c) - 3;
      const x1 = G + 2;
      const stopX = st.x - 1.2;
      const ease = (u) => 1 - (1 - u) ** 2;
      let busX = null;
      for (const [a, b, cc, d] of [[0.33, 0.355, 0.378, 0.405], [0.605, 0.632, 0.652, 0.68]]) {
        if (phase >= a && phase < b) busX = x0 + (stopX - x0) * ease((phase - a) / (b - a));
        else if (phase >= b && phase < cc) busX = stopX;
        else if (phase >= cc && phase < d) busX = stopX + (x1 - stopX) * ((phase - cc) / (d - cc)) ** 2;
      }
      if (busX !== null) {
        busVisible = true;
        // Pasajeros del barrio arriba del bus (después de subir en la mañana, antes de bajar en la tarde).
        const aboard = (phase >= 0.37 && phase < 0.42) || (phase >= 0.6 && phase < 0.645);
        const riders = aboard ? this.people.filter((p) => p.bus && !(run.frames[base + p.i] & 8)).map((p) => ({ skin: (run.frames[base + p.i] & 7) === 2 && this.zombie ? ZOMBIE_SKIN : p.skin, color: STATE_COLOR[run.frames[base + p.i] & 7] })) : [];
        this.busAt = { x: busX + 1.2, y: c - 0.45 };
        items.push({ key: busX + c + 0.4, draw: () => this.drawBus(ctx, busX, c - 0.9, riders) });
      }
    }

    const drawn = [];
    for (const p of this.people) {
      const code = run.frames[base + p.i];
      const pos = this.where(p, day, phase, code, closed, now);
      if (!pos) continue;
      const state = code & 7;
      if (this.zombie && state === 2) pos.x += 0.04 * Math.sin(now / 300 + p.j3 * 9);
      const isNew = day > 0 && state === 2 && (run.frames[prevBase + p.i] & 7) !== 2;
      items.push({ key: pos.x + pos.y, draw: () => drawn.push({ p, state, isNew, ...this.drawPerson(ctx, p, pos, state, now) }) });
    }
    items.sort((a, b) => a.key - b.key);
    for (const it of items) it.draw();

    // Fumigación: niebla que cruza el barrio.
    if (fumigating) {
      for (let k = 0; k < 40; k++) {
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
    // Noche: el barrio se oscurece; ventanas, faroles, rombos y carteles quedan encima.
    const { width: W, height: H } = this.canvas;
    if (night > 0) {
      ctx.fillStyle = `rgba(8, 10, 34, ${0.6 * night})`;
      ctx.fillRect(0, 0, W, H);
    } else if (phase > 0.7) {
      ctx.fillStyle = `rgba(255, 130, 50, ${0.13 * Math.min(1, (phase - 0.7) / 0.08)})`;
      ctx.fillRect(0, 0, W, H);
    } else if (phase < 0.32) {
      ctx.fillStyle = `rgba(255, 190, 120, ${0.1 * (1 - (phase - 0.26) / 0.06)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (night > 0.3) {
      ctx.globalAlpha = night;
      for (const hs of this.houses) {
        const b = { x: hs.x, y: hs.y, w: 1, h: 1 };
        for (const [f, a0, a1, z0, z1] of this.windowsOf(hs)) if (hash(hs.home, Math.round(z0 * 10 + a0 * 100)) < 0.7) this.pane(ctx, f, b, a0, a1, z0, z1, '#ffd678', hs.stilts ? 0.25 : 0);
      }
      for (const c of ROADS) {
        for (let x = this.plan.landX(c) + 1.5; x < G; x += 3) {
          const [lx, ly] = this.P(x, c - 1.2, 0.2);
          const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, this.tw * 0.9);
          g.addColorStop(0, 'rgba(255, 210, 130, 0.35)');
          g.addColorStop(1, 'rgba(255, 210, 130, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(lx - this.tw, ly - this.tw, this.tw * 2, this.tw * 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Carteles de los lugares.
    const pl = this.places;
    this.sign(ctx, ma.x + ma.w / 2, ma.y + ma.h / 2, 1.8, closed.mercado ? `CERRADO: ${pl.market.label}` : pl.market.label, closed.mercado ? '#b42318' : undefined);
    this.sign(ctx, sb.box.x + sb.box.w / 2, sb.box.y + sb.box.h / 2, sb.box.z + 0.9, closed.colegio ? `CERRADO: ${sb.label}` : sb.label, closed.colegio ? '#b42318' : undefined);
    this.sign(ctx, wk.box.x + wk.box.w / 2, wk.box.y + wk.box.h / 2, wk.box.z + 0.9, wk.label);
    if (this.hasBus) this.sign(ctx, st.x, st.y - 0.4, 1.35, 'Parada de bus', '#2f6fb5');
    // Si hoy alguien del barrio se contagió en el bus, se avisa encima del bus.
    if (busVisible && this.people.some((p) => story.infectedDay[p.i] === day && story.infectedLayer[p.i] === 3)) {
      this.sign(ctx, this.busAt.x, this.busAt.y, 1.9, this.zombie ? '¡Mordida en el bus!' : 'Contagio en el bus', '#b42318');
    }
    if (fumigating) this.sign(ctx, G / 2, G / 2, 2.4, 'Brigada de fumigación', '#0f766e');

    // Encima de todo: rombos, efectos y globos de lo que pasó hoy, y quién mordió a quién.
    this.hits = [];
    const hover = this.mouse ? this.hitAtPoint(drawn) : -1;
    const byI = new Map(drawn.map((d) => [d.p.i, d]));
    for (const d of drawn) {
      this.hits.push({ i: d.p.i, x: d.sx, y: d.sy - d.u * 2.4 });
      // Nuevo zombi: un destello verde que se expande el día en que aparece.
      if (d.isNew && this.zombie && phase > 0.2 && phase < 0.75) {
        const k = (now / 900) % 1;
        ctx.strokeStyle = `rgba(120, 255, 120, ${0.7 * (1 - k)})`;
        ctx.lineWidth = Math.max(2, this.tw * 0.06);
        ctx.beginPath();
        ctx.ellipse(d.sx, d.sy, d.u * (1.5 + k * 4), d.u * (0.7 + k * 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.drawPlumbob(ctx, d.sx + (this.zombie && d.state === 2 ? d.u * 0.35 : 0), d.top, d.u / d.p.scale, STATE_COLOR[d.state] ?? STATE_COLOR[0], now, d.p.j1);
    }
    if (phase > 0.33 && phase < 0.68) {
      for (const d of drawn) {
        const by = story.infectedBy[d.p.i];
        if (story.infectedDay[d.p.i] !== day || day === 0 || !byI.has(by)) continue;
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
    for (const d of drawn) {
      const i = d.p.i;
      const f = d.p.who.female;
      const y = d.top - d.u * 2.6;
      if (story.infectedDay[i] === day && day > 0 && phase > 0.33) this.bubble(ctx, d.sx, y, this.zombie ? (f ? '¡Mordida!' : '¡Mordido!') : f ? 'Contagiada' : 'Contagiado', '#ff8a80');
      else if (d.isNew && phase > 0.2) this.bubble(ctx, d.sx, y, this.zombie ? '¡Nuevo zombi!' : 'Con síntomas', '#9cf27a');
      else if (story.vaccinatedDay[i] === day) this.bubble(ctx, d.sx, y, f ? 'Vacunada' : 'Vacunado', '#5eead4');
      else if (story.detectedDay[i] === day) this.bubble(ctx, d.sx, y, 'Reportado', '#fcd34d');
    }
    // Persona elegida (Modo Vecino) o bajo el cursor: anillo y nombre.
    for (const i of new Set([this.player.selected, hover])) {
      const d = byI.get(i);
      if (!d) continue;
      const pulse = 1 + 0.15 * Math.sin(now / 200);
      ctx.strokeStyle = i === this.player.selected ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = Math.max(1.5, this.tw * 0.05);
      ctx.beginPath();
      ctx.ellipse(d.sx, d.sy, d.u * 2.2 * pulse, d.u * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      const fs = Math.max(12, this.tw * 0.24);
      ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0c0a12';
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
    const isNight = phase < 0.2 || phase > 0.9;
    const key = `${this.strategy}:${day}:${isNight}:${closed.mercado}${closed.colegio}${fumigating}`;
    if (key === this.captionKey) return;
    this.captionKey = key;
    const t = this.trace;
    const run = t[this.strategy];
    const s = run.story;
    let vax = 0;
    let bit = 0;
    let fresh = 0;
    let q = 0;
    for (const p of this.people) {
      if (s.vaccinatedDay[p.i] === day) vax++;
      if (s.infectedDay[p.i] === day && day > 0) bit++;
      if (day > 0 && (run.frames[day * t.N + p.i] & 7) === 2 && (run.frames[(day - 1) * t.N + p.i] & 7) !== 2) fresh++;
    }
    for (const hs of this.houses) if (hs.members.some((i) => run.frames[day * t.N + i] & 8)) q++;
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    const parts = [];
    if (fresh) parts.push(this.zombie ? n(fresh, 'vecino se convirtió en zombi', 'vecinos se convirtieron en zombis') : n(fresh, 'vecino empezó con síntomas', 'vecinos empezaron con síntomas'));
    if (bit) parts.push(this.zombie ? n(bit, 'mordido', 'mordidos') : n(bit, 'contagio nuevo', 'contagios nuevos'));
    if (vax) parts.push(n(vax, 'vacuna aplicada', 'vacunas aplicadas'));
    if (q) parts.push(`${n(q, 'casa', 'casas')} en cuarentena, con cinta morada`);
    if (closed.mercado) parts.push('el mercado está cerrado');
    if (closed.colegio) parts.push('el colegio está cerrado y los niños se quedan en casa');
    if (fumigating) parts.push('pasa la brigada de fumigación');
    const nightNote = this.zombie && isNight ? ' De noche todos duermen, menos los zombis.' : '';
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
    this.captionEl.textContent = (parts.length ? `Hoy: ${list}.` : 'Un día normal en el barrio.') + nightNote;
    // Un destello verde en el borde cuando aparece un zombi nuevo.
    if (fresh && this.zombie && this.strategy !== 'adaptativa') {
      const wrap = this.canvas.parentElement;
      wrap.classList.remove('flash');
      void wrap.offsetWidth;
      wrap.classList.add('flash');
    }
  }
}
