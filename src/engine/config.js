// Parámetros del escenario. Cada valor por defecto está documentado en el README (tabla de supuestos)
// con su fuente, o marcado como SUPUESTO cuando no hay dato público.
import { hashSeed } from './rng.js';

export const PARROQUIAS = ['Manta', 'Tarqui', 'Los Esteros', 'Eloy Alfaro', 'San Mateo'];

export const DEFAULTS = Object.freeze({
  // --- Reproducibilidad ---
  seed: 2026,
  runs: 100, // corridas Monte Carlo por estrategia

  // --- Población (INEC, Censo 2022) ---
  realPopulation: 258697, // población urbana de Manta
  agents: 10000, // agentes simulados; cada agente representa realPopulation / agents personas
  householdMean: 3.3, // personas por hogar en Manabí
  singleHouseholdShare: 0.145, // hogares unipersonales en Manabí
  studentShare: 0.25, // SUPUESTO
  workerShare: 0.4, // SUPUESTO
  busShare: 0.5, // SUPUESTO: proporción de estudiantes y trabajadores que usan bus
  classSize: 30, // SUPUESTO
  workplaceSize: 10, // SUPUESTO
  busRouteSize: 40, // SUPUESTO
  marketVisitProb: 0.3, // SUPUESTO: probabilidad diaria de ir al mercado de su parroquia

  // Contactos efectivos por día en cada lugar (SUPUESTO inspirado en POLYMOD, Mossong 2008).
  // En el hogar el contacto es con todos los convivientes.
  contacts: { colegio: 10, trabajo: 6, bus: 4, mercado: 3, barrio: 1 },
  attendance: { colegio: 0.71, trabajo: 0.71, bus: 0.7, mercado: 1, barrio: 1 }, // 0.71 = 5 de 7 días
  zombieMobility: 0.5, // SUPUESTO: un zombi sale de casa la mitad de lo normal

  // --- Plaga: "mordida zombi" inspirada en influenza ---
  r0: 1.8, // Biggerstaff 2014: mediana pandemia 1918 = 1.80 (estacional = 1.28)
  latentMin: 1, // Incubación influenza 1–4 días, media ~2 (CDC)
  latentMax: 3,
  infectiousMin: 4, // Contagioso ~5 días (CDC: 5–7 días desde el inicio)
  infectiousMax: 6,
  initialInfected: 1, // el reto: "empezó con un solo caso"
  detectionProb: 0.5, // SUPUESTO: probabilidad diaria de que un zombi sea reportado (los mordidos nunca se ven)
  responseStartDay: 10, // SUPUESTO: día en que el comité reconoce el brote y empieza a actuar
  start: 'mercado:Tarqui', // 'aleatorio' | 'mercado:<parroquia>' | 'parroquia:<parroquia>' | 'colegio'
  days: 120,

  // --- Recursos (en personas reales; se convierten a agentes) ---
  dosesPerDay: 2500,
  vaccineStartDay: 14, // SUPUESTO: las primeras dosis llegan dos semanas después del primer caso
  vaccineEfficacy: 0.6, // CDC: efectividad de la vacuna de influenza 40–60 % en buenas temporadas
  costPerDose: 10, // USD, SUPUESTO
  closureCostPerDay: 6000, // USD por parroquia y por día de cierre de mercado o colegios, SUPUESTO
  quarantineCostPerHouseholdDay: 20, // USD de apoyo (comida, ingresos) por hogar real y día, SUPUESTO
  quarantineDays: 7,
  quarantineCompliance: 0.8, // SUPUESTO: proporción de personas que cumple la cuarentena
  budget: 300000, // USD totales
  closeDays: 7,
  optimizeRuns: 6, // corridas de entrenamiento por política candidata (semillas distintas a las de evaluación)

  // --- Plaga transmitida por mosquito (modo dengue): brigadas de fumigación por parroquia ---
  vectorBorne: false,
  fumigationCostPerDay: 3000, // USD por parroquia y día de brigada, SUPUESTO
  fumigationDays: 7,
  fumigationEffect: 0.5, // SUPUESTO: la fumigación reduce a la mitad el contagio en la parroquia mientras dura
  fumigationThreshold: 0.002, // prevalencia de casos reportados en la parroquia que activa la brigada
  marketCloseThreshold: 0.003, // prevalencia visible de zombis en la parroquia que activa el cierre
  schoolCloseThreshold: 0.005,
});

const LIMITS = {
  seed: [0, 4294967295],
  runs: [1, 5000],
  agents: [1000, 50000],
  r0: [0.5, 6],
  initialInfected: [1, 200],
  days: [30, 365],
  dosesPerDay: [0, 100000],
  vaccineStartDay: [0, 120],
  vaccineEfficacy: [0, 1],
  costPerDose: [0, 1000],
  closureCostPerDay: [0, 1000000],
  budget: [0, 100000000],
  closeDays: [1, 60],
  quarantineCostPerHouseholdDay: [0, 10000],
  quarantineDays: [1, 60],
  optimizeRuns: [1, 50],
  detectionProb: [0.01, 1],
  latentMin: [1, 30],
  latentMax: [1, 30],
  infectiousMin: [1, 30],
  infectiousMax: [1, 30],
  realPopulation: [1000, 20000000],
  fumigationCostPerDay: [0, 1000000],
  fumigationDays: [1, 60],
  fumigationEffect: [0, 1],
  fumigationThreshold: [0, 1],
  responseStartDay: [0, 120],
  quarantineCompliance: [0, 1],
  marketCloseThreshold: [0, 1],
  schoolCloseThreshold: [0, 1],
  zombieMobility: [0, 1],
};

// Combina los valores del usuario con los de por defecto y rechaza valores fuera de rango.
export function makeConfig(input = {}) {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  for (const [key, value] of Object.entries(input)) {
    if (!(key in DEFAULTS)) throw new Error(`Parámetro desconocido: ${key}`);
    if (typeof DEFAULTS[key] === 'object') {
      cfg[key] = { ...cfg[key], ...value };
    } else {
      cfg[key] = value;
    }
  }
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const v = Number(cfg[key]);
    if (!Number.isFinite(v) || v < min || v > max) {
      throw new Error(`${key} debe estar entre ${min} y ${max}`);
    }
    cfg[key] = v;
  }
  cfg.vectorBorne = cfg.vectorBorne === true;
  cfg.seed = Math.floor(cfg.seed);
  cfg.runs = Math.floor(cfg.runs);
  cfg.agents = Math.floor(cfg.agents);
  if (cfg.latentMin > cfg.latentMax || cfg.infectiousMin > cfg.infectiousMax) {
    throw new Error('Los mínimos de duración no pueden superar a los máximos');
  }
  validateStart(cfg.start);
  return cfg;
}

function validateStart(start) {
  if (start === 'aleatorio' || start === 'colegio') return;
  const [kind, place] = String(start).split(':');
  if ((kind === 'mercado' || kind === 'parroquia') && PARROQUIAS.includes(place)) return;
  throw new Error(`Punto de inicio no válido: ${start}`);
}

// Cuántas personas reales representa cada agente.
export const scaleOf = (cfg) => cfg.realPopulation / cfg.agents;

// Huella de la configuración: mismo hash => mismos resultados.
export function configHash(cfg) {
  return hashSeed(stableStringify(cfg)).toString(16).padStart(8, '0');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
