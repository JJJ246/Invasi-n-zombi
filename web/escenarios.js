// Plantillas de escenario: el mismo motor sirve para la demo del reto o para un brote real.
// Cada una fija la enfermedad y el vocabulario; el usuario puede cambiar todo después. Todas son en Manta,
// que es la ciudad que pide el reto.
import { CALIBRATION } from './engine/calibration.js';
import { DENGUE_PERIODS } from './engine/dengue-manabi-2024.js';

const INFLUENZA = { r0: 1.8, latentMin: 1, latentMax: 3, infectiousMin: 4, infectiousMax: 6, days: 120, vectorBorne: false, initialInfected: 1 };
const DENGUE = { r0: CALIBRATION.r0, ...DENGUE_PERIODS, days: 180, vectorBorne: true, initialInfected: 10 };

// Imagen de cada escenario (generada con Higgsfield para este proyecto).
const ART = Object.fromEntries(['zombi', 'gripe', 'dengue'].map((k) => [k, `<img class="sc-art" src="img/hf/esc_${k}.webp" alt="" width="88" height="66">`]));

export const SCENARIOS = {
  zombi: {
    title: 'Plaga zombi en Manta',
    sub: 'Empieza con una mordida en el mercado de Tarqui.',
    tag: 'El reto',
    art: ART.zombi,
    theme: 'zombi',
    disease: 'que convierte en zombis, tan contagiosa como una influenza fuerte',
    config: { city: 'manta', ...INFLUENZA },
  },
  influenza: {
    title: 'Gripe fuerte',
    sub: 'Se pasa en la casa, el bus, el colegio y el trabajo.',
    tag: 'Real',
    art: ART.gripe,
    theme: 'real',
    disease: 'de influenza fuerte',
    config: { city: 'manta', ...INFLUENZA },
  },
  dengue: {
    title: 'Dengue en Manabí',
    sub: 'Lo lleva el mosquito. Calibrado con los casos de 2024.',
    tag: 'Datos reales',
    art: ART.dengue,
    theme: 'real',
    disease: 'de dengue, con el contagio calibrado con los datos reales de Manabí 2024 (MSP)',
    config: { city: 'manta', ...DENGUE },
  },
};
