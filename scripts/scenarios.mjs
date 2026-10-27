// Corre el escenario base y los "Brotes Sorpresa" ensayados y escribe docs/resultados.md.
// Uso: node scripts/scenarios.mjs [corridas]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runMonteCarlo, DEFAULTS } from '../src/engine/index.js';

const runs = Number(process.argv[2] ?? 200);
const SCENARIOS = [
  ['Base (valores por defecto)', {}],
  ['×2 contagio (R0 3,6)', { r0: 3.6 }],
  ['½ vacunas (1.250 por día)', { dosesPerDay: 1250 }],
  ['Empieza en el mercado de Manta', { start: 'mercado:Manta' }],
  ['Empieza en un colegio', { start: 'colegio' }],
  ['Vacuna cubre a medias (30 %)', { vaccineEfficacy: 0.3 }],
  ['Respuesta 10 días más tarde', { responseStartDay: 20, vaccineStartDay: 24 }],
  ['½ presupuesto (USD 150.000)', { budget: 150000 }],
  ['Todo junto: ×2 contagio, ½ vacunas, vacuna 30 %', { r0: 3.6, dosesPerDay: 1250, vaccineEfficacy: 0.3 }],
];

const n = (x) => Math.round(x).toLocaleString('es-EC');
const pct = (x) => `${Math.round(x * 100)} %`;
const PRIORITY = { anillo: 'anillo', mixto: 'mixta', conectados: 'más conectados' };

const rows = [];
for (const [name, extra] of SCENARIOS) {
  const t = performance.now();
  const s = runMonteCarlo({ ...extra, runs });
  const p = s.policy;
  rows.push(
    `| ${name} | ${n(s.strategies.nada.infected.mean)} | ${n(s.strategies.azar.infected.mean)} | **${n(s.strategies.adaptativa.infected.mean)}** ` +
      `| ${n(s.savedVsNone.mean)} (${n(s.savedVsNone.p5)}–${n(s.savedVsNone.p95)}) | ${n(s.savedVsRandom.mean)} (${n(s.savedVsRandom.p5)}–${n(s.savedVsRandom.p95)}) ` +
      `| ${pct(s.winRateVsRandom)} / ${pct(s.lossRateVsRandom)} (${s.takeoffRuns}) | ${PRIORITY[p.priority]}${p.quarantine ? ' + cuarentenas' : ''}${p.closures ? ' + cierres' : ''}${p.reserve ? ` + reserva ${p.reserve * 100} %` : ''} | \`${s.configHash}\` |`,
  );
  console.log(`${name}: ${((performance.now() - t) / 1000).toFixed(1)} s`);
}

const doc = `# Resultados reproducibles

Generado con \`node scripts/scenarios.mjs ${runs}\`: ${runs} simulaciones por escenario, semilla ${DEFAULTS.seed}.
Las cifras son **personas de Manta** (población urbana 258.697; cada agente representa ${n(DEFAULTS.realPopulation / DEFAULTS.agents)} personas).
Cualquiera puede repetir una fila: misma configuración + misma semilla = mismo resultado (la huella identifica la configuración).

- **Mordidos**: promedio de personas que llegan a ser mordidas en ${DEFAULTS.days} días.
- **Salvados**: diferencia pareada en la misma corrida (misma semilla) — promedio y rango del 5 % al 95 %.
- **Gana / pierde vs azar**: proporción de brotes que despegan (sin intervención muerden a ≥ 1 % de la población) en que la estrategia deja menos (o más) mordidos que repartir los mismos recursos al azar. Entre paréntesis, cuántos de los ${runs} brotes despegaron; el resto se apaga solo antes de que el comité actúe y ahí todas las estrategias empatan.

| Escenario | Mordidos sin hacer nada | Mordidos al azar | Mordidos con la estrategia | Salvados vs nada | Salvados vs azar | Gana / pierde vs azar (brotes) | Política elegida | Huella |
|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;

const out = fileURLToPath(new URL('../docs/resultados.md', import.meta.url));
writeFileSync(out, doc);
console.log(`Escrito ${out}`);
