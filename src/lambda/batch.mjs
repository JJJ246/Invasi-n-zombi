// Lambda interna (sin acceso público): corre un lote de corridas Monte Carlo.
// Cada corrida usa su propia semilla, así el lote da exactamente lo mismo que en el navegador.
import { runBatch } from '../engine/index.js';

export async function handler({ config, policy, from, count }) {
  return runBatch(config, policy, from, count);
}
