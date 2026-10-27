# Calibración con datos reales: dengue en Manabí 2024

**Datos:** casos confirmados de dengue por semana epidemiológica en Manabí, 2024 (SE 1–52), del
[Ministerio de Salud Pública, Gaceta de enfermedades vectoriales SE 52-2024](https://www.salud.gob.ec/wp-content/uploads/2025/01/Eventos-VECTORES-DNVE-SE-52.pdf).
Total: 10.450 casos. Población: 1.592.840 (INEC, Censo 2022).

**Qué se ajustó**, usando el mismo motor de la aplicación, sin intervenciones (la línea "no hacer nada"):

| Parámetro | Rango probado | Mejor valor |
|---|---|---|
| R0 efectivo | 1 – 2.6 (paso 0,05) | **1.6** |
| Casos iniciales (agentes) | 10, 20, 40, 80, 160 | **40** |
| Fracción de infecciones que se reporta | 0 – 1 (mínimos cuadrados) | **1.27 %** |

Ajuste: **R² = 0.873** sobre las 52 semanas (12 simulaciones por punto de la grilla, semilla 2026).

**Cómo se usa:** el botón "Dengue Manabí 2024 (calibrado)" de la interfaz carga este R0 y estos períodos y los aplica a la ciudad de Manta.

## Supuestos y límites (para decirlos antes de que los pregunte el jurado)
- El motor contagia de persona a persona. El ciclo humano → mosquito → humano se representa con un período
  latente efectivo de 8–14 días: incubación en humanos (media 5,9 días) más incubación
  dentro del mosquito (2–15 días a 30 °C), según [Chan y Johansson 2012](https://doi.org/10.1371/journal.pone.0050972).
  Contagioso 3–7 días (fiebre de 2 a 7 días, CDC).
- No modela la estación de lluvias: parte de la caída de la curva real después de la semana 22 se debe al clima,
  y el modelo la explica solo con el agotamiento de susceptibles. Por eso el ajuste es aproximado.
- La fracción reportada absorbe infecciones asintomáticas y subregistro; no es una tasa clínica.
- Es una calibración de la forma de la curva a nivel provincial; no hay datos semanales públicos de Manta sola.

## Datos y modelo por semana

| Semana | Casos reales (MSP) | Modelo calibrado (casos reportados) |
|---|---|---|
| 1 | 110 | 121 |
| 2 | 124 | 38 |
| 3 | 147 | 121 |
| 4 | 139 | 74 |
| 5 | 180 | 134 |
| 6 | 166 | 107 |
| 7 | 179 | 169 |
| 8 | 199 | 155 |
| 9 | 278 | 206 |
| 10 | 277 | 212 |
| 11 | 287 | 251 |
| 12 | 323 | 269 |
| 13 | 385 | 302 |
| 14 | 446 | 320 |
| 15 | 340 | 356 |
| 16 | 308 | 378 |
| 17 | 303 | 398 |
| 18 | 420 | 406 |
| 19 | 443 | 427 |
| 20 | 372 | 426 |
| 21 | 430 | 413 |
| 22 | 466 | 430 |
| 23 | 350 | 391 |
| 24 | 350 | 399 |
| 25 | 307 | 361 |
| 26 | 276 | 338 |
| 27 | 266 | 317 |
| 28 | 213 | 290 |
| 29 | 276 | 256 |
| 30 | 240 | 231 |
| 31 | 203 | 199 |
| 32 | 148 | 187 |
| 33 | 184 | 149 |
| 34 | 150 | 140 |
| 35 | 123 | 100 |
| 36 | 106 | 103 |
| 37 | 93 | 74 |
| 38 | 120 | 75 |
| 39 | 80 | 53 |
| 40 | 70 | 53 |
| 41 | 48 | 42 |
| 42 | 47 | 32 |
| 43 | 70 | 28 |
| 44 | 44 | 27 |
| 45 | 40 | 25 |
| 46 | 56 | 25 |
| 47 | 47 | 17 |
| 48 | 39 | 18 |
| 49 | 38 | 14 |
| 50 | 52 | 12 |
| 51 | 53 | 12 |
| 52 | 39 | 9 |
