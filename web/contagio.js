// "¿Cómo se propagó?": el árbol del contagio desde el paciente cero. Cada nodo es una persona de la
// simulación (quién, qué día y dónde se contagió) y crece día a día con la reproducción. Se muestran
// las ramas que más gente alcanzaron; las demás se resumen en "+N más".
import { persona } from './vecino.js';
import { CITIES } from './engine/cities.js';

const PLACE = ['en casa', 'en el colegio', 'en el trabajo', 'en el bus', 'en el mercado', 'en el barrio'];
const EDGE = ['#c8a6dc', '#f2c94c', '#8fbcd4', '#ff9f43', '#ff6b6b', '#9be15d'];
const STATE_COLOR = ['#5fd38d', '#facc15', '#ff3b3b', '#60a5fa', '#2dd4bf'];
const KEEP = [3, 4, 2, 2]; // ramas visibles por generación: pacientes cero, 1.ª, 2.ª y 3.ª generación
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (x) => Math.round(x).toLocaleString('es-EC');

export class ContagionMap {
  constructor(root, player) {
    this.root = root;
    this.player = player;
    this.svg = root.querySelector('.tree-svg');
    this.headEl = root.querySelector('.tree-head');
    this.tabs = root.querySelector('.tree-tabs');
    this.strategy = 'nada';
    this.day = -1;
    this.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tree]');
      if (!b) return;
      this.strategy = b.dataset.tree;
      this.tabs.querySelectorAll('[data-tree]').forEach((x) => x.classList.toggle('on', x === b));
      this.render(true);
    });
    this.svg.addEventListener('click', (e) => {
      const n = e.target.closest('[data-person]');
      if (n) this.player.select(Number(n.dataset.person));
    });
    new ResizeObserver(() => this.trace && this.render(true)).observe(root);
  }

  load(trace, theme) {
    this.trace = trace;
    this.zombie = theme === 'zombi';
    this.zones = CITIES[trace.city].zones;
    // Hijos de cada persona y tamaño de su "descendencia", para cada realidad.
    this.trees = {};
    for (const k of ['nada', 'adaptativa']) {
      const s = trace[k].story;
      const kids = new Map();
      const roots = [];
      for (let i = 0; i < trace.N; i++) {
        if (s.infectedDay[i] === 0) roots.push(i);
        else if (s.infectedDay[i] > 0 && s.infectedBy[i] >= 0) {
          if (!kids.has(s.infectedBy[i])) kids.set(s.infectedBy[i], []);
          kids.get(s.infectedBy[i]).push(i);
        }
      }
      // Tamaño de cada rama (recorrido de hijos a padres, sin recursión).
      const size = new Map();
      const order = [...roots];
      for (let q = 0; q < order.length; q++) for (const c of kids.get(order[q]) ?? []) order.push(c);
      for (let q = order.length - 1; q >= 0; q--) {
        const i = order[q];
        size.set(i, 1 + (kids.get(i) ?? []).reduce((a, c) => a + size.get(c), 0));
      }
      roots.sort((a, b) => size.get(b) - size.get(a));
      this.trees[k] = { kids, roots, size, story: s };
    }
    this.day = -1;
    this.render(true);
  }

  setDay(day) {
    if (!this.trace || day === this.day) return;
    this.day = day;
    this.render();
  }

  render(force = false) {
    if (!this.trace) return;
    const day = Math.max(0, this.day);
    const { kids, roots, size, story } = this.trees[this.strategy];
    const visible = (i) => story.infectedDay[i] >= 0 && story.infectedDay[i] <= day;
    // Cuántas personas alcanzó cada rama hasta hoy.
    const reach = (i) => {
      let n = 0;
      const st = [i];
      while (st.length) {
        const x = st.pop();
        if (!visible(x)) continue;
        n++;
        for (const c of kids.get(x) ?? []) st.push(c);
      }
      return n;
    };
    // Árbol podado: las ramas más grandes de cada generación.
    const build = (i, gen) => {
      const all = (kids.get(i) ?? []).filter(visible).sort((a, b) => size.get(b) - size.get(a));
      if (gen >= KEEP.length - 1) return { i, gen, children: [], more: all.length };
      const shown = all.slice(0, KEEP[gen + 1]);
      return { i, gen, children: shown.map((c) => build(c, gen + 1)), more: all.length - shown.length };
    };
    const forest = roots.slice(0, KEEP[0]).map((r) => build(r, 0));
    // Posiciones: cada hoja una fila; cada padre a la altura media de sus hijos.
    const W = Math.max(520, this.svg.clientWidth || 900);
    const colW = (W - 150) / 3; // la última columna deja sitio para el texto
    const rowH = 46;
    let row = 0;
    const nodes = [];
    const edges = [];
    const place = (n) => {
      if (n.children.length) {
        for (const c of n.children) place(c);
        n.y = (n.children[0].y + n.children[n.children.length - 1].y) / 2;
      } else n.y = row++ * rowH + rowH / 2;
      if (n.more > 0 && n.gen < KEEP.length - 1) n.moreY = row++ * rowH + rowH / 2;
      n.x = 24 + n.gen * colW;
      nodes.push(n);
      for (const c of n.children) edges.push([n, c]);
    };
    for (const t of forest) {
      place(t);
      row += 0.4;
    }
    const H = Math.max(rowH, row * rowH);
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.style.height = `${H}px`;
    const code = (i) => this.trace[this.strategy].frames[day * this.trace.N + i] & 7;
    const path = (a, b) => `M${a.x + 16},${a.y} C${a.x + colW * 0.5},${a.y} ${b.x - colW * 0.45},${b.y} ${b.x - 16},${b.y}`;
    const zero = this.zombie ? 'Paciente cero' : 'Primer caso';
    let out = '';
    for (const [a, b] of edges) out += `<path d="${path(a, b)}" stroke="${EDGE[story.infectedLayer[b.i]] ?? '#888'}" class="edge" />`;
    for (const n of nodes) {
      const who = persona(this.trace, n.i);
      const d = story.infectedDay[n.i];
      const where = d === 0 ? zero : `día ${d}, ${PLACE[story.infectedLayer[n.i]] ?? ''}`;
      const c = STATE_COLOR[code(n.i)] ?? '#888';
      out += `<g class="node${d === day && d > 0 ? ' fresh' : ''}" data-person="${n.i}" transform="translate(${n.x},${n.y})">
        <circle r="16" fill="${who.color}" stroke="${c}" stroke-width="3"/>
        <text class="ini" y="4" text-anchor="middle">${esc(who.initials)}</text>
        <text class="name" x="24" y="-2">${esc(who.first)}${n.gen === 0 ? ` · ${esc(zero)}` : ''}</text>
        <text class="when" x="24" y="13">${esc(n.gen === 0 ? `${PLACE[4]} de ${this.zones[this.trace.people.parroquia[n.i]]}` : where)}${n.more > 0 && n.gen === KEEP.length - 1 ? ` · <tspan class="plus">+${n.more}</tspan>` : ''}</text>
      </g>`;
      // En la última columna, "+N" va junto al nombre; en las demás, como una rama más.
      if (n.more > 0) out += `<path d="${path(n, { x: n.x + colW, y: n.moreY })}" stroke="#4a4160" class="edge dim" /><text class="more" x="${n.x + colW - 10}" y="${n.moreY + 4}">+${n.more} más</text>`;
    }
    if (!nodes.length) out = `<text class="more" x="20" y="28">Todavía nadie se contagió.</text>`;
    this.svg.innerHTML = out;
    // Encabezado: quién empezó y hasta dónde llegó.
    const total = roots.reduce((a, r) => a + reach(r), 0);
    const first = roots[0];
    const who = first !== undefined ? persona(this.trace, first) : null;
    const direct = first !== undefined ? (kids.get(first) ?? []).filter(visible).length : 0;
    this.headEl.innerHTML = who
      ? `<span><b>${esc(who.name)}</b>, ${who.age} años · ${zero.toLowerCase()}</span><span><b>${direct}</b> ${this.zombie ? 'mordidos' : 'contagiados'} por ${who.female ? 'ella' : 'él'}</span><span><b>${fmt(total)}</b> en toda la cadena hasta el día ${day} <small>(≈ ${fmt(total * this.trace.scale)} habitantes)</small></span>`
      : '';
    this.tabs.querySelectorAll('[data-tree]').forEach((b) => {
      const t = this.trees[b.dataset.tree];
      const n = t.roots.reduce((a, r) => a + (() => { let m = 0; const st = [r]; while (st.length) { const x = st.pop(); if (!(t.story.infectedDay[x] >= 0 && t.story.infectedDay[x] <= day)) continue; m++; for (const c of t.kids.get(x) ?? []) st.push(c); } return m; })(), 0);
      b.querySelector('em').textContent = fmt(n);
    });
  }
}
