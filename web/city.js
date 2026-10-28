// "La ciudad en vivo": anima día a día el estado de cada persona en tres paneles
// (no hacer nada / al azar / estrategia del Comité) para la MISMA corrida (mismo brote).

const STRATEGIES = ['nada', 'azar', 'adaptativa'];
// Orden de dibujo: los zombis al final para que queden encima.
const PALETTE = [
  { code: 0, color: '#3f7d58', size: 1.3 }, // sano
  { code: 3, color: '#60a5fa', size: 1.7 }, // exorcizado
  { code: 4, color: '#2dd4bf', size: 1.8 }, // vacunado
  { code: 5, color: '#c084fc', size: 2.0 }, // en cuarentena (sano o mordido)
  { code: 1, color: '#facc15', size: 2.0 }, // mordido
  { code: 2, color: '#ff3b3b', size: 2.8 }, // zombi
];
const fmt = (x) => Math.round(x).toLocaleString('es-EC');

// Convierte el código guardado por el motor en el color a dibujar.
const colorCode = (code) => {
  const state = code & 7;
  if (code & 8 && (state === 0 || state === 1)) return 5;
  return state;
};

export class CityPlayer {
  constructor(root) {
    this.root = root;
    this.panels = STRATEGIES.map((s) => {
      const fig = root.querySelector(`[data-strategy="${s}"]`);
      return { strategy: s, canvas: fig.querySelector('canvas'), stats: fig.querySelector('.city-stats') };
    });
    this.playBtn = root.querySelector('#playBtn');
    this.slider = root.querySelector('#daySlider');
    this.dayLabel = root.querySelector('#dayLabel');
    this.speed = root.querySelector('#speed');
    this.events = root.querySelector('#cityEvents');
    this.note = root.querySelector('#cityNote');
    this.trace = null;
    this.day = 0;
    this.time = 0; // día con fracción (la hora del día), para la vista del barrio
    this.rate = 1; // el barrio va más lento que los mapas: un día dura lo suficiente para ver la rutina
    this.playing = false;
    this.selected = -1; // Modo Vecino: persona elegida (se sigue en los tres mapas)
    this.onSelect = null;
    this.onDay = null;
    for (const p of this.panels) p.canvas.addEventListener('click', (e) => this.pickAt(p, e));

    this.playBtn.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    this.slider.addEventListener('input', () => {
      this.pause();
      this.show(Number(this.slider.value));
    });
    new ResizeObserver(() => this.trace && this.resize()).observe(root);
  }

  load(trace, cfg, totalRuns, terms) {
    this.pause();
    this.trace = trace;
    this.terms = terms;
    this.selected = -1;
    // Mapa satelital real de la ciudad: se carga cuando cambia y, cuando llega, se redibuja el fondo.
    if (this.mapImage?.dataset.src !== trace.layout.image) {
      this.mapImage = new Image();
      this.mapImage.dataset.src = trace.layout.image;
      this.mapImage.onload = () => this.trace && this.resize();
      this.mapImage.src = trace.layout.image;
    }
    // Mapa alto (por ejemplo Guayaquil): los tres paneles en columnas.
    this.root.querySelector('.city-grid').classList.toggle('tall', trace.layout.aspect < 1);
    this.closeDays = cfg.closeDays;
    this.fumigationDays = cfg.fumigationDays;
    this.slider.max = String(trace.days);
    this.slider.disabled = false;
    this.playBtn.disabled = false;
    this.note.textContent = `El mismo brote con tres decisiones distintas. Es la simulación típica: la número ${trace.run + 1} de ${totalRuns}.`;
    this.resize();
    this.show(0);
    this.time = 0.2; // empieza al amanecer del día 0
    this.play();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const t = this.trace;
    for (const p of this.panels) {
      // El mapa entra entero en su recuadro, sin deformarse.
      const fig = p.canvas.parentElement;
      const free = fig.clientHeight - fig.querySelector('figcaption').offsetHeight - p.stats.offsetHeight;
      let cw = fig.clientWidth;
      if (getComputedStyle(fig.closest('.pane')).position === 'absolute' && free > 40) cw = Math.min(cw, free * t.layout.aspect);
      p.canvas.style.width = `${cw}px`;
      p.canvas.style.height = `${cw / t.layout.aspect}px`;
      const w = Math.max(200, Math.round(cw * dpr));
      const h = Math.round(w / t.layout.aspect);
      p.canvas.width = w;
      p.canvas.height = h;
      p.dpr = dpr;
      p.dotScale = Math.min(2.2, Math.max(0.9, w / (300 * dpr))) * dpr; // puntos más grandes en paneles grandes
      p.px = new Float32Array(t.N);
      p.py = new Float32Array(t.N);
      for (let i = 0; i < t.N; i++) {
        p.px[i] = t.layout.x[i] * w;
        p.py[i] = t.layout.y[i] * h;
      }
      p.background = this.drawBackground(w, h, dpr);
    }
    this.show(this.day);
  }

