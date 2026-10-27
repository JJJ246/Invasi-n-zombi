// Red de contactos sintética de la ciudad por capas: hogar, colegio, trabajo, bus, mercado y barrio.
// Cada persona pertenece como máximo a un "lugar" por capa. El contagio ocurre dentro de cada lugar.
import { Rng, hashSeed, expNeg } from './rng.js';
import { cityOf } from './cities.js';

export const LAYERS = ['hogar', 'colegio', 'trabajo', 'bus', 'mercado', 'barrio'];
export const HOME = 0;

const ROLE_OTHER = 0;
const ROLE_STUDENT = 1;
const ROLE_WORKER = 2;

function poisson(rng, lambda) {
  const limit = expNeg(lambda);
  let k = 0;
  let p = rng.next();
  while (p > limit) {
    k++;
    p *= rng.next();
  }
  return k;
}

function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// Agrupa una lista de personas en lugares de tamaño fijo y devuelve cuántos lugares creó.
function groupInto(members, size, memberPlace, firstPlaceId) {
  let place = firstPlaceId;
  for (let i = 0; i < members.length; i += size) {
    for (let j = i; j < Math.min(i + size, members.length); j++) memberPlace[members[j]] = place;
    place++;
  }
  return place - firstPlaceId;
}

export function buildPopulation(cfg) {
  const rng = new Rng(hashSeed(cfg.seed, 'poblacion'));
  const N = cfg.agents;
  const city = cityOf(cfg);
  const P = city.zones.length;
  // Reparto de hogares entre zonas: proporcional a su población si la ciudad la trae; si no, uniforme.
  const shareTotal = city.zoneShare ? city.zoneShare.reduce((a, b) => a + b, 0) : 0;
  const pickZone = () => {
    if (!city.zoneShare) return rng.int(P); // SUPUESTO para Manta: reparto uniforme entre parroquias urbanas
    let u = rng.next() * shareTotal;
    let z = 0;
    while (z < P - 1 && u >= city.zoneShare[z]) u -= city.zoneShare[z++];
    return z;
  };
  const parroquia = new Int8Array(N);
  const role = new Int8Array(N);
  const layerPlace = LAYERS.map(() => new Int32Array(N).fill(-1));

  // Hogares: 14,5 % unipersonales; el resto 2 + Poisson(lambda) para que la media sea householdMean.
  const lambda = (cfg.householdMean - cfg.singleHouseholdShare) / (1 - cfg.singleHouseholdShare) - 2;
  let person = 0;
  let household = 0;
  while (person < N) {
    const size = rng.next() < cfg.singleHouseholdShare ? 1 : 2 + poisson(rng, lambda);
    const p = pickZone();
    for (let i = 0; i < size && person < N; i++, person++) {
      layerPlace[HOME][person] = household;
      parroquia[person] = p;
    }
    household++;
  }

  // Roles: estudiante, trabajador u otro (niños pequeños, adultos mayores, hogar).
  for (let i = 0; i < N; i++) {
    const r = rng.next();
    role[i] = r < cfg.studentShare ? ROLE_STUDENT : r < cfg.studentShare + cfg.workerShare ? ROLE_WORKER : ROLE_OTHER;
  }

  const placeParroquia = LAYERS.map(() => []);
  const COLEGIO = 1, TRABAJO = 2, BUS = 3, MERCADO = 4, BARRIO = 5;

  // Colegios y trabajos: dentro de cada parroquia.
  let classes = 0;
  let workplaces = 0;
  for (let p = 0; p < P; p++) {
    const students = shuffle(rng, [...Array(N).keys()].filter((i) => parroquia[i] === p && role[i] === ROLE_STUDENT));
    const workers = shuffle(rng, [...Array(N).keys()].filter((i) => parroquia[i] === p && role[i] === ROLE_WORKER));
    const c = groupInto(students, cfg.classSize, layerPlace[COLEGIO], classes);
    for (let k = 0; k < c; k++) placeParroquia[COLEGIO].push(p);
    classes += c;
    const w = groupInto(workers, cfg.workplaceSize, layerPlace[TRABAJO], workplaces);
    for (let k = 0; k < w; k++) placeParroquia[TRABAJO].push(p);
    workplaces += w;
  }

  // Buses: rutas que cruzan toda la ciudad.
  const riders = shuffle(rng, [...Array(N).keys()].filter((i) => role[i] !== ROLE_OTHER && rng.next() < cfg.busShare));
  const routes = groupInto(riders, cfg.busRouteSize, layerPlace[BUS], 0);
  for (let k = 0; k < routes; k++) placeParroquia[BUS].push(-1);

  // Mercado y barrio: uno por parroquia; todos pertenecen al de su parroquia.
  for (let i = 0; i < N; i++) {
    layerPlace[MERCADO][i] = parroquia[i];
    layerPlace[BARRIO][i] = parroquia[i];
  }
  for (let p = 0; p < P; p++) {
    placeParroquia[MERCADO].push(p);
    placeParroquia[BARRIO].push(p);
  }
  placeParroquia[HOME] = null;

  const placeCount = [household, classes, workplaces, routes, P, P];
  const placeSize = placeCount.map((n, l) => {
    const size = new Int32Array(n);
    for (let i = 0; i < N; i++) if (layerPlace[l][i] >= 0) size[layerPlace[l][i]]++;
    return size;
  });

  const attend = [
    1,
    cfg.attendance.colegio,
    cfg.attendance.trabajo,
    cfg.attendance.bus,
    cfg.attendance.mercado * cfg.marketVisitProb,
    cfg.attendance.barrio,
  ];
  const contacts = [0, cfg.contacts.colegio, cfg.contacts.trabajo, cfg.contacts.bus, cfg.contacts.mercado, cfg.contacts.barrio];

  // Conectividad de cada persona: contactos efectivos esperados por día. Sirve para el R0 y
  // para que la estrategia priorice a los más conectados cuando aún no hay focos visibles.
  const connectivity = new Float64Array(N);
  let sumConnectivity = 0;
  for (let i = 0; i < N; i++) {
    let c = placeSize[HOME][layerPlace[HOME][i]] - 1;
    for (let l = 1; l < LAYERS.length; l++) {
      if (layerPlace[l][i] >= 0) c += attend[l] * attend[l] * contacts[l] * cfg.zombieMobility;
    }
    connectivity[i] = c;
    sumConnectivity += c;
  }
  const hubOrder = Int32Array.from([...Array(N).keys()].sort((a, b) => connectivity[b] - connectivity[a] || a - b));

  // q = probabilidad de contagio por contacto y día, calculada para lograr el R0 pedido:
  // R0 ≈ q × días contagiosos × contactos efectivos promedio.
  const meanInfectious = (cfg.infectiousMin + cfg.infectiousMax) / 2;
  const q = cfg.r0 / (meanInfectious * (sumConnectivity / N));

  return {
    N,
    city: cfg.city,
    names: city.zones,
    parroquia,
    role,
    layerPlace,
    placeSize,
    placeParroquia,
    attend,
    contacts,
    connectivity,
    hubOrder,
    q,
    households: household,
  };
}
