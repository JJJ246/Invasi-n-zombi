# Resultados reproducibles

Generado con `node scripts/scenarios.mjs 200`: 200 simulaciones por escenario, semilla 2026.
Las cifras son **personas de Manta** (población urbana 258.697; cada agente representa 26 personas).
Cualquiera puede repetir una fila: misma configuración + misma semilla = mismo resultado (la huella identifica la configuración).

- **Mordidos**: promedio de personas que llegan a ser mordidas en 120 días.
- **Salvados**: diferencia pareada en la misma corrida (misma semilla) — promedio y rango del 5 % al 95 %.
- **Gana / pierde vs azar**: proporción de brotes que despegan (sin intervención muerden a ≥ 1 % de la población) en que la estrategia deja menos (o más) mordidos que repartir los mismos recursos al azar. Entre paréntesis, cuántos de los 200 brotes despegaron; el resto se apaga solo antes de que el comité actúe y ahí todas las estrategias empatan.

| Escenario | Mordidos sin hacer nada | Mordidos al azar | Mordidos con la estrategia | Salvados vs nada | Salvados vs azar | Gana / pierde vs azar (brotes) | Política elegida | Huella |
|---|---|---|---|---|---|---|---|---|
| Base (valores por defecto) | 79.178 | 71.222 | **767** | 78.411 (0–150.635) | 70.455 (0–140.132) | 94 % / 3 % (114) | anillo + cuarentenas + cierres + reserva 50 % | `d0baaeab` |
| ×2 contagio (R0 3,6) | 206.172 | 198.179 | **109.259** | 96.913 (0–234.691) | 88.920 (-648–224.059) | 89 % / 11 % (176) | mixta + cuarentenas + reserva 50 % | `50a12417` |
| ½ vacunas (1.250 por día) | 79.178 | 69.212 | **239** | 78.939 (0–151.042) | 68.973 (0–143.057) | 96 % / 4 % (114) | anillo + cuarentenas + reserva 50 % | `4811a004` |
| Empieza en el mercado de Manta | 72.525 | 56.269 | **3.441** | 69.084 (0–151.928) | 52.828 (0–131.687) | 96 % / 2 % (104) | anillo + cuarentenas | `96a1bcc4` |
| Empieza en un colegio | 110.549 | 98.706 | **2.973** | 107.576 (0–152.841) | 95.732 (0–139.095) | 100 % / 0 % (158) | anillo + cuarentenas + cierres + reserva 50 % | `d54694f2` |
| Vacuna cubre a medias (30 %) | 79.178 | 71.057 | **293** | 78.885 (0–150.919) | 70.764 (0–144.795) | 94 % / 4 % (114) | anillo + cuarentenas + reserva 50 % | `1ba6ab9c` |
| Respuesta 10 días más tarde | 79.178 | 71.209 | **4.522** | 74.656 (0–149.378) | 66.687 (0–135.247) | 100 % / 0 % (114) | mixta + cuarentenas + reserva 50 % | `79fdb9b5` |
| ½ presupuesto (USD 150.000) | 79.178 | 74.851 | **3.205** | 75.973 (0–150.489) | 71.646 (0–145.654) | 96 % / 4 % (114) | anillo + cuarentenas + reserva 50 % | `e0a4e83e` |
| Todo junto: ×2 contagio, ½ vacunas, vacuna 30 % | 206.172 | 203.223 | **165.641** | 40.531 (0–233.915) | 37.582 (-1.658–229.133) | 67 % / 31 % (176) | más conectados + cuarentenas + reserva 50 % | `f616ec4f` |
