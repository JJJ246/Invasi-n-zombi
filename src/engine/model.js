// Simulación SEIR estocástica basada en agentes sobre la red de contactos por capas.
// Estados: 0 Sano (S) · 1 Mordido (E, oculto) · 2 Zombi (I, visible) · 3 Exorcizado (R, recuperado o inmune)
import { Rng, hashSeed, expNeg } from './rng.js';
import { scaleOf } from './config.js';
import { LAYERS, HOME } from './population.js';

export const S = 0, E = 1, I = 2, R = 3;
export const STRATEGIES = ['nada', 'azar', 'adaptativa'];

const COLEGIO = 1, MERCADO = 4;
const CLOSABLE = [COLEGIO, MERCADO]; // se cierran por parroquia

// Política de la estrategia adaptativa. El optimizador elige una de estas combinaciones.
// reserve = parte del presupuesto que NO se gasta en vacunas, guardada para cuarentenas y cierres.
export const DEFAULT_POLICY = Object.freeze({ priority: 'anillo', closures: true, quarantine: true, reserve: 0 });

// Elige los k índices con mayor puntaje (desempate: índice menor) usando un montículo de tamaño k.
function topK(indices, count, score, k) {
  if (k <= 0 || count === 0) return [];
  const heap = new Int32Array(Math.min(k, count));
  let size = 0;
  const worse = (a, b) => score[a] < score[b] || (score[a] === score[b] && a > b);
  const swap = (a, b) => { const t = heap[a]; heap[a] = heap[b]; heap[b] = t; };
  const siftUp = (i) => {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!worse(heap[i], heap[parent])) break;
      swap(i, parent);
      i = parent;
    }
  };
  const siftDown = (i) => {
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < size && worse(heap[l], heap[m])) m = l;
      if (r < size && worse(heap[r], heap[m])) m = r;
      if (m === i) break;
      swap(i, m);
      i = m;
    }
  };
  for (let c = 0; c < count; c++) {
    const idx = indices[c];
    if (size < heap.length) {
      heap[size++] = idx;
      siftUp(size - 1);
    } else if (worse(heap[0], idx)) {
      heap[0] = idx;
      siftDown(0);
    }
  }
  return Array.from(heap.subarray(0, size)).sort((a, b) => score[b] - score[a] || a - b);
}

function pickInitial(pop, cfg, rng) {
  const N = pop.N;
  let pool;
  if (cfg.start === 'aleatorio') pool = [...Array(N).keys()];
  else if (cfg.start === 'colegio') pool = [...Array(N).keys()].filter((i) => pop.layerPlace[COLEGIO][i] >= 0);
  else {
    const p = pop.names.indexOf(cfg.start.split(':')[1]);
    pool = [...Array(N).keys()].filter((i) => pop.parroquia[i] === p);
  }
  const chosen = [];
  const taken = new Set();
  while (chosen.length < Math.min(cfg.initialInfected, pool.length)) {
    const i = pool[rng.int(pool.length)];
    if (!taken.has(i)) {
      taken.add(i);
      chosen.push(i);
    }
  }
  return chosen;
}

/**
 * Corre una simulación completa de cfg.days días.
 * @param strategy 'nada' | 'azar' | 'adaptativa'
 * @param matched  Para 'azar': la corrida adaptativa con la misma semilla; se usan exactamente sus
 *                 mismos recursos (dosis por día, bloques de cierre y cuarentenas por día) pero al azar.
 * @param policy   Para 'adaptativa': prioridad de vacunación y qué intervenciones usar.
 * @param trace    Si es true, guarda el estado de cada persona cada día (para la animación de la ciudad):
 *                 0 sano · 1 mordido · 2 zombi · 3 exorcizado · 4 vacunado protegido; +8 si está en cuarentena.
 */
