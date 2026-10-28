# Créditos de imágenes

## Fotos reales (Wikimedia Commons)
- **Playa Murciélago, Manta** (tarjeta de la parroquia Manta): [Ecuador Manta beach restaurants.jpg](https://commons.wikimedia.org/wiki/File:Ecuador_Manta_beach_restaurants.jpg), por Cayambe, CC BY-SA 3.0.
- **Puerto de Manta** (tarjeta de Los Esteros): [2022-10-04 01 Tugboat, TIGRE - IMO 9121479, in Manta, Ecuador.jpg](https://commons.wikimedia.org/wiki/File:2022-10-04_01_Tugboat,_TIGRE_-_IMO_9121479,_in_Manta,_Ecuador.jpg), por Gordon Leggett, CC BY-SA 4.0.

Ambas se redujeron de tamaño y se convirtieron a WebP.

## Generadas con IA (Higgsfield, GPT Image 2.5)
- `web/img/barrio/`: las piezas del barrio (casas, puesto del mercado, colegio, iglesia, atunera, astillero, laboratorio, fábrica y oficinas), en perspectiva isométrica y fondo transparente. Las indicaciones describen cómo son de verdad las casas de Manta: bloque pintado, techo de zinc o losa con tanque azul, rejas, casas de caña sobre pilotes.
- `web/img/ilustraciones/`: las ilustraciones de los escenarios, del Brote Sorpresa y de las parroquias que no tienen una foto libre (Tarqui, San Mateo y Eloy Alfaro).
- `web/film/`: la película de la portada.

## La historia y las transiciones (Higgsfield)
- `web/img/historia/`: las 8 escenas de la historia (GPT Image 2.5, 2K). El movimiento (cámara lenta, fundidos, lluvia, niebla, relámpagos, grano y la entrada a la pantalla del Comité) es un render propio en `web/historia.js`.
- `web/img/zombi.mp4`: el zombi que se lanza contra la cámara al calcular (Seedance 2.5, 1080p, recortado a 2 segundos).
- `web/img/suelo/`: texturas del suelo del barrio (asfalto, arena, mar, tierra, vereda y suelo seco).
- `web/img/barrio/`: además de los edificios, los contenedores, la panga, la palmera y los restos del apocalipsis (auto quemado, barricada, basura y barril con fuego), que aparecen según cuántos zombis hay.

## Pantalla de carga (Higgsfield, GPT Image 2.5)
- `web/img/carga/`: zombi, bus de Manta y mosquito Aedes con fondo transparente, y la calle del dengue. El personaje avanza lo mismo que el cálculo y al final hace su remate (`web/app.js`, `setProgress` y `finale`).

## Librerías
- [GSAP 3.13](https://gsap.com/) (licencia estándar de GSAP, uso gratuito): animación letra por letra de los textos de la historia.
- [Chart.js 4.4](https://www.chartjs.org/) (MIT): curvas y calibración.

## Película de la portada (Higgsfield)
- `web/pelicula/`: 7 tomas generadas con Higgsfield (27-oct) y mejoradas a 2K con Bytedance Video Upscale; 420 cuadros en dos calidades.

## Halloween y prototipo del barrio (Higgsfield)
- `web/img/halloween/`: patrón, calabaza, murciélagos, telaraña y velas (GPT Image 2.5).
- `web/img/prueba/`: cinco barrios de Manta y sus máscaras de calles (GPT Image 2.5), seis vecinos, zombi, dengue y vacunado; ciclos de caminata con Kling 3.0 Turbo sobre fondo verde; video del mosquito (Kling 3.0 Turbo).
