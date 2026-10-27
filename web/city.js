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
    this.playing = false;
    this.selected = -1; // Modo Vecino: persona elegida (se sigue en los tres mapas)
    this.onSelect = null;
    this.onDay = null;
    for (const p of this.panels) p.canvas.addEventListener('click', (e) => this.pickAt(p, e));

    this.playBtn.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    // Pantalla completa: para proyectar la ciudad en el pitch.
    root.querySelector('#fullBtn').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else root.requestFullscreen?.();
    });
    this.slider.addEventListener('input', () => {
      this.pause();
      this.show(Number(this.slider.value));
    });
    new ResizeObserver(() => this.trace && this.resize()).observe(root);
  }

  load(trace, cfg, totalRuns) {
    this.pause();
    this.trace = trace;
    this.selected = -1;
    // Mapa satelital real de Manta: se carga una vez y, cuando llega, se redibuja el fondo.
    if (!this.mapImage) {
      this.mapImage = new Image();
      this.mapImage.onload = () => this.trace && this.resize();
      this.mapImage.src = trace.layout.image;
    }
    this.closeDays = cfg.closeDays;
    this.fumigationDays = cfg.fumigationDays;
    this.slider.max = String(trace.days);
    this.slider.disabled = false;
    this.playBtn.disabled = false;
    this.note.textContent = `el mismo brote, tres decisiones distintas · corrida típica: la mediana de los brotes que despegan (n.º ${trace.run + 1} de ${totalRuns})`;
    this.resize();
    this.show(0);
    this.play();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const t = this.trace;
    for (const p of this.panels) {
      p.canvas.style.aspectRatio = String(t.layout.aspect);
      const w = Math.max(200, Math.round(p.canvas.clientWidth * dpr));
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
    const attribution = '© Esri · © OpenStreetMap'; // la atribución completa va debajo de los mapas
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
    ctx.fillStyle = 'rgba(147, 197, 253, 0.75)';
    ctx.font = `italic ${Math.max(9, w / 55)}px system-ui, sans-serif`;
    ctx.fillText('Océano Pacífico', w * 0.03, h * 0.09);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = `${Math.max(7, w / 120)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(attribution, w - 4 * dpr, h - 4 * dpr);
    ctx.textAlign = 'start';
    return bg;
  }

  show(day) {
    const t = this.trace;
    if (!t) return;
    this.day = Math.max(0, Math.min(t.days, Math.floor(day)));
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
    this.show(this.day);
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
    for (const r of regions) label(r.name, r.x * w, r.y * h, nameSize, '#f1edff');
    // Avisos apilados debajo del nombre: mercado, colegios, fumigación.
    for (const c of run.closures) {
      // Un cierre decidido el día c.day se ve en los cuadros c.day + 1 … c.day + closeDays.
      if (this.day <= c.day || this.day > c.day + this.closeDays) continue;
      const r = at(c.parroquia);
      const text = c.layer === 'mercado' ? '🔒 Mercado' : '🔒 Colegios';
      label(text, r.x * w, r.y * h + lineH * (c.layer === 'mercado' ? 1 : 2), nameSize * 0.9, '#ffffff');
    }
    for (const f of run.fumigations ?? []) {
      if (this.day <= f.day || this.day > f.day + this.fumigationDays) continue;
      const r = at(f.parroquia);
      label('🦟 Fumigando', r.x * w, r.y * h - lineH, nameSize * 0.9, '#2dd4bf');
    }
    ctx.textAlign = 'start';
    if (this.selected >= 0) this.drawSelected(p, run, ctx);
    p.stats.innerHTML =
      `<span>Zombis ahora: <b class="z">${fmt(run.I[this.day] * t.scale)}</b></span>` +
      `<span>Mordidos en total: <b>${fmt(run.cumulative[this.day] * t.scale)}</b></span>`;
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
    if (d > 0 && a.quarantinesByDay[d - 1]) parts.push(`${fmt(a.quarantinesByDay[d - 1] * t.scale)} hogares a cuarentena`);
    if (d > 0 && a.dosesByDay[d - 1]) parts.push(`${fmt(a.dosesByDay[d - 1] * t.scale)} vacunas aplicadas`);
    for (const c of a.closures) if (c.day === d - 1) parts.push(`🔒 cierra ${c.layer === 'mercado' ? 'el mercado' : 'los colegios'} de ${c.parroquia}`);
    for (const f of a.fumigations ?? []) if (f.day === d - 1) parts.push(`🦟 brigada de fumigación en ${f.parroquia}`);
    const saved = (t.nada.cumulative[d] - a.cumulative[d]) * t.scale;
    const sentences = [];
    if (d === 0) sentences.push('Día 0 — aparece un solo zombi. Nadie lo sabe todavía.');
    else sentences.push(parts.length ? `Día ${d} — el Comité: ${parts.join(' · ')}.` : `Día ${d}.`);
    if (saved > 0) sentences.push(`Hasta hoy, ${fmt(saved)} personas menos mordidas que sin hacer nada.`);
    this.events.textContent = sentences.join(' ');
  }

  play() {
    if (!this.trace) return;
    if (this.day >= this.trace.days) this.show(0);
    this.playing = true;
    this.playBtn.textContent = '⏸ Pausa';
    let last = performance.now();
    let acc = this.day;
    const step = (now) => {
      if (!this.playing) return;
      acc += ((now - last) / 1000) * Number(this.speed.value);
      last = now;
      if (Math.floor(acc) !== this.day) this.show(acc);
      if (this.day >= this.trace.days) return this.pause();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  pause() {
    this.playing = false;
    this.playBtn.textContent = '▶ Reproducir';
  }
}
