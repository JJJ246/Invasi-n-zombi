// Casos confirmados de dengue en la provincia de Manabí, 2024, por semana epidemiológica (SE 1 a SE 52).
// Fuente: Ministerio de Salud Pública del Ecuador, Gaceta de enfermedades vectoriales SE 52-2024,
// gráfico "Número de casos de dengue provincia de MANABÍ ... año 2024, SE 01 a SE 52" (serie roja).
// https://www.salud.gob.ec/wp-content/uploads/2025/01/Eventos-VECTORES-DNVE-SE-52.pdf
// Suma: 10.450 casos (la prensa reporta 10.572 al cierre del año; la diferencia son notificaciones tardías).
export const DENGUE_MANABI_2024 = Object.freeze({
  source: 'MSP Ecuador, Gaceta de enfermedades vectoriales SE 52-2024',
  url: 'https://www.salud.gob.ec/wp-content/uploads/2025/01/Eventos-VECTORES-DNVE-SE-52.pdf',
  population: 1592840, // Manabí, INEC Censo 2022
  weekly: [
    110, 124, 147, 139, 180, 166, 179, 199, 278, 277, 287, 323, 385, 446, 340, 308, 303, 420, 443, 372, 430, 466, 350, 350, 307, 276,
    266, 213, 276, 240, 203, 148, 184, 150, 123, 106, 93, 120, 80, 70, 48, 47, 70, 44, 40, 56, 47, 39, 38, 52, 53, 39,
  ],
});

// Plaga "efectiva" para el dengue: el motor contagia de persona a persona, así que el ciclo
// humano -> mosquito -> humano se representa con un período latente más largo:
// incubación en humanos (media 5,9 días; Chan y Johansson 2012) + incubación dentro del mosquito
// (2–15 días a 30 °C, misma fuente). Contagioso mientras dura la fiebre: 2–7 días (CDC).
export const DENGUE_PERIODS = Object.freeze({ latentMin: 8, latentMax: 14, infectiousMin: 3, infectiousMax: 7 });
