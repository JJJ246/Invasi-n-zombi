// Punto de entrada del motor. Lo usan el navegador (Web Worker), AWS Lambda y los tests.
export { DEFAULTS, PARROQUIAS, makeConfig, configHash, scaleOf } from './config.js';
export { buildPopulation, LAYERS } from './population.js';
export { simulateRun, STRATEGIES, DEFAULT_POLICY } from './model.js';
export { runBatch, aggregate, optimizePolicy, runMonteCarlo, traceRun, CANDIDATE_POLICIES, candidatePolicies } from './montecarlo.js';
export { cityLayout, REGIONS } from './layout.js';
export { headline, mayorReport } from './report.js';
