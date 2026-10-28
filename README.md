# Comité de Contención — simulador de brotes y plan de respuesta

**SpookyThon 2026 · Track B (La Plaga Zombie).** Una herramienta que simula cómo se propaga un brote en una ciudad real y encuentra **qué hacer, dónde y cuándo** (vacunas, cuarentenas, cierres y fumigación) con recursos limitados. Está hecha para **Manta**, como pide el reto, con tres brotes listos: la **plaga zombi**, una **gripe fuerte** y el **dengue de Manabí** calibrado con datos reales. Se adapta a otra ciudad o enfermedad cambiando datos, no código. Muestra con números cuánta gente se salva frente a **no hacer nada** y frente a **actuar al azar con los mismos recursos**.

- **App desplegada:** https://d3op4ankgl1i6w.cloudfront.net (región **us-east-1**, N. Virginia: la más barata y con todos los servicios que usamos)
- **Arquitectura:** [docs/arquitectura.svg](docs/arquitectura.svg) (fuente: [docs/arquitectura.mmd](docs/arquitectura.mmd))
- **Costos:** [docs/costos.md](docs/costos.md)
- **Resultados reproducibles de todos los escenarios:** [docs/resultados.md](docs/resultados.md)
- **Presentación del pitch:** [docs/pitch.pptx](docs/pitch.pptx) (PowerPoint, con notas del orador) y [docs/pitch.pdf](docs/pitch.pdf)
- **AWS Budget con alerta:** [docs/budget.png](docs/budget.png) _(captura de la consola)_

![Arquitectura](docs/arquitectura.svg)

---

## Resultados clave (200 simulaciones por escenario, semilla 2026)

| Escenario | Mordidos sin hacer nada | Al azar (mismos recursos) | Con la estrategia | Gana al azar en brotes que despegan |
|---|---|---|---|---|
| Base | 79.178 | 71.222 | **767** | 94 % |
| ×2 contagio | 206.172 | 198.179 | **109.259** | 89 % |
| Empieza en un colegio | 110.549 | 98.706 | **2.973** | 100 % |
| Vacuna cubre a medias | 79.178 | 71.057 | **293** | 94 % |
| Todo junto (×2 contagio, ½ vacunas, vacuna 30 %) | 206.172 | 203.223 | **165.641** | 67 % (pierde en 31 %) |

Tabla completa con rangos, política elegida y huella de cada escenario: [docs/resultados.md](docs/resultados.md).

## Qué hace

1. **Simula la propagación día a día** en una red de contactos sintética de la ciudad: hogares, colegios, trabajos, buses, mercados y barrios de cada una de las 5 parroquias urbanas de Manta.
2. **Aplica intervenciones con recursos limitados**: vacunas que llegan por día, cuarentena del hogar de cada caso reportado y cierre de mercados o colegios por parroquia, todo pagado con un presupuesto total.
3. **Compara la estrategia contra dos líneas base**: no intervenir, e intervenir **al azar con exactamente los mismos recursos** (mismas dosis por día, mismas cuarentenas, mismos bloques de cierre).
4. **Repite la simulación muchas veces** (Monte Carlo) y reporta **promedios y rangos** (percentiles 5 % y 95 %).
5. Tiene una **interfaz** para cambiar contagio, vacunas, presupuesto y punto de inicio, y **6 botones de "Brote Sorpresa"**.
6. Es **reproducible**: misma configuración + misma semilla = mismo resultado, en el navegador y en AWS (está probado en los tests).
7. Está **desplegada en AWS** (S3 + CloudFront + API Gateway + Lambda).
8. Genera un **informe para el alcalde** en lenguaje simple.
9. **La ciudad día a día:** mapa **real** de la ciudad (imagen satelital de Esri y límites oficiales de las zonas en OpenStreetMap) con 10.000 personas ubicadas donde de verdad hay edificios y calles, en tres paneles (no hacer nada / al azar / Comité) para el mismo brote, con cuarentenas, cierres y fumigaciones día a día. Se anima la corrida **mediana** de los brotes que despegan, no la más favorable.
10. **Calibración con datos reales:** el mismo motor, ajustado a los casos semanales de dengue en Manabí 2024 del Ministerio de Salud Pública (ver [docs/calibracion.md](docs/calibracion.md)). La plantilla "Dengue en Manabí" usa ese contagio, con brigadas de fumigación.
11. **"¿Qué cambió?"** tras cada Brote Sorpresa: antes y después, y la explicación en palabras de cómo cambió la recomendación.
12. **Conocer a un vecino:** detrás de cada punto del mapa hay una persona simulada: su casa, su rutina, qué le pasa en cada estrategia, quién la contagió y dónde, la cadena hasta el paciente cero y **por qué el plan la vacunó** (los nombres son ilustrativos; lo demás sale de la simulación).
13. **El barrio de cerca:** cada parroquia se dibuja como es (playa de pescadores, puerto atunero, centro, caleta) y se ven los vecinos de la simulación en su rutina: la casa, el bus, el colegio, el mercado y el trabajo, de día y de noche, con las mordidas, las vacunas, las cuarentenas y los cierres de ese día.
14. **¿Cómo se propagó?:** el árbol del contagio desde el paciente cero (quién, qué día y dónde) que crece día a día, sin plan y con el plan.
15. **Adaptable:** la ciudad y la enfermedad son datos. Ver "Adaptarlo a otra ciudad o enfermedad" más abajo.

