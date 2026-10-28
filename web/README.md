# web/ — la página

Todo lo que ve la persona. No usa frameworks: HTML, CSS y JavaScript con módulos. Chart.js llega por CDN para las gráficas.

| Archivo | Qué hace |
|---|---|
| `index.html` | La página: la historia, la pantalla "Preparar" y la pantalla "El plan". |
| `styles.css` | Todos los estilos. Arriba están los colores de cada brote (zombi, gripe, dengue). |
| `app.js` | Archivo principal: une todo, lee el formulario, lanza el cálculo y muestra el resultado. |
| `historia.js` | La película del principio: 8 imágenes que avanzan con el scroll y terminan en el simulador. |
| `escenarios.js` | Los tres brotes (zombi, gripe fuerte, dengue): enfermedad, textos e imagen de cada uno. |
| `barrio.js` | "El barrio": la vista estilo Sims con casas, personas, bus, día y noche. |
| `zonas.js` | Cómo es cada parroquia de Manta en el barrio (mar, puerto, tipo de casas, calles). |
| `mapa-ciudad.js` | "La ciudad": los tres mapas satelitales de Manta y el control de reproducción por días. |
| `arbol-contagio.js` | "¿Cómo se propagó?": el árbol desde el paciente cero. |
| `ficha-vecino.js` | La ficha de una persona: rutina, qué le pasa en cada decisión y quién la contagió. |
| `worker.js` | Corre el motor en segundo plano para que la página no se congele. |
| `config.js` | La dirección de la API en AWS. Vacía = todo corre en el navegador. |
| `portada.html` | Redirige a `index.html` (la historia ahora está al principio del simulador). |

El motor de la simulación no está aquí: está en `../src/engine` y `scripts/build-web.mjs` lo copia a `dist/engine` al armar la página.

`img/` tiene las imágenes; ver `img/README.md`.