  drawBackground(w, h, dpr) {
    const bg = document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    const ctx = bg.getContext('2d');
    const { shapes } = this.trace.layout;
    const attribution = '© Esri, © OpenStreetMap'; // la atribución completa va debajo de los mapas
    ctx.fillStyle = '#0a0716';
    ctx.fillRect(0, 0, w, h);
    const img = this.mapImage;
    if (img?.complete && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, w, h);
      ctx.fillStyle = 'rgba(8, 5, 20, 0.58)'; // oscurecer para que resalten los puntos
      ctx.fillRect(0, 0, w, h);
    }
    // Límites reales de las 5 parroquias.
    ctx.lineWidth = 1.2 * dpr;
    ctx.strokeStyle = 'rgba(217, 211, 245, 0.45)';
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    for (const rings of shapes) {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
        ctx.closePath();
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const water = this.trace.layout.water;
    if (water) {
      ctx.fillStyle = 'rgba(147, 197, 253, 0.75)';
      ctx.font = `italic ${Math.max(9, w / 55)}px system-ui, sans-serif`;
      ctx.fillText(water.text, w * water.x, h * water.y);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = `${Math.max(7, w / 120)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(attribution, w - 4 * dpr, h - 4 * dpr);
    ctx.textAlign = 'start';
    return bg;
  }

  show(day, keepTime = false) {
    const t = this.trace;
    if (!t) return;
    this.day = Math.max(0, Math.min(t.days, Math.floor(day)));
    if (!keepTime) this.time = this.day + 0.45; // al elegir un día a mano: media mañana, todos en su lugar
    this.slider.value = String(this.day);
    this.dayLabel.textContent = `Día ${this.day}`;
    for (const p of this.panels) this.drawPanel(p);
    this.describeDay();
    this.onDay?.(this.day);
  }

  // Toca un punto: elige a la persona más cercana al clic.
  pickAt(p, e) {
    if (!this.trace) return;
    const rect = p.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * p.canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * p.canvas.height;
    let best = -1;
    let bestD = (14 * p.dpr) ** 2;
    for (let i = 0; i < this.trace.N; i++) {
      const d = (p.px[i] - x) ** 2 + (p.py[i] - y) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
    if (best >= 0) this.select(best);
  }

  select(i) {
    this.selected = i;
    this.show(this.day, true); // elegir a alguien no cambia la hora del día
    this.onSelect?.(i);
  }

  drawPanel(p) {
    const t = this.trace;
    const run = t[p.strategy];
    const ctx = p.canvas.getContext('2d');
    ctx.drawImage(p.background, 0, 0);
    const frame = run.frames.subarray(this.day * t.N, (this.day + 1) * t.N);
    for (const { code, color, size } of PALETTE) {
      ctx.fillStyle = color;
      const s = size * p.dotScale;
      const half = s / 2;
      for (let i = 0; i < t.N; i++) {
        if (colorCode(frame[i]) === code) ctx.fillRect(p.px[i] - half, p.py[i] - half, s, s);
      }
    }
    // Nombres de parroquias y lugares cerrados, encima de los puntos y con contorno para que se lean.
    const { regions } = t.layout;
    const w = p.canvas.width;
    const h = p.canvas.height;
    const label = (text, x, y, size, color) => {
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.lineWidth = 3 * p.dpr;
      ctx.strokeStyle = '#0a0716';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    ctx.textAlign = 'center';
    const nameSize = Math.max(9, Math.min(17, w / 34));
    const lineH = nameSize * 1.15;
    const at = (name) => regions.find((x) => x.name === name);
    // Nombres de zonas sin que se pisen: si uno choca con otro ya escrito, baja una línea.
    const placed = [];
    this.namePos = {};
    for (const r of regions) {
      ctx.font = `700 ${nameSize}px system-ui, sans-serif`;
      const half = ctx.measureText(r.name).width / 2 + 2;
      let y = r.y * h;
      while (placed.some((q) => Math.abs(q.x - r.x * w) < q.half + half && Math.abs(q.y - y) < nameSize)) y += nameSize * 1.1;
      placed.push({ x: r.x * w, y, half });
      this.namePos[r.name] = y;
      label(r.name, r.x * w, y, nameSize, '#f1edff');
    }
    // Avisos apilados debajo del nombre: mercado, colegios, fumigación.
    for (const c of run.closures) {
      // Un cierre decidido el día c.day se ve en los cuadros c.day + 1 … c.day + closeDays.
      if (this.day <= c.day || this.day > c.day + this.closeDays) continue;
      const r = at(c.parroquia);
      const text = c.layer === 'mercado' ? 'Mercado cerrado' : 'Colegios cerrados';
      label(text, r.x * w, this.namePos[r.name] + lineH * (c.layer === 'mercado' ? 1 : 2), nameSize * 0.9, '#ffffff');
    }
    for (const f of run.fumigations ?? []) {
      if (this.day <= f.day || this.day > f.day + this.fumigationDays) continue;
      const r = at(f.parroquia);
      label('Fumigando', r.x * w, this.namePos[r.name] - lineH, nameSize * 0.9, '#2dd4bf');
    }
    ctx.textAlign = 'start';
    if (this.selected >= 0) this.drawSelected(p, run, ctx);
    p.stats.innerHTML =
      `<span>${this.terms?.active ?? 'Casos activos'}: <b class="z">${fmt(run.I[this.day] * t.scale)}</b></span>` +
      `<span>Total ${this.terms?.bittenM ?? 'contagiados'}: <b>${fmt(run.cumulative[this.day] * t.scale)}</b></span>`;
  }

  // Anillo sobre la persona elegida y, si ya la mordieron en esta realidad, línea hacia quien la mordió.
  drawSelected(p, run, ctx) {
    const i = this.selected;
    const s = run.story;
    const r = 9 * p.dpr;
    const by = s?.infectedBy[i] ?? -1;
    if (by >= 0 && s.infectedDay[i] <= this.day) {
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 2 * p.dpr;
      ctx.setLineDash([5 * p.dpr, 4 * p.dpr]);
      ctx.beginPath();
      ctx.moveTo(p.px[by], p.py[by]);
      ctx.lineTo(p.px[i], p.py[i]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(p.px[by], p.py[by], r * 0.7, 0, 2 * Math.PI);
      ctx.stroke();
    }
    const pulse = 1 + 0.25 * Math.sin(performance.now() / 180);
    ctx.lineWidth = 2.5 * p.dpr;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8 * p.dpr;
    ctx.beginPath();
    ctx.arc(p.px[i], p.py[i], r * pulse, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  describeDay() {
    const t = this.trace;
    const a = t.adaptativa;
    const d = this.day;
    const parts = [];
    if (d > 0 && a.quarantinesByDay[d - 1]) parts.push(`${fmt(a.quarantinesByDay[d - 1] * t.scale)} casas en cuarentena`);
    if (d > 0 && a.dosesByDay[d - 1]) parts.push(`${fmt(a.dosesByDay[d - 1] * t.scale)} vacunas aplicadas`);
    for (const c of a.closures) if (c.day === d - 1) parts.push(`cierra ${c.layer === 'mercado' ? 'el mercado' : 'los colegios'} de ${c.parroquia}`);
    for (const f of a.fumigations ?? []) if (f.day === d - 1) parts.push(`brigada de fumigación en ${f.parroquia}`);
    const saved = (t.nada.cumulative[d] - a.cumulative[d]) * t.scale;
    const sentences = [];
    if (d === 0) sentences.push(`Día 0: aparece ${this.terms?.one ?? 'un caso'}. Nadie lo sabe todavía.`);
    else sentences.push(parts.length ? `Día ${d}. El Comité: ${parts.join(', ')}.` : `Día ${d}.`);
    if (saved > 0) sentences.push(`Hasta hoy, ${fmt(saved)} personas ${this.terms?.bitten ?? 'contagiadas'} menos que sin hacer nada.`);
    this.events.textContent = sentences.join(' ');
  }

  play() {
    if (!this.trace) return;
    if (this.day >= this.trace.days) this.show(0);
    this.playing = true;
    this.playBtn.textContent = 'Pausa';
    let last = performance.now();
    let acc = Math.floor(this.time) === this.day ? this.time : this.day;
    const step = (now) => {
      if (!this.playing) return;
      acc += ((now - last) / 1000) * Number(this.speed.value) * this.rate;
      last = now;
      this.time = acc;
      if (Math.floor(acc) !== this.day) this.show(acc, true);
      if (this.day >= this.trace.days) return this.pause();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  pause() {
    this.playing = false;
    this.playBtn.textContent = 'Reproducir';
  }
}
