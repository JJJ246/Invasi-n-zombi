// Calibra el motor con datos reales: dengue en Manabí 2024 (casos semanales del MSP).
// Busca R0 y casos iniciales que, sin intervención, reproducen la forma de la curva real, y la
// fracción de casos que llega a reportarse (en dengue la mayoría de infecciones no se reporta).
// Escribe src/engine/calibration.js y docs/calibracion.md.
// Uso: node scripts/calibrate.mjs [corridas_por_punto]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeConfig, buildPopulation, simulateRun } from '../src/engine/index.js';
import { hashSeed } from '../src/engine/rng.js';
import { DENGUE_MANABI_2024, DENGUE_PERIODS } from '../src/engine/dengue-manabi-2024.js';

const RUNS = Number(process.argv[2] ?? 12);
const observed = DENGUE_MANABI_2024.weekly;
const WEEKS = observed.length;
const R0_GRID = Array.from({ length: 33 }, (_, k) => +(1.0 + 0.05 * k).toFixed(2));
const I0_GRID = [10, 20, 40, 80, 160];

const base = {
  realPopulation: DENGUE_MANABI_2024.population,
  start: 'aleatorio',
  days: WEEKS * 7,
  dosesPerDay: 0,
  ...DENGUE_PERIODS,
};

// Casos nuevos por semana (personas reales), promedio de RUNS corridas sin intervención.
function weeklyCurve(cfg) {
  const pop = buildPopulation(cfg);
  const scale = cfg.realPopulation / cfg.agents;
  const sum = new Float64Array(WEEKS);
  for (let r = 0; r < RUNS; r++) {
    const res = simulateRun(pop, cfg, 'nada', hashSeed(cfg.seed, 'calibracion', r));
    for (let w = 0; w < WEEKS; w++) sum[w] += (res.cumulative[(w + 1) * 7] - res.cumulative[w * 7]) * scale;
  }
  return Array.from(sum, (x) => x / RUNS);
}

// Fracción reportada óptima (mínimos cuadrados con solución cerrada) y error.
function fit(sim) {
  let num = 0, den = 0;
  for (let w = 0; w < WEEKS; w++) {
    num += observed[w] * sim[w];
    den += sim[w] * sim[w];
  }
  const rho = den > 0 ? num / den : 0;
  let sse = 0;
  for (let w = 0; w < WEEKS; w++) sse += (observed[w] - rho * sim[w]) ** 2;
  return { rho, sse };
}

const meanObs = observed.reduce((a, b) => a + b, 0) / WEEKS;
const sst = observed.reduce((a, x) => a + (x - meanObs) ** 2, 0);

let best = null;
const started = performance.now();
for (const r0 of R0_GRID) {
  for (const initialInfected of I0_GRID) {
    const cfg = makeConfig({ ...base, r0, initialInfected });
    const sim = weeklyCurve(cfg);
    const { rho, sse } = fit(sim);
    if (rho > 0 && rho <= 1 && (!best || sse < best.sse)) best = { r0, initialInfected, rho, sse, sim };
  }
  process.stdout.write(`R0 ${r0} listo (${((performance.now() - started) / 1000).toFixed(0)} s)\n`);
}

const r2 = 1 - best.sse / sst;
const modelWeekly = best.sim.map((x) => Math.round(best.rho * x));
const result = {
  r0: best.r0,
  initialInfected: best.initialInfected,
  reportedFraction: +best.rho.toFixed(4),
  r2: +r2.toFixed(3),
  runsPerPoint: RUNS,
  grid: { r0: [R0_GRID[0], R0_GRID.at(-1), 0.05], initialInfected: I0_GRID },
  periods: DENGUE_PERIODS,
  observed,
  model: modelWeekly,
};

const root = fileURLToPath(new URL('..', import.meta.url));
writeFileSync(
  `${root}src/engine/calibration.js`,
  `// Generado por scripts/calibrate.mjs — no editar a mano.\n// Ajuste del motor a los casos semanales de dengue en Manabí 2024 (MSP).\nexport const CALIBRATION = Object.freeze(${JSON.stringify(result)});\n`,
);

const n = (x) => Math.round(x).toLocaleString('es-EC');
const rows = observed.map((o, w) => `| ${w + 1} | ${n(o)} | ${n(modelWeekly[w])} |`).join('\n');
writeFileSync(
  `${root}docs/calibracion.md`,
  `# Calibración con datos reales: dengue en Manabí 2024

**Datos:** casos confirmados de dengue por semana epidemiológica en Manabí, 2024 (SE 1–52), del
[Ministerio de Salud Pública, Gaceta de enfermedades vectoriales SE 52-2024](${DENGUE_MANABI_2024.url}).
Total: ${n(observed.reduce((a, b) => a + b, 0))} casos. Población: ${n(DENGUE_MANABI_2024.population)} (INEC, Censo 2022).

**Qué se ajustó**, usando el mismo motor de la aplicación, sin intervenciones (la línea "no hacer nada"):

| Parámetro | Rango probado | Mejor valor |
|---|---|---|
| R0 efectivo | ${R0_GRID[0]} – ${R0_GRID.at(-1)} (paso 0,05) | **${best.r0}** |
| Casos iniciales (agentes) | ${I0_GRID.join(', ')} | **${best.initialInfected}** |
| Fracción de infecciones que se reporta | 0 – 1 (mínimos cuadrados) | **${(best.rho * 100).toFixed(2)} %** |

Ajuste: **R² = ${r2.toFixed(3)}** sobre las 52 semanas (${RUNS} simulaciones por punto de la grilla, semilla 2026).

**Cómo se usa:** el botón "Dengue Manabí 2024 (calibrado)" de la interfaz carga este R0 y estos períodos y los aplica a la ciudad de Manta.

## Supuestos y límites (para decirlos antes de que los pregunte el jurado)
- El motor contagia de persona a persona. El ciclo humano → mosquito → humano se representa con un período
  latente efectivo de ${DENGUE_PERIODS.latentMin}–${DENGUE_PERIODS.latentMax} días: incubación en humanos (media 5,9 días) más incubación
  dentro del mosquito (2–15 días a 30 °C), según [Chan y Johansson 2012](https://doi.org/10.1371/journal.pone.0050972).
  Contagioso ${DENGUE_PERIODS.infectiousMin}–${DENGUE_PERIODS.infectiousMax} días (fiebre de 2 a 7 días, CDC).
- No modela la estación de lluvias: parte de la caída de la curva real después de la semana 22 se debe al clima,
  y el modelo la explica solo con el agotamiento de susceptibles. Por eso el ajuste es aproximado.
- La fracción reportada absorbe infecciones asintomáticas y subregistro; no es una tasa clínica.
- Es una calibración de la forma de la curva a nivel provincial; no hay datos semanales públicos de Manta sola.

## Datos y modelo por semana

| Semana | Casos reales (MSP) | Modelo calibrado (casos reportados) |
|---|---|---|
${rows}
`,
);
console.log(`\nMejor: R0=${best.r0}, iniciales=${best.initialInfected}, reportado=${(best.rho * 100).toFixed(2)} %, R²=${r2.toFixed(3)}`);
