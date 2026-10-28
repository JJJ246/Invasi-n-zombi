// La historia al principio del simulador: ocho imágenes en alta calidad (generadas con Higgsfield) que
// avanzan con el scroll. El movimiento es nuestro: acercamiento lento de cámara, fundidos entre escenas,
// lluvia, niebla, relámpagos y grano de película, dibujados en un canvas a 60 cuadros por segundo.
// Al final la cámara entra en la pantalla del Comité y la página sigue sola hacia el simulador.

const SCENES = [
  { src: '1_bahia', from: [1.06, 0.5, 0.5], to: [1.22, 0.42, 0.55], rain: 0.5, fog: 1 },
  { src: '2_mercado', from: [1.25, 0.62, 0.45], to: [1.08, 0.5, 0.5], rain: 0.3, fog: 0.8, lightning: true },
  { src: '3_bus', from: [1.05, 0.5, 0.5], to: [1.25, 0.58, 0.5], rain: 1, fog: 0.9, lightning: true },
  { src: '4_comite', from: [1.2, 0.4, 0.5], to: [1.06, 0.55, 0.45], rain: 0, fog: 0.3 },
  { src: '5_plan', from: [1.06, 0.6, 0.5], to: [1.22, 0.55, 0.5], rain: 0.4, fog: 0.7 },
  { src: '6_alba', from: [1.2, 0.45, 0.5], to: [1.05, 0.5, 0.5], rain: 0, fog: 0.4 },
  { src: '7_amanece', from: [1.05, 0.5, 0.5], to: [1.18, 0.35, 0.6], rain: 0, fog: 0 },
  // La laptop del Comité: la cámara entra en su pantalla.
  { src: '8_pantalla', from: [1.02, 0.5, 0.5], to: [4.2, 0.49, 0.5], rain: 0.2, fog: 0.2, push: true },
];
const N = SCENES.length;
const $ = (id) => document.getElementById(id);

export function startFilm({ onEnd } = {}) {
  const section = $('historia');
  const canvas = $('filmCanvas');
  const ctx = canvas.getContext('2d');
  const caps = [...section.querySelectorAll('.cap')];
  const bar = $('filmBar');
  const hint = $('scrollHint');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  // Dibuja la escena k con su movimiento de cámara en el punto t (0 a 1) y una opacidad.
  function drawScene(k, t, alpha) {
    const s = SCENES[k];
    const img = imgs[k];
    if (!img.complete || !img.naturalWidth || alpha <= 0) return;
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
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x, y, w, h);
    ctx.globalAlpha = 1;
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
      drawScene(k, t, 1);
      // Fundido a la siguiente escena en el último cuarto de cada una.
      if (k < N - 1 && t > 0.72) drawScene(k + 1, 0, ease((t - 0.72) / 0.28));
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
      // Relámpago de vez en cuando.
      if (s.lightning && !reduced) {
        const f = (sec % 7.3) / 7.3;
        if (f > 0.96) {
          ctx.fillStyle = `rgba(210, 200, 255, ${(1 - (f - 0.96) / 0.04) * 0.35})`;
          ctx.fillRect(0, 0, W, H);
        }
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
      // Al entrar en la pantalla, todo se funde con el fondo del simulador.
      if (k === N - 1 && t > 0.55) {
        ctx.fillStyle = `rgba(10, 6, 16, ${ease((t - 0.55) / 0.45)})`;
        ctx.fillRect(0, 0, W, H);
      }
      bar.style.transform = `scaleX(${shown})`;
      for (const c of caps) {
        const from = Number(c.dataset.from);
        const to = Number(c.dataset.to);
        const span = to - from;
        const a = shown < from || shown > to ? 0 : Math.min(1, (shown - from) / (span * 0.2), (to - shown) / (span * 0.2));
        const op = String(Math.round(a * 100) / 100);
        if (c.style.opacity !== op) {
          c.style.opacity = op;
          c.style.visibility = a > 0 ? 'visible' : 'hidden';
          c.style.transform = `translateY(${(1 - a) * 18}px)`;
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  target = shown = progress();
}
