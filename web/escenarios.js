// Plantillas de escenario: el mismo motor sirve para la demo del reto o para un brote real.
// Cada una fija la enfermedad y el vocabulario; el usuario puede cambiar todo después. Todas son en Manta,
// que es la ciudad que pide el reto.
import { CALIBRATION } from './engine/calibration.js';
import { DENGUE_PERIODS } from './engine/dengue-manabi-2024.js';

const INFLUENZA = { r0: 1.8, latentMin: 1, latentMax: 3, infectiousMin: 4, infectiousMax: 6, days: 120, vectorBorne: false, initialInfected: 1 };
const DENGUE = { r0: CALIBRATION.r0, ...DENGUE_PERIODS, days: 180, vectorBorne: true, initialInfected: 10 };

// Pequeñas ilustraciones de cada escenario (SVG en línea, sin archivos aparte).
const ART = {
  zombi: `<svg class="sc-art" viewBox="0 0 72 52" aria-hidden="true"><defs><linearGradient id="za" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1240"/><stop offset="1" stop-color="#5a1d0c"/></linearGradient></defs><rect width="72" height="52" fill="url(#za)"/><circle cx="52" cy="15" r="9" fill="#ffb347"/><path d="M0 44h72v8H0z" fill="#1a0f0a"/><path d="M8 44V30l4-3 4 3v14M16 44V26l5-4 5 4v18" fill="#0d0812"/><path d="M33 46V34q0-2 2-2t2 2v3V27q0-2 2-2t2 2v9-11q0-2 2-2t2 2v11-8q0-2 2-2t2 2v12q0 4-3 7z" fill="#8be04e" stroke="#0a0610" stroke-width="1"/><path d="M30 46h22v6H30z" fill="#1a0f0a"/></svg>`,
  influenza: `<svg class="sc-art" viewBox="0 0 72 52" aria-hidden="true"><rect width="72" height="52" fill="#13202e"/><rect x="8" y="16" width="44" height="22" rx="4" fill="#f2c94c"/><rect x="12" y="20" width="8" height="7" rx="1" fill="#2c3e50"/><rect x="23" y="20" width="8" height="7" rx="1" fill="#2c3e50"/><rect x="34" y="20" width="8" height="7" rx="1" fill="#2c3e50"/><rect x="45" y="20" width="5" height="12" rx="1" fill="#2c3e50"/><rect x="8" y="31" width="44" height="2" fill="#2f80ed"/><circle cx="17" cy="39" r="4" fill="#1b1712"/><circle cx="43" cy="39" r="4" fill="#1b1712"/><g fill="none" stroke="#ff6b6b" stroke-width="1.6"><circle cx="60" cy="13" r="5"/><path d="M60 5v3M60 18v3M52 13h3M65 13h3M54.5 7.5l2 2M63.5 16.5l2 2M54.5 18.5l2-2M63.5 9.5l2-2"/></g><circle cx="27" cy="9" r="2.5" fill="#ff6b6b" opacity=".6"/><path d="M0 44h72v8H0z" fill="#3a3f47"/></svg>`,
  dengue: `<svg class="sc-art" viewBox="0 0 72 52" aria-hidden="true"><rect width="72" height="52" fill="#16251c"/><g stroke="#8fbcd4" stroke-width="1.2" opacity=".55"><path d="M6 2l-3 8M18 0l-3 8M30 3l-3 8M44 0l-3 8M58 2l-3 8M68 6l-3 8M12 14l-3 8M64 20l-3 8"/></g><path d="M0 40q18-6 36 0t36 0v12H0z" fill="#2d5a3d"/><ellipse cx="22" cy="44" rx="10" ry="2.5" fill="#4d6a55"/><g transform="translate(40 14) rotate(-15)"><ellipse cx="0" cy="8" rx="3" ry="8" fill="#1b1712"/><path d="M0 8 C-10 0 -16 2 -14 6 S-6 9 0 8M0 8C10 0 16 2 14 6S6 9 0 8" fill="#cfe3ee" opacity=".75"/><path d="M-2 12l-7 9M2 12l7 9M-2 9l-9 4M2 9l9 4M0 0l-1-6" stroke="#1b1712" stroke-width="1.2" fill="none"/><g fill="#f4f4f4"><circle cx="-1" cy="11" r=".9"/><circle cx="1" cy="14" r=".9"/></g></g></svg>`,
};

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
    art: ART.influenza,
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
