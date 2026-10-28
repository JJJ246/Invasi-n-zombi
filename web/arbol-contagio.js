// "¿Cómo se propagó?": el árbol del contagio desde el paciente cero. Cada nodo es una persona de la
// simulación (quién, qué día y dónde se contagió) y crece día a día con la reproducción. Se muestran
// las ramas que más gente alcanzaron; las demás se resumen en "y N más".
import { persona } from './ficha-vecino.js';
import { CITIES } from './engine/cities.js';

const PLACE = ['en casa', 'en el colegio', 'en el trabajo', 'en el bus', 'en el mercado', 'en el barrio'];
const EDGE = ['#c8a6dc', '#f2c94c', '#8fbcd4', '#ff9f43', '#ff6b6b', '#9be15d'];
const STATE_COLOR = ['#5fd38d', '#facc15', '#ff3b3b', '#60a5fa', '#2dd4bf'];
const KEEP = [3, 4, 2, 2]; // ramas visibles por generación: pacientes cero, 1.ª, 2.ª y 3.ª generación
const KEEP_NARROW = [1, 3, 2, 1]; // en la lista angosta: el paciente cero y sus ramas principales
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
    // Cuadro ancho: generaciones en columnas. Cuadro angosto: lista con sangría, como un árbol de carpetas.
    const W = Math.max(260, this.svg.clientWidth || 400);
    const Hbox = Math.max(200, this.svg.clientHeight || 400);
    const narrow = W < 560;
    const keep = narrow ? KEEP_NARROW : KEEP;
    const last = keep.length - 1;
    const build = (i, gen) => {
      const all = (kids.get(i) ?? []).filter(visible).sort((a, b) => size.get(b) - size.get(a));
      if (gen >= last) return { i, gen, children: [], more: all.length };
      const shown = all.slice(0, keep[gen + 1]);
      return { i, gen, children: shown.map((c) => build(c, gen + 1)), more: all.length - shown.length };
    };
    const forest = roots.filter(visible).slice(0, keep[0]).map((r) => build(r, 0));
    const nodes = [];
    const edges = [];
    let row = 0;
    let rows = 0;
    let rowH;
    let path;
    const colW = (W - 130) / last; // en columnas, la última deja sitio para el texto
    if (narrow) {
      const count = (n) => { rows++; n.children.forEach(count); };
      forest.forEach(count);
      rowH = Math.max(30, Math.min(46, Hbox / Math.max(1, rows)));
      const place = (n) => {
        n.y = row++ * rowH + rowH / 2;
        n.x = 20 + n.gen * 28;
        nodes.push(n);
        for (const c of n.children) {
          edges.push([n, c]);
          place(c);
        }
      };
      forest.forEach(place);
      path = (a, b) => `M${a.x},${a.y + 14} V${b.y - 6} Q${a.x},${b.y} ${a.x + 6},${b.y} H${b.x - 14}`;
    } else {
      const count = (n) => {
        if (n.children.length) n.children.forEach(count);
        else rows++;
        if (n.more > 0 && n.gen < last) rows++;
      };
      forest.forEach(count);
      rows += 0.4 * Math.max(0, forest.length - 1);
      rowH = Math.max(34, Math.min(52, Hbox / Math.max(1, rows)));
      // Cada hoja una fila; cada padre a la altura media de sus hijos.
      const place = (n) => {
        if (n.children.length) {
          for (const c of n.children) place(c);
          n.y = (n.children[0].y + n.children[n.children.length - 1].y) / 2;
        } else n.y = row++ * rowH + rowH / 2;
        if (n.more > 0 && n.gen < last) n.moreY = row++ * rowH + rowH / 2;
        n.x = 22 + n.gen * colW;
        nodes.push(n);
        for (const c of n.children) edges.push([n, c]);
      };
      for (const t of forest) {
        place(t);
        row += 0.4;
      }
      row -= 0.4;
      path = (a, b) => `M${a.x + 16},${a.y} C${a.x + colW * 0.5},${a.y} ${b.x - colW * 0.45},${b.y} ${b.x - 16},${b.y}`;
    }
    // Todo entra en el cuadro: si hay muchas filas, el dibujo se achica; si hay pocas, se centra.
    const H = Math.max(Hbox, row * rowH);
    this.svg.setAttribute('viewBox', `0 ${-(H - row * rowH) / 2} ${W} ${H}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const code = (i) => this.trace[this.strategy].frames[day * this.trace.N + i] & 7;
    const zero = this.zombie ? 'Paciente cero' : 'Primer caso';
    const seen = this.seenEdges ?? new Set();
    const drawnEdges = new Set();
    let out = '';
    for (const [a, b] of edges) {
      const key = `${this.strategy}:${b.i}`;
      drawnEdges.add(key);
      out += `<path d="${path(a, b)}" stroke="${EDGE[story.infectedLayer[b.i]] ?? '#888'}" class="edge${seen.has(key) ? '' : ' new'}" />`;
    }
    this.seenEdges = drawnEdges;
    const r = narrow ? 13 : 16;
    for (const n of nodes) {
      const who = persona(this.trace, n.i);
      const d = story.infectedDay[n.i];
      const where = n.gen === 0 ? `vive en ${this.zones[this.trace.people.parroquia[n.i]]}` : `día ${d}, ${PLACE[story.infectedLayer[n.i]] ?? ''}`;
      const c = STATE_COLOR[code(n.i)] ?? '#888';
      // "y N más": junto al texto en la lista y en la última columna; si no, como una rama aparte.
      const inline = n.more > 0 && (narrow || n.gen === last);
      out += `<g class="node${d === day && d > 0 ? ' fresh' : ''}" data-person="${n.i}" transform="translate(${n.x},${n.y})">
        <circle r="${r}" fill="${who.color}" stroke="${c}" stroke-width="3"/>
        <text class="ini" y="4" text-anchor="middle">${esc(who.initials)}</text>
        <text class="name" x="${r + 7}" y="-2">${esc(who.first)}${n.gen === 0 ? `, ${esc(zero.toLowerCase())}` : ''}</text>
        <text class="when" x="${r + 7}" y="13">${esc(where)}${inline ? ` <tspan class="plus">y ${n.more} más</tspan>` : ''}</text>
      </g>`;
      if (n.more > 0 && !inline) out += `<path d="${path(n, { x: n.x + colW, y: n.moreY })}" stroke="#4a4160" class="edge dim" /><text class="more" x="${n.x + colW - 10}" y="${n.moreY + 4}">y ${n.more} más</text>`;
    }
    if (!nodes.length) out = `<text class="more" x="20" y="28">Todavía nadie se contagió.</text>`;
    this.svg.innerHTML = out;
    // Encabezado: quién empezó y hasta dónde llegó.
    const total = roots.reduce((a, r) => a + reach(r), 0);
    const first = roots[0];
    const who = first !== undefined ? persona(this.trace, first) : null;
    const direct = first !== undefined ? (kids.get(first) ?? []).filter(visible).length : 0;
    this.headEl.innerHTML = who
      ? `<span><b>${esc(who.name)}</b>, ${who.age} años: ${zero.toLowerCase()}.</span><span>${this.zombie ? (who.female ? 'Ella mordió' : 'Él mordió') : (who.female ? 'Ella contagió' : 'Él contagió')} a <b>${direct}</b> y la cadena llega a <b>${fmt(total)}</b> vecinos el día ${day} (unos ${fmt(total * this.trace.scale)} habitantes).</span>`
      : '';
    this.tabs.querySelectorAll('[data-tree]').forEach((b) => {
      const t = this.trees[b.dataset.tree];
      const n = t.roots.reduce((a, r) => a + (() => { let m = 0; const st = [r]; while (st.length) { const x = st.pop(); if (!(t.story.infectedDay[x] >= 0 && t.story.infectedDay[x] <= day)) continue; m++; for (const c of t.kids.get(x) ?? []) st.push(c); } return m; })(), 0);
      b.querySelector('em').textContent = fmt(n);
    });
  }
}
