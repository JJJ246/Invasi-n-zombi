// Posición de cada persona para la animación "La ciudad en vivo", sobre el mapa REAL de Manta.
// Cada hogar cae dentro de los límites oficiales de su parroquia (OpenStreetMap) y con más probabilidad
// donde hay más edificios y calles; sus miembros quedan agrupados alrededor. Coordenadas en [0, 1] del mapa.
import { Rng, hashSeed } from './rng.js';
import { HOME } from './population.js';
import { PARROQUIAS } from './config.js';
import { MAP, PARROQUIA_SHAPES } from './manta-map.js';

export const ASPECT = MAP.aspect;

const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// Celdas habitadas de cada parroquia con su peso acumulado (para sortear dónde vive cada hogar).
let cells = null;
function parroquiaCells() {
  if (cells) return cells;
  const owner = decode(MAP.owner);
  const weight = decode(MAP.weight);
  cells = PARROQUIAS.map(() => ({ index: [], cumulative: [], total: 0 }));
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] === 255 || weight[i] === 0) continue;
    const c = cells[owner[i]];
    c.total += weight[i];
    c.index.push(i);
    c.cumulative.push(c.total);
  }
  return cells;
}

// Centro de cada parroquia (ponderado por densidad, para que el nombre quede sobre la zona poblada)
// y un radio aproximado en fracción del ancho, para ubicar etiquetas de cierres y fumigación.
export const REGIONS = PARROQUIAS.map((name, k) => {
  const c = parroquiaCells()[k];
  let sx = 0;
  let sy = 0;
  for (let j = 0; j < c.index.length; j++) {
    const w = c.cumulative[j] - (j ? c.cumulative[j - 1] : 0);
    sx += ((c.index[j] % MAP.gridW) + 0.5) * w;
    sy += (Math.floor(c.index[j] / MAP.gridW) + 0.5) * w;
  }
  return { name, x: sx / c.total / MAP.gridW, y: sy / c.total / MAP.gridH, r: Math.sqrt(c.index.length / Math.PI) / MAP.gridW / 2 };
});

function pickCell(c, u) {
  const target = u * c.total;
  let lo = 0;
  let hi = c.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.cumulative[mid] > target) hi = mid;
    else lo = mid + 1;
  }
  return c.index[lo];
}

export function cityLayout(pop, seed) {
  const rng = new Rng(hashSeed(seed, 'mapa'));
  const all = parroquiaCells();
  const N = pop.N;
  const x = new Float32Array(N);
  const y = new Float32Array(N);
  const home = pop.layerPlace[HOME];
  const centers = new Map();
  for (let i = 0; i < N; i++) {
    let c = centers.get(home[i]);
    if (!c) {
      const cell = pickCell(all[pop.parroquia[i]], rng.next());
      c = { x: ((cell % MAP.gridW) + rng.next()) / MAP.gridW, y: (Math.floor(cell / MAP.gridW) + rng.next()) / MAP.gridH };
      centers.set(home[i], c);
    }
    x[i] = c.x + (rng.next() - 0.5) * 0.003;
    y[i] = c.y + (rng.next() - 0.5) * 0.003 * ASPECT;
  }
  return { x, y, regions: REGIONS, aspect: ASPECT, image: MAP.image, attribution: MAP.attribution, shapes: PARROQUIA_SHAPES };
}
