# scripts/ — herramientas de la terminal

| Archivo | Para qué |
|---|---|
| `build-web.mjs` | Arma `dist/` (la página lista para publicar) juntando `web/` y el motor. |
| `deploy.sh` | Corre los tests, despliega en AWS con SAM y sube la página. |
| `simulate.mjs` | Corre una simulación desde la terminal: `node scripts/simulate.mjs '{"seed":7}'`. |
| `scenarios.mjs` | Regenera la tabla de resultados de `docs/resultados.md`. |
| `calibrate.mjs` | Ajusta el motor a los casos reales de dengue y escribe `src/engine/calibration.js`. |
| `build-map.py` | Descarga los límites de las zonas (OpenStreetMap) y la imagen satelital de una ciudad. |
