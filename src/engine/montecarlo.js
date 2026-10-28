// Monte Carlo: repite la simulación muchas veces y resume promedios y rangos (percentiles 5–95).
import { hashSeed } from './rng.js';
import { makeConfig, configHash, scaleOf } from './config.js';
import { zonesOf } from './cities.js';
import { buildPopulation } from './population.js';
import { simulateRun, STRATEGIES } from './model.js';
import { cityLayout } from './layout.js';

export const runSeed = (cfg, run) => hashSeed(cfg.seed, 'corrida', run);
const trainingSeed = (cfg, run) => hashSeed(cfg.seed, 'entrenamiento', run);

// Políticas candidatas: prioridad de vacunación × usar cierres × usar cuarentenas × reserva de presupuesto.
// La reserva solo tiene sentido si hay cuarentenas o cierres en qué gastarla.
export const CANDIDATE_POLICIES = ['anillo', 'mixto', 'conectados'].flatMap((priority) =>
  [true, false].flatMap((closures) =>
    [true, false].flatMap((quarantine) =>
      (closures || quarantine ? [0, 0.5] : [0]).map((reserve) => ({ priority, closures, quarantine, reserve, fumigation: false })),
    ),
  ),
);

// Si la plaga la transmite un mosquito, cada política se prueba también con brigadas de fumigación.
export function candidatePolicies(cfg) {
  if (!cfg.vectorBorne) return CANDIDATE_POLICIES;
  return CANDIDATE_POLICIES.flatMap((p) => [p, { ...p, fumigation: true, reserve: p.reserve || 0.5 }]).filter(
    (p, i, all) => all.findIndex((q) => JSON.stringify(q) === JSON.stringify(p)) === i,
  );
}

// Optimizador: prueba cada política en corridas de ENTRENAMIENTO (semillas distintas a las de
// evaluación, para no "hacer trampa") y elige la que deja menos personas mordidas en promedio.
// Desempate: la más barata. Si el jurado cambia las condiciones, se vuelve a optimizar.
// onPolicy (opcional) recibe cada política apenas se evalúa, para mostrar el avance en la interfaz.
export function optimizePolicy(cfgInput, pop = null, onPolicy = null) {
  const cfg = makeConfig(cfgInput);
  const population = pop ?? buildPopulation(cfg);
  const candidates = candidatePolicies(cfg);
  const ranking = candidates.map((policy, k) => {
    let infected = 0;
    let spent = 0;
    for (let r = 0; r < cfg.optimizeRuns; r++) {
      const res = simulateRun(population, cfg, 'adaptativa', trainingSeed(cfg, r), null, policy);
      infected += res.infected;
      spent += res.spent;
    }
    const result = { policy, infected: (infected / cfg.optimizeRuns) * scaleOf(cfg), spent: spent / cfg.optimizeRuns };
    onPolicy?.(result, k, candidates.length);
    return result;
  }).sort((a, b) => a.infected - b.infected || a.spent - b.spent);
  return { best: ranking[0].policy, ranking };
}

const compact = (res) => ({
  infected: res.infected,
  peakI: res.peakI,
  peakDay: res.peakDay,
  spent: res.spent,
  dosesUsed: res.dosesUsed,
  vaccineImmune: res.vaccineImmune,
  wastedHidden: res.wastedHidden,
  wastedVisible: res.wastedVisible,
  quarantines: res.quarantines,
  dosesByParroquia: Array.from(res.dosesByParroquia),
  closures: res.closures,
  fumigations: res.fumigations,
  I: Array.from(res.daily.I),
  cumulative: Array.from(res.cumulative),
});

// Corre las corridas [from, from + count). Cada corrida usa su propia semilla derivada de la
// semilla maestra, así un lote en Lambda da lo mismo que esas corridas en el navegador.
export function runBatch(cfgInput, policy, from = 0, count = null) {
  const cfg = makeConfig(cfgInput);
  const pop = buildPopulation(cfg);
  const total = count ?? cfg.runs;
  const runs = [];
  for (let r = from; r < from + total; r++) {
    const seed = runSeed(cfg, r);
    const adaptive = simulateRun(pop, cfg, 'adaptativa', seed, null, policy);
    const random = simulateRun(pop, cfg, 'azar', seed, adaptive);
    const none = simulateRun(pop, cfg, 'nada', seed);
    runs.push({ run: r, seed, nada: compact(none), azar: compact(random), adaptativa: compact(adaptive) });
  }
  return runs;
}

export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

