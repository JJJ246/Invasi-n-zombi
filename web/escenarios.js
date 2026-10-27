// Plantillas de escenario: el mismo motor sirve para la demo del reto o para un brote real.
// Cada una fija la ciudad, la enfermedad y el vocabulario; el usuario puede cambiar todo después.
import { CALIBRATION } from './engine/calibration.js';
import { DENGUE_PERIODS } from './engine/dengue-manabi-2024.js';

const INFLUENZA = { r0: 1.8, latentMin: 1, latentMax: 3, infectiousMin: 4, infectiousMax: 6, days: 120, vectorBorne: false, initialInfected: 1 };
const DENGUE = { r0: CALIBRATION.r0, ...DENGUE_PERIODS, days: 180, vectorBorne: true, initialInfected: 10 };

export const SCENARIOS = {
  zombi: {
    title: 'Plaga zombi en Manta',
    sub: 'La demo del reto: un caso en el mercado de Tarqui, contagio de persona a persona.',
    theme: 'zombi',
    disease: 'que convierte en zombis, tan contagiosa como una influenza fuerte',
    config: { city: 'manta', ...INFLUENZA },
  },
  influenza: {
    title: 'Gripe fuerte (influenza)',
    sub: 'Contagio de persona a persona en casa, bus, colegio y trabajo. Referencia: pandemia de 1918.',
    theme: 'real',
    disease: 'de influenza fuerte',
    config: { ...INFLUENZA },
  },
  dengue: {
    title: 'Dengue',
    sub: 'Lo transmite el mosquito. Contagio calibrado con los 10.450 casos de Manabí 2024 (MSP).',
    theme: 'real',
    disease: 'de dengue, con el contagio calibrado con los datos reales de Manabí 2024 (MSP)',
    config: { ...DENGUE },
  },
  nino: {
    title: 'El Niño 2026 en Guayaquil',
    sub: 'Lluvias y calor multiplican los mosquitos: dengue en una ciudad de 2,6 millones.',
    theme: 'real',
    disease: 'de dengue durante las lluvias de El Niño (más criaderos de mosquito: contagio 50 % mayor que en 2024, SUPUESTO)',
    // SUPUESTO: El Niño aumenta la densidad de Aedes aegypti (Primicias, sept. 2026); se modela como R0 × 1,5.
    config: { city: 'guayaquil', ...DENGUE, r0: +(CALIBRATION.r0 * 1.5).toFixed(1) },
  },
};