export function simulateRun(pop, cfg, strategy, runSeed, matched = null, policy = DEFAULT_POLICY, trace = false) {
  const N = pop.N;
  const D = cfg.days;
  const P = pop.names.length;
  const L = LAYERS.length;
  const H = pop.households;
  const scale = scaleOf(cfg);
  // Cada agente representa "scale" personas reales, así que cada acción sobre un agente cuesta scale veces más.
  const costPerAgentDose = cfg.costPerDose * scale;
  const costPerQuarantine = cfg.quarantineCostPerHouseholdDay * cfg.quarantineDays * scale;
  const costPerClosure = cfg.closureCostPerDay * cfg.closeDays;
  const costPerFumigation = cfg.fumigationCostPerDay * cfg.fumigationDays;

  // Números aleatorios comunes: el brote (inicio, contagios, respuesta a la vacuna) usa las mismas
  // semillas en las tres estrategias, así las diferencias se deben a la estrategia y no a la suerte.
  const epi = new Rng(hashSeed(runSeed, 'epidemia'));
  const stratRng = new Rng(hashSeed(runSeed, 'estrategia', strategy));
  const vaxRng = new Rng(hashSeed(runSeed, 'vacuna'));
  const responds = new Uint8Array(N); // la vacuna protege a esta persona (eficacia)
  const complies = new Uint8Array(N); // esta persona cumple la cuarentena
  for (let i = 0; i < N; i++) {
    responds[i] = vaxRng.next() < cfg.vaccineEfficacy ? 1 : 0;
    complies[i] = vaxRng.next() < cfg.quarantineCompliance ? 1 : 0;
  }
  const detectRng = new Rng(hashSeed(runSeed, 'deteccion'));

  const state = new Uint8Array(N);
  const timer = new Int16Array(N);
  const vaccinated = new Uint8Array(N);
  const detected = new Uint8Array(N); // caso reportado: el comité sabe que es (o fue) zombi
  const vendor = new Uint8Array(N); // "empieza en el mercado": los primeros zombis van al mercado a diario
  const home = pop.layerPlace[HOME];

  const initial = pickInitial(pop, cfg, new Rng(hashSeed(runSeed, 'inicio')));
  for (const i of initial) {
    state[i] = I;
    timer[i] = epi.between(cfg.infectiousMin, cfg.infectiousMax);
    if (cfg.start.startsWith('mercado')) vendor[i] = 1;
  }

  const closedUntil = CLOSABLE.map(() => new Int32Array(P).fill(-1)); // último día cerrado
  const quarantinedUntil = new Int32Array(H).fill(-1); // último día en cuarentena de cada hogar
  const fumigatedUntil = new Int32Array(P).fill(-1); // último día con brigada de fumigación en cada parroquia
  const fumigations = []; // { parroquia, day }
  const placeZombies = pop.placeSize.map((s) => new Float64Array(s.length));
  const hazard = new Float64Array(N);
  const score = new Float64Array(N);
  const candidates = new Int32Array(N);

  const daily = { S: new Int32Array(D + 1), E: new Int32Array(D + 1), I: new Int32Array(D + 1), R: new Int32Array(D + 1) };
  const cumulative = new Int32Array(D + 1);
  let infectedTotal = initial.length;
  let spent = 0;
  let vaccineSpent = 0;
  let stock = 0;
  let dosesUsed = 0;
  let vaccineImmune = 0;
  let wastedHidden = 0; // dosis sin efecto en casos no detectados (mordidos, zombis o recuperados sin reportar)
  let wastedVisible = 0; // dosis a casos reportados (zombis o exorcizados conocidos): debe ser siempre 0
  let quarantines = 0;
  const dosesByDay = new Int32Array(D);
  const quarantinesByDay = new Int32Array(D);
  const dosesByParroquia = new Int32Array(P);
  const closures = []; // { layer, parroquia, day }
  let hubPointer = 0;

  const frames = trace ? new Uint8Array(N * (D + 1)) : null;
  // Historias del "Modo Vecino" (solo al grabar la animación): quién mordió a quién, dónde y cuándo,
  // y por qué se vacunó a cada persona. Usa su propio generador: no altera el brote ni los resultados.
  const story = trace
    ? {
        infectedBy: new Int32Array(N).fill(-1), // -1: nadie (sano o paciente cero)
        infectedLayer: new Int8Array(N).fill(-1),
        infectedDay: new Int16Array(N).fill(-1),
        vaccinatedDay: new Int16Array(N).fill(-1),
        vaxReason: new Int8Array(N), // 1: cerca de casos (anillo/mixto) · 2: de los más conectados de la ciudad
        vaxLayer: new Int8Array(N).fill(-1), // lugar donde más riesgo tenía al vacunarse
        detectedDay: new Int16Array(N).fill(-1),
      }
    : null;
  const storyRng = trace ? new Rng(hashSeed(runSeed, 'historias', strategy)) : null;
  if (story) for (const i of initial) story.infectedDay[i] = 0;
  // Riesgo de i en cada capa (misma fórmula que la presión de contagio del paso 4).
  const layerRisk = (i, d, out) => {
    out[HOME] = placeZombies[HOME][home[i]];
    for (let l = 1; l < L; l++) {
      out[l] = 0;
      const place = pop.layerPlace[l][i];
      if (place < 0 || inQuarantine(i, d)) continue;
      const z = placeZombies[l][place];
      if (z === 0 || isClosed(l, pop.placeParroquia[l][place], d)) continue;
      out[l] = (pop.attend[l] * pop.contacts[l] * z) / Math.max(1, pop.placeSize[l][place] - 1);
    }
    return out;
  };
  const riskBuf = new Float64Array(LAYERS.length);
  let zombiesToday = [];
  const record = (d) => {
    if (frames) {
      const base = d * N;
      for (let i = 0; i < N; i++) {
        let code = state[i] === R && vaccinated[i] ? 4 : state[i];
        if (complies[i] === 1 && quarantinedUntil[home[i]] >= d) code += 8;
        frames[base + i] = code;
      }
    }
    let s = 0, e = 0, inf = 0, r = 0;
    for (let i = 0; i < N; i++) {
      const st = state[i];
      if (st === S) s++;
      else if (st === E) e++;
      else if (st === I) inf++;
      else r++;
    }
    daily.S[d] = s; daily.E[d] = e; daily.I[d] = inf; daily.R[d] = r;
    cumulative[d] = infectedTotal;
  };
  record(0);

  // Línea base "azar": los mismos bloques de cierre, pero en parroquias y días al azar.
  const randomClosures = [];
  if (strategy === 'azar' && matched) {
    for (const c of matched.closures) {
      const first = Math.min(cfg.responseStartDay, D - 1);
      const span = Math.max(1, D - cfg.closeDays - first);
      randomClosures.push({ layer: LAYERS.indexOf(c.layer), parroquia: stratRng.int(P), day: first + stratRng.int(span) });
    }
  }
  const randomFumigations = [];
  if (strategy === 'azar' && matched) {
    for (let k = 0; k < matched.fumigations.length; k++) {
      const first = Math.min(cfg.responseStartDay, D - 1);
      const span = Math.max(1, D - cfg.fumigationDays - first);
      randomFumigations.push({ parroquia: stratRng.int(P), day: first + stratRng.int(span) });
    }
  }

  const fumigate = (p, d) => {
    fumigatedUntil[p] = d + cfg.fumigationDays - 1;
    fumigations.push({ parroquia: pop.names[p], day: d });
    spent += costPerFumigation;
  };

  const isClosed = (layer, parroquia, d) => {
    const k = CLOSABLE.indexOf(layer);
    return k >= 0 && parroquia >= 0 && closedUntil[k][parroquia] >= d;
  };
  const inQuarantine = (i, d) => complies[i] === 1 && quarantinedUntil[home[i]] >= d;

  const closePlace = (layer, p, d) => {
    closedUntil[CLOSABLE.indexOf(layer)][p] = d + cfg.closeDays - 1;
    closures.push({ layer: LAYERS[layer], parroquia: pop.names[p], day: d });
    spent += costPerClosure;
  };

  const quarantine = (h, d) => {
    quarantinedUntil[h] = d + cfg.quarantineDays - 1;
    quarantines++;
    quarantinesByDay[d]++;
    spent += costPerQuarantine;
  };

  const vaccinate = (i, d) => {
    if (detected[i]) wastedVisible++;
    vaccinated[i] = 1;
    if (story) story.vaccinatedDay[i] = d;
    dosesUsed++;
    dosesByDay[d]++;
    dosesByParroquia[pop.parroquia[i]]++;
    spent += costPerAgentDose;
    vaccineSpent += costPerAgentDose;
    if (state[i] === S) {
      if (responds[i]) {
        state[i] = R;
        vaccineImmune++;
      }
    } else {
      wastedHidden++;
    }
  };

  // Sano a la vista = sin vacunar y nunca reportado como zombi. Nunca se vacuna a un caso conocido.
  const eligible = (i) => !vaccinated[i] && !detected[i];
  const canAfford = (cost) => cfg.budget - spent >= cost;

  const zombiesByParroquia = new Int32Array(P);
  const peopleByParroquia = new Int32Array(P);
  for (let i = 0; i < N; i++) peopleByParroquia[pop.parroquia[i]]++;

  for (let d = 0; d < D; d++) {
    // 1. Información visible: cada zombi se reporta con probabilidad detectionProb por día.
    //    Los mordidos nunca se ven. El comité solo decide con los casos reportados.
    zombiesByParroquia.fill(0);
    for (let i = 0; i < N; i++) {
      if (state[i] !== I) continue;
      if (!detected[i] && detectRng.next() < cfg.detectionProb) {
        detected[i] = 1;
        if (story) story.detectedDay[i] = d;
      }
      if (detected[i]) zombiesByParroquia[pop.parroquia[i]]++;
    }
    const responding = d >= cfg.responseStartDay;

    // 2. Cuarentena del hogar de cada zombi reportado (la mayoría del contagio ocurre en casa,
    //    y sus convivientes pueden estar mordidos sin que se note).
    if (strategy === 'adaptativa' && policy.quarantine && responding) {
      for (let i = 0; i < N; i++) {
        if (state[i] === I && detected[i] && quarantinedUntil[home[i]] < d && canAfford(costPerQuarantine)) quarantine(home[i], d);
      }
    } else if (strategy === 'azar' && matched) {
      for (let k = 0; k < matched.quarantinesByDay[d] && canAfford(costPerQuarantine); k++) quarantine(stratRng.int(H), d);
    }

    // 3. Cierres de mercados y colegios por parroquia.
    if (strategy === 'adaptativa' && policy.closures && responding) {
      for (const [layer, threshold] of [[MERCADO, cfg.marketCloseThreshold], [COLEGIO, cfg.schoolCloseThreshold]]) {
        for (let p = 0; p < P; p++) {
          const prevalence = zombiesByParroquia[p] / peopleByParroquia[p];
          if (prevalence >= threshold && !isClosed(layer, p, d) && canAfford(costPerClosure)) closePlace(layer, p, d);
        }
      }
    } else if (strategy === 'azar') {
      // Al azar, pero solo desde que el comité puede actuar (mismas reglas que la adaptativa).
      for (const c of randomClosures) if (c.day === d && responding && canAfford(costPerClosure)) closePlace(c.layer, c.parroquia, d);
    }

    // 3b. Brigadas de fumigación por parroquia (solo si la plaga la transmite un mosquito).
    if (cfg.vectorBorne && strategy === 'adaptativa' && policy.fumigation && responding) {
      for (let p = 0; p < P; p++) {
        const prevalence = zombiesByParroquia[p] / peopleByParroquia[p];
        if (prevalence >= cfg.fumigationThreshold && fumigatedUntil[p] < d && canAfford(costPerFumigation)) fumigate(p, d);
      }
    } else if (cfg.vectorBorne && strategy === 'azar') {
      for (const f of randomFumigations) if (f.day === d && responding && canAfford(costPerFumigation)) fumigate(f.parroquia, d);
    }

    // 4. Presión de contagio: zombis activos en cada lugar, ponderados por asistencia.
    for (let l = 0; l < L; l++) placeZombies[l].fill(0);
    if (story) zombiesToday = [];
    for (let i = 0; i < N; i++) {
      if (state[i] !== I) continue;
      if (story) zombiesToday.push(i);
      placeZombies[HOME][home[i]] += 1;
      if (inQuarantine(i, d)) continue;
      for (let l = 1; l < L; l++) {
        const place = pop.layerPlace[l][i];
        if (place < 0) continue;
        const att = l === MERCADO && vendor[i] ? 1 : pop.attend[l];
        placeZombies[l][place] += att * cfg.zombieMobility;
      }
    }
    for (let i = 0; i < N; i++) {
      if (state[i] !== S && state[i] !== E) {
        hazard[i] = 0;
        continue;
      }
      let h = placeZombies[HOME][home[i]];
      if (!inQuarantine(i, d)) {
        for (let l = 1; l < L; l++) {
          const place = pop.layerPlace[l][i];
          if (place < 0) continue;
          const z = placeZombies[l][place];
          if (z === 0 || isClosed(l, pop.placeParroquia[l][place], d)) continue;
          h += (pop.attend[l] * pop.contacts[l] * z) / Math.max(1, pop.placeSize[l][place] - 1);
        }
      }
      // Con la parroquia fumigada hay menos mosquitos: el contagio baja también dentro de casa.
      if (fumigatedUntil[pop.parroquia[i]] >= d) h *= 1 - cfg.fumigationEffect;
      hazard[i] = h;
    }

    // 5. Vacunación con las dosis que llegan cada día.
    if (d >= cfg.vaccineStartDay) stock += cfg.dosesPerDay / scale;
    const affordable = costPerAgentDose > 0 ? Math.floor((cfg.budget - spent) / costPerAgentDose) : Infinity;
    if (strategy === 'adaptativa') {
      // Las vacunas solo pueden usar (1 - reserva) del presupuesto; el resto queda para cuarentenas y cierres.
      const vaccineCap = cfg.budget * (1 - (policy.reserve ?? 0)) - vaccineSpent;
      const affordableVaccines = costPerAgentDose > 0 ? Math.max(0, Math.floor(vaccineCap / costPerAgentDose)) : Infinity;
      const k = Math.min(Math.floor(stock), affordable, affordableVaccines);
      let count = 0;
      if (policy.priority !== 'conectados' && k > 0) {
        let hazardSum = 0;
        for (let i = 0; i < N; i++) {
          if (hazard[i] > 0 && eligible(i)) {
            candidates[count++] = i;
            hazardSum += hazard[i];
          }
        }
        // anillo: riesgo de ser mordido hoy × a cuántos podría morder después.
        // mixto: suaviza el riesgo con su promedio para no gastar todo en el foco.
        const base = policy.priority === 'mixto' && count > 0 ? hazardSum / count : 0;
        for (let c = 0; c < count; c++) {
          const i = candidates[c];
          score[i] = (hazard[i] + base) * pop.connectivity[i];
        }
      }
      const picked = topK(candidates, count, score, k);
      for (const i of picked) {
        vaccinate(i, d);
        if (story) {
          story.vaxReason[i] = 1;
          layerRisk(i, d, riskBuf);
          story.vaxLayer[i] = riskBuf.indexOf(Math.max(...riskBuf));
        }
      }
      // Sin focos cercanos (o en modo "conectados"): se protege a los más conectados de la ciudad.
      let remaining = k - picked.length;
      while (remaining > 0 && hubPointer < N) {
        const i = pop.hubOrder[hubPointer++];
        if (eligible(i)) {
          vaccinate(i, d);
          if (story) story.vaxReason[i] = 2;
          remaining--;
        }
      }
      stock -= dosesByDay[d];
    } else if (strategy === 'azar' && matched) {
      let remaining = Math.min(matched.dosesByDay[d], affordable);
      let attempts = 0;
      while (remaining > 0 && attempts < 50 * N) {
        const i = stratRng.int(N);
        attempts++;
        if (eligible(i)) {
          vaccinate(i, d);
          remaining--;
        }
      }
    }

    // Para el Modo Vecino: elige el lugar del contagio en proporción a su riesgo y, dentro de ese
    // lugar, a uno de los zombis presentes ese día.
    const attribute = (i, d) => {
      layerRisk(i, d, riskBuf);
      let total = 0;
      for (let l = 0; l < L; l++) total += riskBuf[l];
      let u = storyRng.next() * total;
      let layer = 0;
      while (layer < L - 1 && u >= riskBuf[layer]) u -= riskBuf[layer++];
      const place = pop.layerPlace[layer][i];
      const present = zombiesToday.filter((z) => pop.layerPlace[layer][z] === place && z !== i && (layer === HOME || !inQuarantine(z, d)));
      story.infectedLayer[i] = layer;
      story.infectedDay[i] = d + 1;
      story.infectedBy[i] = present.length ? present[storyRng.int(present.length)] : -1;
    };

    // 6. Progresión: mordido -> zombi -> exorcizado.
    for (let i = 0; i < N; i++) {
      if (state[i] === E) {
        if (--timer[i] <= 0) {
          state[i] = I;
          timer[i] = epi.between(cfg.infectiousMin, cfg.infectiousMax);
        }
      } else if (state[i] === I) {
        if (--timer[i] <= 0) state[i] = R;
      }
    }

    // 7. Nuevas mordidas: probabilidad 1 - e^(-q × presión).
    for (let i = 0; i < N; i++) {
      if (state[i] !== S || hazard[i] === 0) continue;
      if (epi.next() < 1 - expNeg(pop.q * hazard[i])) {
        state[i] = E;
        timer[i] = epi.between(cfg.latentMin, cfg.latentMax);
        infectedTotal++;
        if (story) attribute(i, d);
      }
    }

    record(d + 1);

    // Sin mordidos ni zombis el brote terminó: los días restantes son iguales.
    if (daily.E[d + 1] === 0 && daily.I[d + 1] === 0) {
      for (let rest = d + 2; rest <= D; rest++) {
        daily.S[rest] = daily.S[d + 1]; daily.E[rest] = 0; daily.I[rest] = 0; daily.R[rest] = daily.R[d + 1];
        cumulative[rest] = infectedTotal;
        if (frames) frames.copyWithin(rest * N, (d + 1) * N, (d + 2) * N);
      }
      break;
    }
  }

  let peakI = 0, peakDay = 0;
  for (let d = 0; d <= D; d++) if (daily.I[d] > peakI) { peakI = daily.I[d]; peakDay = d; }

  return {
    strategy,
    infected: infectedTotal,
    peakI,
    peakDay,
    dosesUsed,
    vaccineImmune,
    wastedHidden,
    wastedVisible,
    quarantines,
    spent,
    dosesByDay,
    quarantinesByDay,
    dosesByParroquia,
    closures,
    fumigations,
    daily,
    cumulative,
    frames,
    story,
  };
}