## Cómo usarla

La página empieza con una historia corta que avanza con el scroll y termina sola en el simulador. Después, todo cabe en una sola ventana (en el celular, en una página que baja).

1. **Preparar:** elige el brote (plaga zombi, gripe fuerte o dengue), dónde empieza, qué tan contagioso es, cuántas vacunas llegan por día, cuánto protegen y el presupuesto. El resto está en "Ajustes avanzados".
2. Pulsa **Calcular el mejor plan** (100 simulaciones en el navegador, o en paralelo en AWS Lambda). Mientras calcula se ven los planes candidatos (21, o 33 con dengue porque se suma la fumigación) con su resultado; el mejor se marca en verde. Cada brote tiene su propia paleta y textos.
3. **El plan:** a la izquierda, cuántas personas se salvan, los pasos del plan con íconos y la prueba estadística contra las dos líneas base. A la derecha, cuatro vistas: **el barrio** (con el árbol del contagio al lado), **la ciudad** (los tres mapas), **la curva** (con la calibración) y el **informe para la alcaldía**.
4. **Brote sorpresa:** el doble de contagio, la mitad de las vacunas, empieza en otro mercado, una vacuna que protege a medias, 10 días tarde o la mitad del dinero. El plan **se recalcula solo** y muestra qué cambió.
5. Toca a un vecino del barrio o un punto del mapa para **conocer su historia**, o pulsa "Un vecino".

---

## El modelo

### La plaga
"Mordida zombi" inspirada en una **influenza fuerte**, contagiosa de persona a persona como describe el reto (casa, bus, colegio, mercado).

| Estado | Significado | ¿Lo ve el comité? |
|---|---|---|
| 🟢 Sano (S) | susceptible | — |
| 🟡 Mordido (E) | contagiado, aún no contagia | **No** (parece sano) |
| 🔴 Zombi (I) | contagia | Solo si se **reporta** (probabilidad diaria) |
| 🔵 Exorcizado (R) | recuperado o vacunado con éxito | Sí, si fue reportado o vacunado |

Modelo **SEIR estocástico basado en agentes** sobre un **grafo de contactos por capas**. Cada día, una persona sana o mordida recibe una "presión de contagio" de los zombis de cada lugar al que asiste:

```
presión(i) = zombis en su hogar
           + Σ capas  asistencia × contactos por día × zombis que asisten al lugar / (personas del lugar − 1)
P(mordida hoy) = 1 − e^(−q × presión)
```

`q` (probabilidad de contagio por contacto) se **calcula** para lograr el R0 elegido: `R0 ≈ q × días contagiosos × contactos efectivos promedio`. Así, el control "Contagio" de la interfaz es directamente el R0.