// Prueba de signos (una cola): si la estrategia fuera igual de buena que la otra, ganar o perder
// cada brote sería como lanzar una moneda. p = probabilidad de ganar al menos `wins` de `wins + losses`
// por pura suerte. Los empates no cuentan.
export function signTestP(wins, losses) {
  const n = wins + losses;
  if (n === 0) return 1;
  let logC = 0; // log C(n, 0)
  const terms = [];
  for (let k = 0; k <= n; k++) {
    if (k > 0) logC += Math.log((n - k + 1) / k);
    if (k >= wins) terms.push(logC - n * Math.LN2);
  }
  const max = Math.max(...terms);
  return Math.min(1, Math.exp(max) * terms.reduce((a, t) => a + Math.exp(t - max), 0));
}

function verdict(takeoff, other) {
  const wins = takeoff.filter((r) => r.adaptativa.infected < r[other].infected).length;
  const losses = takeoff.filter((r) => r.adaptativa.infected > r[other].infected).length;
  const p = signTestP(wins, losses);
  return { wins, losses, ties: takeoff.length - wins - losses, p, passed: wins > losses && p < 0.05 };
}
const stats = (values, factor = 1) => ({
  mean: mean(values) * factor,
  p5: percentile(values, 0.05) * factor,
  p50: percentile(values, 0.5) * factor,
  p95: percentile(values, 0.95) * factor,
});

// Resume todas las corridas. Las cifras de personas se expresan en habitantes reales de la ciudad.
export function aggregate(cfgInput, runs) {
  const cfg = makeConfig(cfgInput);
  const scale = scaleOf(cfg);
  const days = cfg.days;
  const byStrategy = {};
  for (const s of STRATEGIES) {
    const results = runs.map((r) => r[s]);
    const curve = { mean: [], p5: [], p95: [] };
    for (let d = 0; d <= days; d++) {
      const values = results.map((x) => x.I[d]);
      curve.mean.push(mean(values) * scale);
      curve.p5.push(percentile(values, 0.05) * scale);
      curve.p95.push(percentile(values, 0.95) * scale);
    }
    byStrategy[s] = {
      infected: stats(results.map((x) => x.infected), scale),
      attackRate: stats(results.map((x) => x.infected / cfg.agents)),
      peak: stats(results.map((x) => x.peakI), scale),
      peakDay: stats(results.map((x) => x.peakDay)),
      spent: stats(results.map((x) => x.spent)),
      doses: stats(results.map((x) => x.dosesUsed), scale),
      wastedHidden: stats(results.map((x) => x.wastedHidden), scale),
      wastedVisible: results.reduce((a, x) => a + x.wastedVisible, 0),
      quarantines: stats(results.map((x) => x.quarantines), scale),
      curve,
    };
  }

  // Comparación pareada: misma corrida (misma semilla) con distinta estrategia.
  const savedVsNone = runs.map((r) => r.nada.infected - r.adaptativa.infected);
  const savedVsRandom = runs.map((r) => r.azar.infected - r.adaptativa.infected);
  const randomVsNone = runs.map((r) => r.nada.infected - r.azar.infected);

  // Con un solo caso inicial, muchos brotes se apagan solos antes de que el comité actúe; en esas
  // corridas todas las estrategias empatan. Por eso las victorias se miden sobre los brotes que
  // "despegan": sin intervención llegan a morder al menos al 1 % de la población.
  const takeoff = runs.filter((r) => r.nada.infected >= 0.01 * cfg.agents);
  const share = (list, pred) => (list.length ? list.filter(pred).length / list.length : 0);

  // Dónde y cuándo actuó la estrategia (para el informe al alcalde).
  const dosesByParroquia = zonesOf(cfg).map((name, p) => ({
    parroquia: name,
    doses: mean(runs.map((r) => r.adaptativa.dosesByParroquia[p])) * scale,
  })).sort((a, b) => b.doses - a.doses);
  const closureCounts = {};
  for (const r of runs) {
    for (const c of r.adaptativa.closures) {
      const key = `${c.layer}|${c.parroquia}`;
      closureCounts[key] ??= { layer: c.layer, parroquia: c.parroquia, runs: 0, firstDays: [] };
      closureCounts[key].firstDays.push(c.day);
    }
  }
  const closures = Object.values(closureCounts)
    .map((c) => ({
      layer: c.layer,
      parroquia: c.parroquia,
      share: new Set(runs.filter((r) => r.adaptativa.closures.some((x) => x.layer === c.layer && x.parroquia === c.parroquia)).map((r) => r.run)).size / runs.length,
      typicalDay: Math.round(percentile(c.firstDays, 0.5)),
    }))
    .sort((a, b) => b.share - a.share);

  // Fumigaciones (modo dengue): en qué parroquias se activaron y en cuántas simulaciones.
  const fumigations = zonesOf(cfg).map((parroquia) => {
    const withIt = runs.filter((r) => r.adaptativa.fumigations.some((f) => f.parroquia === parroquia));
    const days = withIt.flatMap((r) => r.adaptativa.fumigations.filter((f) => f.parroquia === parroquia).map((f) => f.day));
    return { parroquia, share: withIt.length / runs.length, typicalDay: Math.round(percentile(days, 0.5)) };
  })
    .filter((f) => f.share > 0)
    .sort((a, b) => b.share - a.share);

  // Corrida para la animación: la MEDIANA de los brotes que despegan (no la más favorable),
  // para que lo que se ve sea un caso típico y no uno elegido a conveniencia.
  const pool = (takeoff.length ? takeoff : runs).slice().sort((a, b) => a.nada.infected - b.nada.infected || a.run - b.run);
  const representative = pool[Math.floor((pool.length - 1) / 2)];

  return {
    configHash: configHash(cfg),
    config: cfg,
    runs: runs.length,
    representativeRun: representative.run,
    scale,
    strategies: byStrategy,
    savedVsNone: stats(savedVsNone, scale),
    savedVsRandom: stats(savedVsRandom, scale),
    randomVsNone: stats(randomVsNone, scale),
    takeoffShare: takeoff.length / runs.length,
    takeoffRuns: takeoff.length,
    winRateVsNone: share(takeoff, (r) => r.adaptativa.infected < r.nada.infected),
    winRateVsRandom: share(takeoff, (r) => r.adaptativa.infected < r.azar.infected),
    lossRateVsRandom: share(takeoff, (r) => r.adaptativa.infected > r.azar.infected),
    // Veredicto de la prueba de fuego: ¿la estrategia supera a cada línea base sin que sea suerte?
    verdictVsNone: verdict(takeoff, 'nada'),
    verdictVsRandom: verdict(takeoff, 'azar'),
    savedVsNoneTakeoff: stats(takeoff.map((r) => r.nada.infected - r.adaptativa.infected), scale),
    savedVsRandomTakeoff: stats(takeoff.map((r) => r.azar.infected - r.adaptativa.infected), scale),
    dosesByParroquia,
    closures,
    fumigations,
  };
}

