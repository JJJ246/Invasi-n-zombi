// Corre la simulación desde la terminal (mismo motor que la web y Lambda).
// Uso: node scripts/simulate.mjs '{"r0":3.6,"runs":200}'
import { runMonteCarlo, headline, mayorReport } from '../src/engine/index.js';

const input = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const started = performance.now();
const s = runMonteCarlo(input);
const fmt = (x) => Math.round(x).toLocaleString('es-EC');

console.log(headline(s));
console.log();
for (const key of ['nada', 'azar', 'adaptativa']) {
  const x = s.strategies[key];
  console.log(`${key.padEnd(11)} mordidos ${fmt(x.infected.mean).padStart(9)}  [${fmt(x.infected.p5)} – ${fmt(x.infected.p95)}]  costo USD ${fmt(x.spent.mean)}`);
}
console.log(`\nPolítica elegida: ${JSON.stringify(s.policy)}  ·  huella ${s.configHash}  ·  ${((performance.now() - started) / 1000).toFixed(1)} s\n`);
console.log(mayorReport(s));
