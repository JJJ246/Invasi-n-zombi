// La historia al principio del simulador: una película que el scroll recorre cuadro a cuadro, como un video.
// Son 7 tomas continuas generadas con Higgsfield y mejoradas a 2K (bahía, mercado, ciudad, Comité, calle,
// neblina, amanecer), 420 cuadros. Encima, un texto por toma que entra letra por letra con GSAP.
// Fluidez, incluso con internet lento:
// - primero baja una versión liviana de toda la película (pelicula/lq, 640 px), así se puede recorrer enseguida;
// - los cuadros nítidos (pelicula/hq, 1920 px) se piden y decodifican solo cerca de donde se está mirando;
// - entre dos cuadros hay un fundido y solo se redibuja si algo cambió; el grano y la viñeta son capas CSS.
// Al final la imagen se funde con el fondo y la página sigue sola hacia el simulador.

const FRAMES = 420;
const SHOTS = 7; // tomas de 60 cuadros
const AHEAD = 10; // cuadros nítidos decodificados por delante y por detrás de lo que se ve
const CHAPTERS = ['La bahía', 'El mercado', 'La ciudad', 'El Comité', 'El plan', 'La neblina se va', 'Amanece'];
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

// Los textos: el scroll decide CUÁNDO aparece cada uno (su ventana en la película), pero la animación corre
// sola, en menos de un segundo. Así el texto siempre termina completo y se puede leer aunque el scroll se detenga.
function makeCaptions(caps) {
  const parts = caps.map((cap) => {
    const time = cap.querySelector('.time');
    const sub = cap.querySelector('.sub');
    return { cap, time, sub, chars: splitChars(cap.querySelector('.hl')), timeChars: splitChars(time), kind: ENTRANCES[cap.dataset.anim] ?? ENTRANCES.sube, on: false, tl: null };
  });
  gsap.set(caps, { autoAlpha: 0 });
  const show = (x) => {
    x.tl?.kill();
    x.tl = gsap.timeline()
      .set(x.cap, { autoAlpha: 1 })
      .fromTo(x.timeChars, { opacity: 0 }, { opacity: 1, duration: 0.25, stagger: 0.025, ease: 'steps(1)' }, 0)
      .fromTo(x.chars, { ...x.kind.from }, { yPercent: 0, opacity: 1, rotateX: 0, rotate: 0, scale: 1, x: 0, filter: 'blur(0px)', duration: 0.7, stagger: x.kind.stagger * 2.5, ease: x.kind.ease }, 0.1)
      .fromTo(x.sub ?? [], { opacity: 0, y: 24, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.5 }, 0.45);
  };
  const hide = (x) => {
    x.tl?.kill();
    x.tl = gsap.timeline()
      .to(x.chars, { opacity: 0, yPercent: -60, filter: 'blur(8px)', stagger: { each: 0.01, from: 'random' }, duration: 0.35 }, 0)
      .to([x.time, x.sub].filter(Boolean), { opacity: 0, y: -12, duration: 0.3 }, 0)
      .set(x.cap, { autoAlpha: 0 })
      .set([x.time, x.sub].filter(Boolean), { opacity: 1, y: 0 });
  };
  return {
    update(shot) {
      parts.forEach((x, k) => {
        const [start, end] = WINDOWS[k] ?? [k + 0.15, k + 0.75];
        const want = shot >= start && (end === null || shot < end);
        if (want === x.on) return;
        x.on = want;
        want ? show(x) : hide(x);
      });
    },
  };
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
  const lq = new Array(FRAMES); // versión liviana, ya decodificada (<img>)
  const hq = new Array(FRAMES); // versión nítida descargada
  const bitmaps = new Map(); // cuadro nítido → ImageBitmap listo para dibujar
  const decoding = new Set();
  const asking = new Set();
  let shown = 0; // cuadro que se ve (se acerca suave al que pide el scroll)
  let target = 0;
  let dirty = true;
  const url = (tier, i) => `pelicula/${tier}/${String(i).padStart(3, '0')}.webp`;
  // Liviana: primero 1 de cada 8 cuadros (ya se puede recorrer), luego 1 de cada 4, luego el resto.
  const order = [];
  const queued = new Uint8Array(FRAMES);
  for (const step of [8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) if (!queued[i]) (queued[i] = 1), order.push(i);
  let next = 0;
  const loadLight = () => {
    if (next >= order.length) return;
    const i = order[next++];
    const img = new Image();
    img.src = url('lq', i);
    img.decode().then(() => { lq[i] = img; dirty = true; }, () => {}).finally(loadLight);
  };
  for (let k = 0; k < 4; k++) loadLight();
  // Nítida: se pide solo alrededor de lo que se ve, y se suelta lo que quedó lejos.
  const askSharp = (i) => {
    if (i < 0 || i >= FRAMES || hq[i] || asking.has(i) || asking.size >= 6) return;
    asking.add(i);
    const img = new Image();
    img.src = url('hq', i);
    img.decode().then(() => { hq[i] = img; decodeAround(); }, () => {}).finally(() => asking.delete(i));
  };
  function decodeAround() {
    const c = Math.round(shown);
    for (const [k, bmp] of bitmaps) {
      if (Math.abs(k - c) > AHEAD * 1.5) { bmp.close?.(); bitmaps.delete(k); }
    }
    for (let d = 0; d <= AHEAD; d++) {
      for (const k of [c + d, c - d]) {
        if (k < 0 || k >= FRAMES) continue;
        if (!hq[k]) { askSharp(k); continue; }
        if (bitmaps.has(k) || decoding.has(k)) continue;
        decoding.add(k);
        createImageBitmap(hq[k])
          .then((bmp) => {
            decoding.delete(k);
            if (Math.abs(k - shown) > AHEAD * 1.5) return bmp.close?.();
            bitmaps.set(k, bmp);
            dirty = true;
          })
          .catch(() => decoding.delete(k));
      }
    }
  }
  // Lo mejor que haya para el cuadro i: nítido, o liviano, o el liviano más cercano.
  const best = (i) => {
    if (bitmaps.has(i)) return bitmaps.get(i);
    if (lq[i]) return lq[i];
    for (let d = 1; d < 16; d++) {
      if (lq[i - d]) return lq[i - d];
      if (lq[i + d]) return lq[i + d];
    }
    return null;
  };

  // ---------- Textos ----------
  // GSAP llega aparte (cdnjs, en paralelo). Mientras no está, o sin internet, los textos aparecen sin animación de letras.
  let captions = null;
  const tryCaptions = () => {
    if (captions || reduced || typeof gsap === 'undefined') return;
    for (const c of caps) c.style.cssText = '';
    captions = makeCaptions(caps);
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

  // El lienzo usa la resolución de la pantalla, hasta 1920 px de ancho.
  const size = () => {
    const w = Math.min(1920, canvas.clientWidth * (devicePixelRatio || 1));
    canvas.width = Math.round(w);
    canvas.height = Math.round((w * canvas.clientHeight) / Math.max(1, canvas.clientWidth));
    dirty = true;
  };
  new ResizeObserver(size).observe(canvas);
  // "cover": la imagen llena la pantalla sin deformarse, venga del cuadro liviano o del nítido.
  const blit = (src, alpha) => {
    const iw = src.naturalWidth || src.width;
    const ih = src.naturalHeight || src.height;
    const s = Math.max(canvas.width / iw, canvas.height / ih);
    ctx.globalAlpha = alpha;
    ctx.drawImage(src, (canvas.width - iw * s) / 2, (canvas.height - ih * s) / 2, iw * s, ih * s);
  };
  const chapterEl = $('filmChapter');
  let chapter = -1;

  let last = performance.now();
  let lastDecode = -1;
  let drawnAt = -1;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const visible = !section.hidden && section.getBoundingClientRect().bottom > 0;
    if (visible) {
      // Suavizado que no depende de los fps de la pantalla (60, 120 o 144 Hz se ven igual).
      shown += (target - shown) * (reduced ? 1 : 1 - Math.exp(-dt * 12));
      if (Math.abs(target - shown) < 0.01) shown = target;
      if (Math.round(shown) !== lastDecode) {
        lastDecode = Math.round(shown);
        decodeAround();
      }
      const p = shown / (FRAMES - 1);
      if (dirty || Math.abs(shown - drawnAt) > 0.004) {
        const a = Math.floor(shown);
        const t = shown - a;
        const base = best(a);
        if (base) {
          ctx.imageSmoothingQuality = 'high';
          blit(base, 1);
          // Fundido con el cuadro siguiente: el paso entre cuadros no se nota.
          const nxt = t > 0.04 ? best(a + 1) : null;
          if (nxt && nxt !== base) blit(nxt, t);
          ctx.globalAlpha = 1;
          // Al final, la imagen se funde con el fondo del simulador.
          if (p > 0.95) {
            ctx.fillStyle = `rgba(10, 6, 16, ${(p - 0.95) / 0.05})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          drawnAt = shown;
          dirty = false;
        }
        bar.style.transform = `scaleX(${p})`;
        // Capítulo actual: número, nombre y puntos.
        const ch = Math.min(SHOTS - 1, Math.floor(p * SHOTS));
        if (ch !== chapter && chapterEl) {
          chapter = ch;
          chapterEl.innerHTML = `<b>${ch + 1}<small>/${SHOTS}</small></b><span>${CHAPTERS[ch]}</span><i>${CHAPTERS.map((_, k) => `<em class="${k <= ch ? 'on' : ''}"></em>`).join('')}</i>`;
        }
        tryCaptions();
        if (captions) captions.update(p * SHOTS);
        else showPlain(p * SHOTS);
      }
    }
    requestAnimationFrame(frame);
  }
  onScroll();
  shown = target;
  requestAnimationFrame(frame);
}
