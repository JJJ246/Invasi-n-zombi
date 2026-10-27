// Corre el motor en segundo plano para que la página no se congele.
import { makeConfig, optimizePolicy, runBatch, aggregate, buildPopulation, traceRun, candidatePolicies } from './engine/index.js';

const CHUNK = 10;

function simulate(config) {
  const cfg = makeConfig(config);
  const pop = buildPopulation(cfg);
  self.postMessage({ type: 'progress', value: 0, text: `Optimizando la estrategia (${candidatePolicies(cfg).length} políticas candidatas)…` });
  const optimization = optimizePolicy(cfg, pop);

  const runs = [];
  for (let from = 0; from < cfg.runs; from += CHUNK) {
    runs.push(...runBatch(cfg, optimization.best, from, Math.min(CHUNK, cfg.runs - from)));
    const value = Math.round((runs.length / cfg.runs) * 100);
    self.postMessage({ type: 'progress', value, text: `Simulando: ${runs.length} de ${cfg.runs} corridas…` });
  }
  const summary = { ...aggregate(cfg, runs), policy: optimization.best, ranking: optimization.ranking, engine: 'navegador' };
  self.postMessage({ type: 'done', summary });
}

// La animación: repite la corrida típica guardando el estado de cada persona cada día.
function trace({ config, policy, run }) {
  const t = traceRun(config, policy, run);
  const buffers = [t.layout.x.buffer, t.layout.y.buffer, t.nada.frames.buffer, t.azar.frames.buffer, t.adaptativa.frames.buffer];
  self.postMessage({ type: 'trace', trace: t }, buffers);
}

// Portada: el primer brote (con la semilla por defecto) que despega, con la política del escenario base.
function hero({ config, policy }) {
  for (let run = 0; run < 30; run++) {
    const t = traceRun(config, policy, run);
    if (t.nada.infected / t.N < 0.2 && run < 29) continue;
    const buffers = [t.layout.x.buffer, t.layout.y.buffer, t.nada.frames.buffer, t.adaptativa.frames.buffer];
    delete t.azar;
    self.postMessage({ type: 'hero', trace: t }, buffers);
    return;
  }
}

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'hero') hero(data);
    else if (data.type === 'trace') trace(data);
    else simulate(data.config);
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
