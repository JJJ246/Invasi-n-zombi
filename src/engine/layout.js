// Posición de cada persona para la animación "La ciudad en vivo", sobre el mapa REAL de la ciudad.
// Cada hogar cae dentro de los límites oficiales de su zona (OpenStreetMap) y con más probabilidad
// donde hay más edificios y calles; sus miembros quedan agrupados alrededor. Coordenadas en [0, 1] del mapa.
import { Rng, hashSeed } from './rng.js';
import { HOME } from './population.js';
import { CITIES } from './cities.js';

const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// Por ciudad: celdas habitadas de cada zona con su peso acumulado (para sortear dónde vive cada hogar)
// y el centro de cada zona (para las etiquetas). Se calcula una vez.
const cache = {};
function cityCells(cityId) {
  if (cache[cityId]) return cache[cityId];
  const { map, zones } = CITIES[cityId];
  const owner = decode(map.owner);
  const weight = decode(map.weight);
  const cells = zones.map(() => ({ index: [], cumulative: [], total: 0 }));
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] === 255 || weight[i] === 0) continue;
    const c = cells[owner[i]];
    c.total += weight[i];
    c.index.push(i);
    c.cumulative.push(c.total);
  }
  // Centro ponderado por densidad (el nombre queda sobre la zona poblada) y un radio aproximado
  // en fracción del ancho, para ubicar los avisos de cierres y fumigación.
  const regions = zones.map((name, k) => {
    const c = cells[k];
    let sx = 0;
    let sy = 0;
    for (let j = 0; j < c.index.length; j++) {
      const w = c.cumulative[j] - (j ? c.cumulative[j - 1] : 0);
      sx += ((c.index[j] % map.gridW) + 0.5) * w;
      sy += (Math.floor(c.index[j] / map.gridW) + 0.5) * w;
    }
    return { name, x: sx / c.total / map.gridW, y: sy / c.total / map.gridH, r: Math.sqrt(c.index.length / Math.PI) / map.gridW / 2 };
  });
  cache[cityId] = { cells, regions };
  return cache[cityId];
}

export const regionsOf = (cityId) => cityCells(cityId).regions;
export const REGIONS = regionsOf('manta');

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
  const { map, shapes, water } = CITIES[pop.city];
  const { cells, regions } = cityCells(pop.city);
  const rng = new Rng(hashSeed(seed, 'mapa'));
  const N = pop.N;
  const x = new Float32Array(N);
  const y = new Float32Array(N);
  const home = pop.layerPlace[HOME];
  const centers = new Map();
  // Dispersión de los miembros del hogar: ~25 m, igual en ancho y alto.
  const spread = 0.33 / map.gridW;
  for (let i = 0; i < N; i++) {
    let c = centers.get(home[i]);
    if (!c) {
      const cell = pickCell(cells[pop.parroquia[i]], rng.next());
      c = { x: ((cell % map.gridW) + rng.next()) / map.gridW, y: (Math.floor(cell / map.gridW) + rng.next()) / map.gridH };
      centers.set(home[i], c);
    }
    x[i] = c.x + (rng.next() - 0.5) * spread;
    y[i] = c.y + (rng.next() - 0.5) * spread * map.aspect;
  }
  return { x, y, regions, aspect: map.aspect, image: map.image, attribution: map.attribution, shapes, water };
}
