// La historia al principio del simulador: ocho escenas en alta calidad (generadas con Higgsfield) que
// avanzan con el scroll como un video. Cada escena es un capítulo con su orden:
//   1. entra la imagen con un corte (fundido a negro, relámpago o baba verde),
//   2. la cámara se acerca despacio y entra el texto letra por letra (GSAP),
//   3. el texto se va antes de que la imagen salga con el corte de la siguiente.
// Nunca hay dos imágenes ni dos textos a la vez. Lluvia, niebla y grano se dibujan en el canvas.
// Al final la cámara entra en la pantalla del Comité y la página sigue sola hacia el simulador.

const SCENES = [
  { src: '1_bahia', from: [1.06, 0.5, 0.5], to: [1.22, 0.42, 0.55], rain: 0.5, fog: 1, cut: 'negro' },
  { src: '2_mercado', from: [1.25, 0.62, 0.45], to: [1.08, 0.5, 0.5], rain: 0.3, fog: 0.8, cut: 'rayo' },
  { src: '3_bus', from: [1.05, 0.5, 0.5], to: [1.25, 0.58, 0.5], rain: 1, fog: 0.9, cut: 'baba' },
  { src: '4_comite', from: [1.2, 0.4, 0.5], to: [1.06, 0.55, 0.45], rain: 0, fog: 0.3, cut: 'negro' },
  { src: '5_plan', from: [1.06, 0.6, 0.5], to: [1.22, 0.55, 0.5], rain: 0.4, fog: 0.7, cut: 'rayo' },
  { src: '6_alba', from: [1.2, 0.45, 0.5], to: [1.05, 0.5, 0.5], rain: 0, fog: 0.4, cut: 'negro' },
  { src: '7_amanece', from: [1.05, 0.5, 0.5], to: [1.18, 0.35, 0.6], rain: 0, fog: 0, cut: 'negro' },
  // La laptop del Comité: la cámara entra en su pantalla.
  { src: '8_pantalla', from: [1.02, 0.5, 0.5], to: [4.2, 0.49, 0.5], rain: 0.2, fog: 0.2, cut: 'negro', push: true },
];
const N = SCENES.length;
// Dentro de cada escena (0 a 1): el corte de entrada dura hasta EDGE y el de salida empieza en 1 - EDGE.
const EDGE = 0.1;
// El texto entra después del corte y se va antes del siguiente.
const TEXT_IN = 0.16;
const TEXT_OUT = 0.7;
const $ = (id) => document.getElementById(id);
const esc = (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c;

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

// Arma la línea de tiempo del texto: una unidad por escena, la misma escala que el scroll.
function buildCaptions(caps) {
  const tl = gsap.timeline({ paused: true, defaults: { duration: 0.12 } });
  caps.forEach((cap, k) => {
    const hl = cap.querySelector('.hl');
    const time = cap.querySelector('.time');
    const sub = cap.querySelector('.sub');
    const chars = splitChars(hl);
    const timeChars = splitChars(time);
    const kind = ENTRANCES[cap.dataset.anim] ?? ENTRANCES.sube;
    const start = k + TEXT_IN;
    tl.set(cap, { autoAlpha: 1 }, start);
    tl.fromTo(timeChars, { opacity: 0 }, { opacity: 1, duration: 0.08, stagger: 0.006, ease: 'steps(1)' }, start);
    tl.from(chars, { ...kind.from, duration: 0.16, stagger: kind.stagger, ease: kind.ease }, start + 0.05);
    if (sub) tl.from(sub, { opacity: 0, y: 24, filter: 'blur(6px)', duration: 0.1 }, start + 0.2);
    // La última se queda hasta que la cámara entra en la pantalla.
    if (k === caps.length - 1) return;
    const end = k + TEXT_OUT;
    tl.to(chars, { opacity: 0, yPercent: -60, filter: 'blur(8px)', stagger: { each: 0.004, from: 'random' }, duration: 0.08 }, end);
    tl.to([time, sub].filter(Boolean), { opacity: 0, y: -12, duration: 0.08 }, end);
    tl.set(cap, { autoAlpha: 0 }, end + 0.14);
  });
  tl.to({}, { duration: 0 }, N); // la línea dura exactamente N unidades
  return tl;
}

export function startFilm({ onEnd } = {}) {
  const section = $('historia');
  const canvas = $('filmCanvas');
  const ctx = canvas.getContext('2d');
  const caps = [...section.querySelectorAll('.cap')];
  const bar = $('filmBar');
  const hint = $('scrollHint');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // GSAP llega aparte (cdnjs, en paralelo). Mientras no está, o sin internet, los textos aparecen sin animación de letras.
  let captions = null;
  const tryCaptions = () => {
    if (captions || reduced || typeof gsap === 'undefined') return;
    for (const c of caps) c.style.cssText = '';
    captions = buildCaptions(caps);
  };
  // La primera escena se pide de inmediato; las demás, una tras otra, para que la primera aparezca rápido.
  const imgs = SCENES.map(() => new Image());
  const loadFrom = (k) => {
    if (k >= N) return;
    imgs[k].decoding = 'async';
    imgs[k].onload = imgs[k].onerror = () => loadFrom(k + 1);
    imgs[k].src = `img/historia/${SCENES[k].src}.webp`;
  };
  loadFrom(0);
  // Grano de película: un ruido pequeño que se repite y se mueve cada cuadro.
  const grain = document.createElement('canvas');
  grain.width = grain.height = 160;
  {
    const g = grain.getContext('2d');
    const data = g.createImageData(160, 160);
    for (let k = 0; k < data.data.length; k += 4) {
      const v = Math.random() * 255;
      data.data[k] = data.data[k + 1] = data.data[k + 2] = v;
      data.data[k + 3] = 18;
    }
    g.putImageData(data, 0, 0);
  }
  const drops = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), l: 0.02 + Math.random() * 0.04, v: 0.6 + Math.random() * 0.8 }));
  // Chorreones de la baba: posición, ancho y largo de cada uno.
  const drips = Array.from({ length: 18 }, (_, j) => ({ x: (j + Math.random() * 0.6) / 18, w: 0.02 + Math.random() * 0.03, l: 0.08 + Math.random() * 0.22 }));

  let target = 0;
  let shown = 0;
  let last = performance.now();
  let ended = false;
  const progress = () => {
    const r = section.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
  };
  addEventListener('scroll', () => {
    target = progress();
    hint.style.opacity = target > 0.02 ? 0 : 1;
    // Al terminar la historia, la página baja sola al simulador (como en el reel: sin botón).
    if (target > 0.985 && !ended) {
      ended = true;
      onEnd?.();
    }
    if (target < 0.9) ended = false;
  }, { passive: true });

  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  // Dibuja la escena k con su movimiento de cámara en el punto t (0 a 1).
  function drawScene(k, t) {
    const s = SCENES[k];
    const img = imgs[k];
    if (!img.complete || !img.naturalWidth) return;
    const W = canvas.width;
    const H = canvas.height;
    const e = s.push ? t * t * t : ease(t);
    const z = lerp(s.from[0], s.to[0], e);
    const cx = lerp(s.from[1], s.to[1], e);
    const cy = lerp(s.from[2], s.to[2], e);
    const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight) * z;
    const w = img.naturalWidth * cover;
    const h = img.naturalHeight * cover;
    // El punto (cx, cy) de la imagen queda en el centro, sin mostrar bordes.
    const x = Math.min(0, Math.max(W - w, W / 2 - cx * w));
    const y = Math.min(0, Math.max(H - h, H / 2 - cy * h));
    ctx.drawImage(img, x, y, w, h);
  }

  // El corte que tapa la escena. c va de 0 (nada) a 1 (pantalla tapada); "out" dice si la escena se va o llega.
  function drawCut(kind, c, out, W, H) {
    if (c <= 0) return;
    if (kind === 'rayo') {
      // Un relámpago blanco que se apaga en negro.
      ctx.fillStyle = out ? `rgba(225, 215, 255, ${c})` : `rgba(10, 6, 16, ${c})`;
      ctx.fillRect(0, 0, W, H);
      if (!out && c > 0.6) {
        ctx.fillStyle = `rgba(225, 215, 255, ${(c - 0.6) * 2})`;
        ctx.fillRect(0, 0, W, H);
      }
    } else if (kind === 'baba') {
      // Baba verde que cae desde arriba y, en la escena siguiente, sigue de largo hacia abajo.
      const top = out ? 0 : (1 - c) * H * 1.35;
      const bottom = out ? c * H * 1.35 : H * 1.35;
      ctx.fillStyle = '#1d3b12';
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(W, top);
      ctx.lineTo(W, bottom - H * 0.12);
      for (let j = drips.length - 1; j >= 0; j--) {
        const d = drips[j];
        const tip = bottom - H * 0.12 + d.l * H;
        ctx.lineTo((d.x + d.w) * W, bottom - H * 0.12);
        ctx.quadraticCurveTo((d.x + d.w) * W, tip, (d.x + d.w / 2) * W, tip);
        ctx.quadraticCurveTo(d.x * W, tip, d.x * W, bottom - H * 0.12);
      }
      ctx.lineTo(0, bottom - H * 0.12);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(10, 6, 16, ${c})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    shown += (target - shown) * (reduced ? 1 : 1 - Math.exp(-dt * 8));
    const visible = section.getBoundingClientRect().bottom > 0 && !section.hidden;
    if (visible) {
      const W = Math.round(Math.min(1920, innerWidth * (devicePixelRatio || 1)));
      const H = Math.round((W * innerHeight) / innerWidth);
      if (canvas.width !== W || canvas.height !== H) [canvas.width, canvas.height] = [W, H];
      const seg = shown * N;
      const k = Math.min(N - 1, Math.floor(seg));
      const t = Math.min(1, seg - k);
      ctx.fillStyle = '#0a0610';
      ctx.fillRect(0, 0, W, H);
      drawScene(k, t);
      const s = SCENES[k];
      const sec = now / 1000;
      // Niebla verde que avanza por abajo.
      if (s.fog && !reduced) {
        for (let j = 0; j < 4; j++) {
          const fx = ((sec * 0.02 * (j + 1) + j * 0.31) % 1.4 - 0.2) * W;
          const fy = H * (0.72 + 0.07 * j);
          const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.4);
          g.addColorStop(0, `rgba(120, 220, 140, ${0.09 * s.fog})`);
          g.addColorStop(1, 'rgba(120, 220, 140, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }
      }
      // Lluvia.
      if (s.rain && !reduced) {
        ctx.strokeStyle = `rgba(200, 220, 255, ${0.22 * s.rain})`;
        ctx.lineWidth = Math.max(1, W / 1400);
        ctx.beginPath();
        for (const d of drops) {
          d.y = (d.y + d.v * dt * 1.2) % 1.1;
          const x = (d.x + d.y * 0.08) * W;
          ctx.moveTo(x, d.y * H);
          ctx.lineTo(x + d.l * H * 0.08, (d.y + d.l) * H);
        }
        ctx.stroke();
      }
      // Viñeta y grano.
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(0, 0, 0, 0)');
      v.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      if (!reduced) {
        ctx.save();
        ctx.translate((Math.random() * 160) | 0, (Math.random() * 160) | 0);
        ctx.fillStyle = ctx.createPattern(grain, 'repeat');
        ctx.fillRect(-160, -160, W + 160, H + 160);
        ctx.restore();
      }
      // Cortes: la escena entra destapándose con el corte que cerró la anterior, y sale con el suyo.
      if (k > 0 && t < EDGE) drawCut(SCENES[k - 1].cut, ease(1 - t / EDGE), false, W, H);
      if (k < N - 1 && t > 1 - EDGE) drawCut(s.cut, ease((t - (1 - EDGE)) / EDGE), true, W, H);
      // Al entrar en la pantalla, todo se funde con el fondo del simulador.
      if (k === N - 1 && t > 0.55) drawCut('negro', ease((t - 0.55) / 0.45), true, W, H);
      bar.style.transform = `scaleX(${shown})`;
      tryCaptions();
      if (captions) captions.progress(shown);
      else showPlain(seg);
    }
    requestAnimationFrame(frame);
  }
  // Sin animación de letras: cada texto se ve entre su entrada y su salida.
  function showPlain(seg) {
    caps.forEach((c, k) => {
      const on = seg >= k + TEXT_IN && (k === N - 1 || seg < k + TEXT_OUT + 0.1);
      c.style.opacity = on ? '1' : '0';
      c.style.visibility = on ? 'visible' : 'hidden';
    });
  }
  requestAnimationFrame(frame);
  target = shown = progress();
}