### Por qué es riguroso (y explicable en 30 segundos)
- **Números aleatorios comunes:** en cada corrida, las tres estrategias enfrentan **el mismo brote** (mismo paciente cero, mismas respuestas a la vacuna, mismo cumplimiento de cuarentena). La diferencia se debe a la estrategia, no a la suerte.
- **Muchas simulaciones**, con promedio y rango del 5 % al 95 %.
- **Veredicto con prueba estadística:** la interfaz dice ✅ o ❌ si la estrategia supera a cada línea base, con una **prueba de signos** sobre los brotes que despegan (si fuera igual de buena, ganar o perder cada brote sería como lanzar una moneda). Así, cuando el jurado elige su semilla, se ve al instante si ganar fue suerte.
- **Victorias medidas donde importa:** con un solo caso inicial, muchos brotes se apagan solos antes de que el comité actúe (como en la realidad). En esos casos todas las estrategias empatan; por eso el "% de victorias" se mide sobre los **brotes que despegan** y los empates se informan aparte.
- **Información imperfecta:** el comité solo ve los casos **reportados**; los mordidos son invisibles. La estrategia **nunca vacuna a un caso reportado** (test automático). Las dosis que caen en mordidos ocultos se cuentan y se muestran.
- **Determinismo total:** generador `xoshiro128**` sembrado con `splitmix32`, y una `e^(−x)` propia hecha solo con sumas y multiplicaciones (la `Math.exp` de JavaScript puede variar en el último bit entre navegadores).

---

## La estrategia del Comité

**Contención adaptativa, optimizada por simulación.** Cada día, con los casos reportados:

1. **Cuarentena:** aísla 7 días el hogar de cada caso reportado (la mayor parte del contagio ocurre en casa y los convivientes pueden estar mordidos sin que se note).
2. **Vacunas:** reparte las dosis del día por **puntaje = riesgo de ser mordido hoy × a cuántas personas podría morder después**. Solo vacuna a quien a la vista está sano.
3. **Cierres:** cierra el mercado o los colegios **solo de la parroquia** donde los casos reportados superan un umbral (más barato que cerrar toda la ciudad).

4. **Fumigación (solo si la plaga la transmite un mosquito, como el dengue):** envía brigadas a la parroquia donde los casos reportados superan un umbral; mientras dura, el contagio en esa parroquia baja a la mitad (**SUPUESTO**), también dentro de las casas.
5. **Reserva de presupuesto:** puede guardar parte del dinero (0 % o 50 %) para cuarentenas y cierres en vez de gastarlo todo en vacunas los primeros días. Lo descubrimos probando: gastar todo en vacunas al inicio deja sin dinero para aislar los casos que aparecen después, y el brote se escapa.

**Optimizador:** antes de recomendar, prueba **21 políticas candidatas** (33 cuando la plaga la transmite un mosquito, porque se suma la fumigación; 3 formas de priorizar vacunas × con o sin cierres × con o sin cuarentenas × reserva del 0 % o 50 %) en corridas de **entrenamiento con semillas distintas** a las de evaluación, y elige la que deja menos mordidos; si empatan, la más barata. Después la evalúa en corridas nuevas. Cuando el jurado cambia las condiciones (Brote Sorpresa), **la estrategia se vuelve a optimizar sola** y puede cambiar de política: por ejemplo, si todo empeora a la vez, prioriza a los más conectados de la ciudad en vez del entorno de los casos.

| Prioridad de vacunas | Qué hace |
|---|---|
| Anillo | entorno de los casos reportados, empezando por los más conectados |
| Mixta | mezcla el entorno de los casos con los más conectados de la ciudad |
| Más conectados | protege primero a quien tiene más contactos diarios, sin esperar a los casos |

---

## Supuestos y de dónde salen los números

Todos están en [src/engine/config.js](src/engine/config.js) y se pueden cambiar desde la interfaz o la API.

