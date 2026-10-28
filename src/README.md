# src/ — el motor y AWS Lambda

El mismo código corre en el navegador, en AWS Lambda y en los tests. Por eso, con la misma semilla, da el mismo resultado en los tres.

## src/engine/ — la simulación

| Archivo | Qué hace |
|---|---|
| `index.js` | Punto de entrada: exporta lo que usan la página, Lambda y los tests. |
| `config.js` | Parámetros del escenario, valores por defecto y sus límites. |
| `cities.js` | Las ciudades (Manta y Guayaquil): población, zonas y cómo se reparte la gente. |
| `population.js` | Arma la red de contactos: hogar, colegio, trabajo, bus, mercado y barrio. |
| `model.js` | Simula un brote día a día (modelo SEIR por personas) con las decisiones del Comité. |
| `montecarlo.js` | Repite la simulación muchas veces, prueba los 21 planes y elige el mejor. |
| `report.js` | Escribe el informe para la alcaldía en lenguaje simple. |
| `layout.js` | Ubica a cada persona sobre el mapa real para la animación. |
| `rng.js` | Números aleatorios con semilla (iguales en cualquier navegador). |
| `calibration.js` | Resultado del ajuste con los casos reales de dengue (lo genera `scripts/calibrate.mjs`). |
| `dengue-manabi-2024.js` | Casos semanales de dengue en Manabí 2024 (Ministerio de Salud Pública). |
| `maps/` | Límites de las zonas de Manta y Guayaquil (OpenStreetMap). |

## src/lambda/ — la nube

| Archivo | Qué hace |
|---|---|
| `simulate.mjs` | Recibe la consulta por la API, valida, optimiza y reparte las simulaciones entre 8 Lambdas. |
| `batch.mjs` | Corre un lote de simulaciones y devuelve sus resultados. |
