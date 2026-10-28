// La historia al principio del simulador: una película que el scroll recorre cuadro a cuadro, como un video.
// Son 7 tomas continuas generadas con Higgsfield (bahía, mercado, ciudad, Comité, calle, neblina, amanecer),
// 420 cuadros en total. Encima, un texto por toma que entra letra por letra con GSAP.
// Fluidez: cada cuadro se decodifica antes de necesitarlo (ImageBitmap) y entre dos cuadros hay un fundido,
// así el movimiento es continuo aunque el scroll avance de a poco.
// Al final la imagen se funde con el fondo y la página sigue sola hacia el simulador.

const FRAMES = 420;
const SHOTS = 7; // tomas de 60 cuadros
const AHEAD = 24; // cuadros decodificados por delante y por detrás de lo que se ve
const $ = (id) => document.getElementById(id);
const esc = (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c;

// Cuándo entra y sale cada texto, en tomas (0 a 7). El amanecer tiene dos: "Manta sigue en pie" y el cierre.
const WINDOWS = [[0.15, 0.75], [1.15, 1.75], [2.15, 2.75], [3.15, 3.75], [4.15, 4.75], [5.15, 5.75], [6.05, 6.42], [6.5, null]];

// Parte el título en letras (agrupadas por palabra para que no se corten al saltar de línea).
function splitChars(el) {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.innerHTML = text.split(' ').map((w) => `<span class="w" aria-hidden="true">${[...w].map((c) => `<span class="ch">${esc(c)}</span>`).join('')}</span>`).join(' ');
  return el.querySelectorAll('.ch');
}

// Cómo entra cada título. Todas parten de un estado y llegan a letras quietas y visibles.
const ENTRANCES = {
  sube: { from: { yPercent: 110, opacity: 0, rotateX: -80 }, stagger: 0.012, ease: 'back.out(1.6)' },
  cae: { from: { yPercent: -160, opacity: 0, rotate: () => (Math.random() - 0.5) * 50 }, stagger: 0.014, ease: 'bounce.out' },
  tiembla: { from: { scale: 2.6, opacity: 0, filter: 'blur(10px)' }, stagger: { each: 0.01, from: 'center' }, ease: 'power3.out' },
  escribe: { from: { opacity: 0, x: -6 }, stagger: 0.02, ease: 'steps(1)' },
};

// La línea de tiempo de los textos dura lo mismo que la película (7 tomas) y avanza con el scroll.
function buildCaptions(caps) {
  const tl = gsap.timeline({ paused: true, defaults: { duration: 0.12 } });
  caps.forEach((cap, k) => {
    const [start, end] = WINDOWS[k] ?? [k + 0.15, k + 0.75];
    const hl = cap.querySelector('.hl');
    const time = cap.querySelector('.time');
    const sub = cap.querySelector('.sub');
    const chars = splitChars(hl);
    const timeChars = splitChars(time);
    const kind = ENTRANCES[cap.dataset.anim] ?? ENTRANCES.sube;
    tl.set(cap, { autoAlpha: 1 }, start);
    tl.fromTo(timeChars, { opacity: 0 }, { opacity: 1, duration: 0.08, stagger: 0.006, ease: 'steps(1)' }, start);
    tl.from(chars, { ...kind.from, duration: 0.16, stagger: kind.stagger, ease: kind.ease }, start + 0.05);
    if (sub) tl.from(sub, { opacity: 0, y: 24, filter: 'blur(6px)', duration: 0.1 }, start + 0.2);
    if (end === null) return; // el último se queda hasta el final
    tl.to(chars, { opacity: 0, yPercent: -60, filter: 'blur(8px)', stagger: { each: 0.004, from: 'random' }, duration: 0.08 }, end);
    tl.to([time, sub].filter(Boolean), { opacity: 0, y: -12, duration: 0.08 }, end);
    tl.set(cap, { autoAlpha: 0 }, end + 0.14);
  });
  tl.to({}, { duration: 0 }, SHOTS);
  return tl;
}

export function startFilm({ onEnd } = {}) {
  const section = $('historia');
  const canvas = $('filmCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const caps = [...section.querySelectorAll('.cap')];
  const bar = $('filmBar');
  const hint = $('scrollHint');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Cuadros ----------
  const frames = new Array(FRAMES); // imágenes descargadas (comprimidas)
  const bitmaps = new Map(); // cuadro → ImageBitmap listo para dibujar
  const decoding = new Set();
  let shown = 0; // cuadro que se ve (se acerca suave al que pide el scroll)
  let target = 0;
  // Orden de carga: primero 1 de cada 8 cuadros (la película ya se puede recorrer), luego 1 de cada 4, luego el resto.
  const order = [];
  const queued = new Uint8Array(FRAMES);
  for (const step of [8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) if (!queued[i]) (queued[i] = 1), order.push(i);
  let next = 0;
  const loadMore = () => {
    if (next >= order.length) return;
    const i = order[next++];
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      frames[i] = img;
      if (Math.abs(i - shown) <= AHEAD) decodeAround();
      loadMore();
    };
    img.onerror = loadMore;
    img.src = `pelicula/${String(i).padStart(3, '0')}.webp`;
  };
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
          })
          .catch(() => decoding.delete(k));
      }
    }
  }
  // El cuadro decodificado más cercano a i (hacia atrás primero, para no adelantarse a la historia).
  const nearest = (i) => {
    for (let d = 0; d < FRAMES; d++) {
      if (bitmaps.has(i - d)) return i - d;
      if (bitmaps.has(i + d)) return i + d;
    }
    return -1;
  };

  // Grano de película: un ruido pequeño que se repite y se mueve cada cuadro.
  const grain = document.createElement('canvas');
  grain.width = grain.height = 160;
  {
    const g = grain.getContext('2d');
    const data = g.createImageData(160, 160);
    for (let k = 0; k < data.data.length; k += 4) {
      const v = Math.random() * 255;
      data.data[k] = data.data[k + 1] = data.data[k + 2] = v;
      data.data[k + 3] = 14;
    }
    g.putImageData(data, 0, 0);
  }

  // ---------- Textos ----------
  // GSAP llega aparte (cdnjs, en paralelo). Mientras no está, o sin internet, los textos aparecen sin animación de letras.
  let captions = null;
  const tryCaptions = () => {
    if (captions || reduced || typeof gsap === 'undefined') return;
    for (const c of caps) c.style.cssText = '';
    captions = buildCaptions(caps);
  };
  const showPlain = (shot) => caps.forEach((c, k) => {
    const [start, end] = WINDOWS[k] ?? [k + 0.15, k + 0.75];
    const on = shot >= start && (end === null || shot < end + 0.1);
    c.style.opacity = on ? '1' : '0';
    c.style.visibility = on ? 'visible' : 'hidden';
  });

  // ---------- Scroll ----------
  let ended = false;
  const progress = () => {
    const r = section.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
  };
  const onScroll = () => {
    const p = progress();
    target = p * (FRAMES - 1);
    hint.style.opacity = p > 0.02 ? 0 : 1;
    // Al terminar la historia, la página baja sola al simulador (como en el reel: sin botón).
    if (p > 0.985 && !ended) {
      ended = true;
      onEnd?.();
    }
    if (p < 0.9) ended = false;
  };
  addEventListener('scroll', onScroll, { passive: true });

  // El lienzo usa como máximo la resolución de la película: menos píxeles que pintar.
  let cover = null;
  const size = () => {
    const w = Math.min(1600, canvas.clientWidth * (devicePixelRatio || 1));
    canvas.width = Math.round(w);
    canvas.height = Math.round((w * canvas.clientHeight) / Math.max(1, canvas.clientWidth));
    cover = null;
  };
  new ResizeObserver(size).observe(canvas);
  const blit = (bmp, alpha) => {
    if (!cover) {
      const s = Math.max(canvas.width / bmp.width, canvas.height / bmp.height);
      const w = bmp.width * s;
      const h = bmp.height * s;
      cover = [(canvas.width - w) / 2, (canvas.height - h) / 2, w, h];
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(bmp, ...cover);
  };

  let last = performance.now();
  let lastDecode = -1;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const visible = section.getBoundingClientRect().bottom > 0 && !section.hidden;
    if (visible) {
      // Suavizado que no depende de los fps de la pantalla (60, 120 o 144 Hz se ven igual).
      shown += (target - shown) * (reduced ? 1 : 1 - Math.exp(-dt * 9));
      if (Math.abs(target - shown) < 0.002) shown = target;
      if (Math.round(shown) !== lastDecode) {
        lastDecode = Math.round(shown);
        decodeAround();
      }
      const a = Math.floor(shown);
      const t = shown - a;
      const ka = bitmaps.has(a) ? a : nearest(a);
      const p = shown / (FRAMES - 1);
      if (ka >= 0) {
        const W = canvas.width;
        const H = canvas.height;
        ctx.imageSmoothingQuality = 'high';
        blit(bitmaps.get(ka), 1);
        // Fundido con el cuadro siguiente: el paso entre cuadros no se nota.
        if (ka === a && t > 0.02 && bitmaps.has(a + 1)) blit(bitmaps.get(a + 1), t);
        ctx.globalAlpha = 1;
        const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
        v.addColorStop(0, 'rgba(0, 0, 0, 0)');
        v.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, W, H);
        if (!reduced) {
          ctx.save();
          ctx.translate((Math.random() * 160) | 0, (Math.random() * 160) | 0);
          ctx.fillStyle = ctx.createPattern(grain, 'repeat');
          ctx.fillRect(-160, -160, W + 160, H + 160);
          ctx.restore();
        }
        // Al final, la imagen se funde con el fondo del simulador.
        if (p > 0.95) {
          ctx.fillStyle = `rgba(10, 6, 16, ${(p - 0.95) / 0.05})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
      bar.style.transform = `scaleX(${p})`;
      tryCaptions();
      if (captions) captions.progress(p);
      else showPlain(p * SHOTS);
    }
    requestAnimationFrame(frame);
  }
  onScroll();
  shown = target;
  requestAnimationFrame(frame);
}