// Repite UNA corrida (misma semilla) para las tres estrategias guardando el estado de cada persona cada día.
export function traceRun(cfgInput, policy, run) {
  const cfg = makeConfig(cfgInput);
  const pop = buildPopulation(cfg);
  const seed = runSeed(cfg, run);
  const adaptive = simulateRun(pop, cfg, 'adaptativa', seed, null, policy, true);
  const random = simulateRun(pop, cfg, 'azar', seed, adaptive, policy, true);
  const none = simulateRun(pop, cfg, 'nada', seed, null, policy, true);
  const pick = (r) => ({
    frames: r.frames,
    closures: r.closures,
    fumigations: r.fumigations,
    quarantinesByDay: Array.from(r.quarantinesByDay),
    dosesByDay: Array.from(r.dosesByDay),
    I: Array.from(r.daily.I),
    cumulative: Array.from(r.cumulative),
    infected: r.infected,
    story: r.story,
  });
  // Datos de cada persona para el Modo Vecino (rutina y contactos).
  const home = pop.layerPlace[0];
  const people = {
    role: pop.role,
    parroquia: pop.parroquia,
    home,
    homeSize: Int16Array.from(home, (h) => pop.placeSize[0][h]),
    colegio: pop.layerPlace[1],
    trabajo: pop.layerPlace[2],
    bus: pop.layerPlace[3],
    connectivity: Float32Array.from(pop.connectivity),
  };
  return { run, seed, city: cfg.city, N: cfg.agents, days: cfg.days, scale: scaleOf(cfg), layout: cityLayout(pop, cfg.seed), people, nada: pick(none), azar: pick(random), adaptativa: pick(adaptive) };
}

// Atajo: optimiza la política, corre la evaluación y resume.
export function runMonteCarlo(cfgInput) {
  const cfg = makeConfig(cfgInput);
  const optimization = optimizePolicy(cfg);
  const summary = aggregate(cfg, runBatch(cfg, optimization.best));
  return { ...summary, policy: optimization.best, ranking: optimization.ranking };
}