| Parámetro | Valor | Fuente / justificación |
|---|---|---|
| Población urbana de Manta | 258.697 | INEC, Censo 2022 (cantón: 271.145) — [Wikidata Q1990138](https://www.wikidata.org/wiki/Q1990138), [Manta (Ecuador)](https://es.wikipedia.org/wiki/Manta_(Ecuador)) |
| Parroquias urbanas | Manta, Tarqui, Los Esteros, Eloy Alfaro, San Mateo | [Cantón Manta](https://es.wikipedia.org/wiki/Cant%C3%B3n_Manta) |
| Personas por hogar | 3,3 | INEC, Censo 2022, Manabí — [resultados de Manabí](https://www.censoecuador.gob.ec/wp-content/uploads/2024/01/Info_Manabi.pdf) |
| Hogares unipersonales | 14,5 % | INEC, Censo 2022, Manabí (mismo documento) |
| R0 | 1,8 | Mediana de la pandemia de influenza de 1918 en [Biggerstaff et al. 2014, BMC Infect Dis 14:480](https://www.biomedcentral.com/1471-2334/14/480) (estacional: 1,28) |
| Días como mordido (incubación) | 1–3 (media 2) | Influenza: incubación de 1 a 4 días, media ≈ 2 (CDC) |
| Días como zombi (contagioso) | 4–6 (media 5) | Influenza: contagiosa ≈ 5–7 días desde el inicio (CDC) |
| Eficacia de la vacuna | 60 % | CDC: la vacuna de influenza reduce el riesgo 40–60 % en temporadas bien emparejadas |
| Agentes simulados | 10.000 | Cada agente representa 25,9 habitantes. Compromiso entre detalle y velocidad (100 simulaciones en ≈ 10 s en el navegador) |
| Estudiantes / trabajadores | 25 % / 40 % | **SUPUESTO** (pendiente de calibrar con la pirámide del Censo 2022) |
| Tamaño de aula / trabajo / ruta de bus | 30 / 10 / 40 | **SUPUESTO** |
| Uso de bus (de estudiantes y trabajadores) | 50 % | **SUPUESTO** |
| Contactos efectivos por día | colegio 10, trabajo 6, bus 4, mercado 3, barrio 1; hogar = todos los convivientes | **SUPUESTO** inspirado en los patrones por lugar de POLYMOD ([Mossong et al. 2008, PLoS Med](https://doi.org/10.1371/journal.pmed.0050074)) |
| Asistencia diaria | colegio y trabajo 71 % (5 de 7 días), bus 70 %, mercado 30 % | **SUPUESTO** |
| Movilidad de un zombi | 50 % de lo normal | **SUPUESTO** (los enfermos salen menos) |
| Reparto entre parroquias | uniforme | **SUPUESTO**: no encontramos el Censo 2022 desglosado por parroquia urbana |
| Probabilidad diaria de reportar un zombi | 50 % | **SUPUESTO** (≈ 1–2 días de demora) |
| Día en que el comité empieza a actuar | 10 | **SUPUESTO**: el brote se reconoce tarde |
| Día en que llegan las vacunas | 14 | **SUPUESTO** |
| Vacunas por día | 2.500 | **SUPUESTO** |
| Cumplimiento de la cuarentena | 80 % | **SUPUESTO** |
| Costo por dosis | USD 10 | **SUPUESTO** |
| Apoyo por hogar en cuarentena | USD 20 por día | **SUPUESTO** (canasta básica + ingresos perdidos) |
| Cierre de mercado o colegios de una parroquia | USD 6.000 por día | **SUPUESTO** |
| Presupuesto total | USD 300.000 | **SUPUESTO** |
| Umbral de cierre | mercado 0,3 %, colegios 0,5 % de casos reportados en la parroquia | **SUPUESTO** |
| Paciente cero | 1, en el mercado de Tarqui | El reto: "empezó con un solo caso" |
| Brigada de fumigación (modo dengue) | USD 3.000 por parroquia y día, 7 días, reduce el contagio 50 %, se activa con 0,2 % de casos reportados | **SUPUESTO** |
| Dengue: días como "mordido" | 8–14 | Incubación en humanos (media 5,9 días) + incubación dentro del mosquito (2–15 días a 30 °C): [Chan y Johansson 2012](https://doi.org/10.1371/journal.pone.0050972) |
| Dengue: días contagioso | 3–7 | Fiebre de 2 a 7 días (CDC) |
| Dengue: R0 efectivo | ver [docs/calibracion.md](docs/calibracion.md) | **Calibrado** con los casos semanales de Manabí 2024 (MSP) |
| Dengue: casos al inicio | 10 | **SUPUESTO**: el brote se detecta con varios casos (con uno solo casi siempre se apaga) |

### Otra ciudad en el motor: Guayaquil

La interfaz se centra en Manta, que es lo que pide el reto. El motor trae además **Guayaquil** como prueba de que se adapta a otra ciudad (lo cubren los tests y `node scripts/simulate.mjs '{"city":"guayaquil"}'`).

| Parámetro | Valor | Fuente / justificación |
|---|---|---|
| Población urbana de Guayaquil | 2.650.288 | INEC, Censo 2022 (cantón: 2.746.403 personas, 810.562 hogares) — [El Universo](https://www.eluniverso.com/guayaquil/comunidad/censo-ecuador-cifras-en-guayaquil-analisis-estadisticas-nota/) |
| Personas por hogar | 3,39 | 2.746.403 / 810.562 (mismo censo) |
| Zonas | Tarqui, Pascuales, Centro, Febres Cordero, Letamendi, García Moreno, Ximena | Parroquias urbanas en OpenStreetMap. "Centro" agrupa las 9 parroquias pequeñas del casco central; Ximena se arma con sus barrios en OSM; Chongón no se incluye |
| Reparto entre zonas | Tarqui 47 %, Ximena 24 %, Febres Cordero 15 %, Letamendi 4 %, Centro 4 %, Pascuales 3 %, García Moreno 2 % | Proporciones del Censo 2010 por parroquia (INEC), escaladas a la población de 2022 |
| Vacunas por día / presupuesto | 25.000 / USD 3.000.000 | **SUPUESTO**: los mismos recursos por habitante que en Manta |
| Cierre de una zona / fumigación | USD 30.000 / 15.000 por día | **SUPUESTO**: zonas unas 5 veces más grandes que las parroquias de Manta |

### Adaptarlo a otra ciudad o enfermedad

- **Otra enfermedad:** es una plantilla en [web/escenarios.js](web/escenarios.js) (contagio, días de incubación y de contagio, si la transmite un mosquito, vocabulario). También se cambia todo desde la interfaz.
- **Otra ciudad:** 1) agregar sus zonas (ids de relaciones administrativas de OpenStreetMap) en [scripts/build-map.py](scripts/build-map.py) y correr `python3 scripts/build-map.py <ciudad>`; 2) agregar su población, hogares y reparto entre zonas en [src/engine/cities.js](src/engine/cities.js). El motor, la estrategia, la interfaz y AWS no cambian.

## Parámetros por defecto y semilla (para reproducir)

- **Semilla:** `2026` · **Simulaciones:** `100` · **Días:** `120` · el resto, los valores de la tabla anterior.
- Desde la terminal (mismo motor que la web y Lambda):

```bash
npm test                                  # 23 tests: reproducibilidad, nunca vacunar casos reportados, presupuesto, otra ciudad...
node scripts/simulate.mjs                 # escenario por defecto
node scripts/simulate.mjs '{"r0":3.6,"seed":7,"runs":200}'
node scripts/scenarios.mjs 200            # regenera docs/resultados.md
python3 scripts/build-map.py manta       # regenera el mapa real (web/img/manta-satelite.jpg y src/engine/maps/manta.js)
python3 scripts/build-map.py guayaquil
```

La interfaz muestra la **huella de la configuración** (hash): si la huella y la semilla coinciden, el resultado es idéntico.

---

## Arquitectura en AWS

| Pieza | Servicio | ¿Pública? |
|---|---|---|
| Web estática | S3 (privado) + CloudFront con OAC | Sí, solo vía CloudFront y HTTPS |
| API | API Gateway HTTP, `POST /simulate`, límite 5 pet./s | Sí |
| Coordinador | Lambda `simulate` (Node.js 22, arm64): valida, optimiza, reparte y resume | No |
| Monte Carlo en paralelo | Lambda `batch` × 8 | No |
| Caché de resultados | S3 (privado, cifrado, expira a 30 días) | No |
| Monitoreo | CloudWatch Logs (7 días) + logs de acceso de la API | No |
| Control de costos | AWS Budgets con alerta por correo | No |

**Por qué así:** el motor es JavaScript sin dependencias, así que **el mismo código** corre en el navegador (respuesta inmediata en la demo) y en Lambda (miles de simulaciones en paralelo), y los tests comprueban que dan exactamente lo mismo. Todo es serverless: costo casi cero cuando no se usa.

**Seguridad básica:** sin llaves en el código ni en el repositorio; IAM de **mínimo privilegio** (la Lambda `simulate` solo puede leer y escribir `results/*` e invocar a `batch`; `batch` no tiene permisos extra); buckets cifrados y con acceso público bloqueado; solo HTTPS; límite de peticiones en la API; **Checkov** revisa la infraestructura en cada push (24 controles aprobados, 0 fallidos; las omisiones están justificadas en la plantilla).

## Cómo desplegarlo

Requisitos: cuenta de AWS, [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) y [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) configurados con tus credenciales (`aws configure`), Node.js 20+.

```bash
npm ci
ALERT_EMAIL=tu@correo.com ./scripts/deploy.sh
```

El script corre los tests, despliega `infra/template.yaml` con SAM (incluido el **AWS Budget con alerta**), arma la web con la URL de la API y la sube a S3, e invalida la caché de CloudFront. Al final imprime la URL de la web y de la API.

Para probar en local sin AWS: `npm run dev` y abre http://localhost:8765.

## Mapa del código

Cada carpeta tiene su propio README con una línea por archivo.

```
README.md            este archivo
web/                 la página (HTML, CSS y JavaScript sin frameworks)   → web/README.md
  index.html           historia + "Preparar" + "El plan"
  app.js               archivo principal: une todo
  historia.js          la película del principio (scroll)
  escenarios.js        los tres brotes y sus textos
  barrio.js / zonas.js el barrio estilo Sims y cómo es cada parroquia
  mapa-ciudad.js       los tres mapas de la ciudad día a día
  arbol-contagio.js    ¿cómo se propagó? desde el paciente cero
  ficha-vecino.js      la ficha de cada persona
  worker.js            corre el motor sin congelar la página
  img/                 imágenes y video                                  → web/img/README.md
src/
  engine/              el motor de la simulación (navegador, Lambda y tests)  → src/README.md
  lambda/              las funciones de AWS Lambda
infra/template.yaml  infraestructura en AWS (SAM)                        → infra/README.md
scripts/             armar, desplegar, simular y calibrar desde la terminal → scripts/README.md
tests/               pruebas automáticas (npm test)                      → tests/README.md
docs/                arquitectura, costos, resultados, calibración, créditos → docs/README.md
```

## Seguridad

- Sin llaves ni contraseñas en el código ni en el repositorio.
- IAM de mínimo privilegio, buckets privados y cifrados, solo HTTPS y límite de peticiones en la API.
- CloudFront agrega las cabeceras de seguridad administradas por AWS (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- La página declara una política de contenido (CSP): solo carga scripts propios, más GSAP y Chart.js desde cdnjs, cada uno con su huella de integridad (SRI). Las dos librerías cargan en paralelo y la página funciona aunque no lleguen (sin animación de letras o sin gráfica). El botón "Calcular" se activa recién cuando el código está listo, para que el formulario nunca se envíe solo.
- Todo texto que viene de la simulación se escapa antes de mostrarse.
- La API y la página validan cada dato (rangos, mínimos y máximos) y responden con un mensaje claro.

## Cómo lo verificamos

- `npm test`: 23 pruebas del motor y de la API.
- Revisión en un navegador sin pantalla (Brave en modo headless) antes de cada entrega: la página cabe en una ventana, el barrio va a 60 cuadros por segundo, cero errores en la consola, clics en cada persona, casa, colegio, bus y mapa, datos fuera de rango, doble clic en "Calcular" y Brote Sorpresa mientras calcula.

## Limitaciones conocidas

- La población es **sintética**: respeta el tamaño de Manta y de sus hogares (Censo 2022), pero la estructura por edad, los colegios, los trabajos y las rutas de bus son supuestos. No hay calibración con brotes reales de Manta.
- Las parroquias tienen el mismo tamaño (no encontramos el desglose del Censo 2022 por parroquia urbana).
- No modela muertes, hospitalización ni saturación hospitalaria; el objetivo es minimizar las personas mordidas.
- La vacuna protege desde el día en que se aplica (no modelamos el tiempo hasta generar defensas).
- Las políticas candidatas son 21; un optimizador más fino (por ejemplo, umbrales y reservas continuos) podría encontrar algo mejor.
- En el peor escenario combinado (×2 contagio, ½ vacunas y vacuna al 30 %) la estrategia sigue salvando gente en promedio, pero pierde contra el azar en cerca de 3 de cada 10 brotes: con tan pocos recursos frente a una plaga tan contagiosa, ninguna estrategia controla el brote (ver [docs/resultados.md](docs/resultados.md)).
- Los promedios de la estrategia los dominan pocos brotes que se escapan (por eso el promedio puede ser mayor que el percentil 95); por eso mostramos siempre promedio y rango.
- Cada agente representa ≈ 26 personas: los números muy pequeños (por ejemplo, decenas de casos) tienen poca resolución.
- Los costos de intervenciones son supuestos razonables, no precios oficiales del Ministerio de Salud.

## Uso de IA

Usamos asistentes de IA para programar. Todo el código fue revisado y el equipo puede explicar cada parte; los tests (`npm test`) verifican las propiedades clave.

## Licencia

MIT
