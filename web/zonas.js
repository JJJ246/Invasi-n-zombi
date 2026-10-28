// Cómo se ve cada zona (parroquia) en "El barrio, de cerca". Cada una se dibuja distinta según cómo es
// de verdad: playa de pescadores, puerto atunero, centro con edificios, ciudadela, casas sobre el estero…
// Basado en descripciones públicas de cada parroquia (prensa local, municipio, guías). Es un dibujo
// esquemático: da la idea del lugar, no es un plano.

const PALETTES = {
  coloridas: ['#e9b872', '#d98b74', '#8fbcd4', '#a8cf94', '#efe0a8', '#c8a6dc', '#f2a65a', '#e4c1c1', '#7fc8b8'],
  bloque: ['#a9a39a', '#b5afa5', '#9c968d', '#c2b8a8', '#d8c9a8', '#8fbcd4', '#e9b872'],
  cana: ['#b08a55', '#a17a48', '#c09a62', '#9c7a50', '#a9a39a'],
  ciudadela: ['#f3efe6', '#efe3c8', '#e8d6c0', '#dfe7ec', '#f1dcc9', '#e3ead8'],
  centro: ['#e6e1d6', '#cfd6dd', '#d8c7b0', '#bfc9d1', '#e9d9b8', '#c9c2b6'],
};

// ground: color del suelo · road: asfalto o tierra · water: mar, río o estero en el borde (o nada)
// houses: colores, techos (losa, zinc, teja), pisos · work/market/school: lugares del barrio
// plaza: parque, iglesia o cancha · trees: palmeras o árboles y cuántos
// layout: qué va en el centro del barrio · roads: dónde pasan las calles · mirror: visto desde el otro lado
export const LOOKS = {
  manta: {
    Tarqui: {
      blurb: 'playa de pescadores, mercado de mariscos y astillero',
      layout: 'mercado', roads: [10, 20],
      ground: 'seco', road: 'asfalto', water: 'mar', beach: true, boats: 'pesca',
      houses: { colors: PALETTES.coloridas, roofs: ['losa', 'losa', 'zinc'], stories: [1, 2] },
      work: { kind: 'astillero', label: 'Astillero' }, market: 'Mercado de mariscos', school: 'Escuela', plaza: 'cancha',
      trees: { kind: 'palma', amount: 0.6 },
    },
    Manta: {
      blurb: 'centro: edificios, iglesia, bancos y el malecón',
      layout: 'plaza', roads: [11, 21], mirror: true,
      ground: 'urbano', road: 'asfalto', water: 'mar', beach: true, boats: 'yates',
      houses: { colors: PALETTES.centro, roofs: ['losa'], stories: [2, 4] },
      work: { kind: 'oficinas', label: 'Oficinas y bancos' }, market: 'Mercado central', school: 'Colegio', plaza: 'iglesia',
      trees: { kind: 'palma', amount: 0.35 },
    },
    'Los Esteros': {
      blurb: 'barrio popular junto al puerto y las atuneras',
      layout: 'trabajo', roads: [9, 19],
      ground: 'tierra', road: 'asfalto', water: 'mar', beach: false, boats: 'atuneros',
      houses: { colors: PALETTES.bloque, roofs: ['zinc', 'losa'], stories: [1, 2] },
      work: { kind: 'atunera', label: 'Atunera' }, market: 'Mercado', school: 'Escuela', plaza: 'cancha',
      trees: { kind: 'palma', amount: 0.2 },
    },
    'San Mateo': {
      blurb: 'caleta de pescadores, arena y laboratorios de larvas',
      layout: 'escuela', roads: [10, 21], mirror: true,
      ground: 'arena', road: 'tierra', water: 'mar', beach: true, boats: 'pesca',
      houses: { colors: PALETTES.coloridas, roofs: ['zinc', 'teja'], stories: [1, 1] },
      work: { kind: 'laboratorio', label: 'Laboratorio de larvas' }, market: 'Puesto de pescado', school: 'Escuela', plaza: 'cancha',
      trees: { kind: 'palma', amount: 0.9 },
    },
    'Eloy Alfaro': {
      blurb: 'barrios de casas de bloque, calles de tierra y fábricas',
      layout: 'trabajo', roads: [11, 20], mirror: true,
      ground: 'seco', road: 'tierra', water: null,
      houses: { colors: PALETTES.bloque, roofs: ['zinc', 'losa'], stories: [1, 2] },
      work: { kind: 'fabrica', label: 'Fábrica' }, market: 'Mercado', school: 'Colegio', plaza: 'cancha',
      trees: { kind: 'arbol', amount: 0.3 },
    },
  },
  guayaquil: {
    Tarqui: {
      blurb: 'ciudadelas del norte (Urdesa, Alborada, Sauces): casas de dos pisos y avenidas con árboles',
      layout: 'plaza', roads: [10, 20],
      ground: 'verde', road: 'asfalto', water: 'estero',
      houses: { colors: PALETTES.ciudadela, roofs: ['teja', 'teja', 'losa'], stories: [2, 2] },
      work: { kind: 'mall', label: 'Centro comercial' }, market: 'Mercado', school: 'Colegio', plaza: 'parque',
      trees: { kind: 'arbol', amount: 0.8 },
    },
    Pascuales: {
      blurb: 'borde de la ciudad: bodegas, polvo y casas de bloque',
      layout: 'trabajo', roads: [9, 20], mirror: true,
      ground: 'tierra', road: 'tierra', water: null,
      houses: { colors: PALETTES.bloque, roofs: ['zinc'], stories: [1, 2] },
      work: { kind: 'bodegas', label: 'Bodegas' }, market: 'Mercado', school: 'Escuela', plaza: 'cancha',
      trees: { kind: 'arbol', amount: 0.2 },
    },
    Centro: {
      blurb: 'edificios altos, iglesias y el Malecón junto al río Guayas',
      layout: 'plaza', roads: [11, 20], mirror: true,
      ground: 'urbano', road: 'asfalto', water: 'rio', beach: false, boats: 'yates',
      houses: { colors: PALETTES.centro, roofs: ['losa'], stories: [3, 6] },
      work: { kind: 'oficinas', label: 'Oficinas' }, market: 'Comercios de la Bahía', school: 'Colegio', plaza: 'iglesia',
      trees: { kind: 'arbol', amount: 0.4 },
    },
    'Febres Cordero': {
      blurb: 'suburbio oeste: casas de bloque de dos pisos y el estero Salado',
      layout: 'mercado', roads: [9, 19], mirror: true,
      ground: 'tierra', road: 'asfalto', water: 'estero', palafitos: 0.4,
      houses: { colors: PALETTES.bloque, roofs: ['losa', 'zinc'], stories: [1, 2] },
      work: { kind: 'taller', label: 'Talleres' }, market: 'Mercado', school: 'Escuela', plaza: 'cancha',
      trees: { kind: 'arbol', amount: 0.25 },
    },
    Letamendi: {
      blurb: 'sur popular: casas pintadas, comercio de barrio y el estero',
      layout: 'escuela', roads: [10, 20],
      ground: 'tierra', road: 'asfalto', water: 'estero',
      houses: { colors: PALETTES.coloridas, roofs: ['losa', 'zinc'], stories: [1, 2] },
      work: { kind: 'fabrica', label: 'Fábrica' }, market: 'Mercado', school: 'Colegio', plaza: 'parque',
      trees: { kind: 'arbol', amount: 0.35 },
    },
    'García Moreno': {
      blurb: 'centro-sur: casas de dos y tres pisos con comercio abajo',
      layout: 'mercado', roads: [11, 21],
      ground: 'urbano', road: 'asfalto', water: null,
      houses: { colors: PALETTES.centro, roofs: ['losa'], stories: [2, 3] },
      work: { kind: 'taller', label: 'Comercios y talleres' }, market: 'Mercado', school: 'Colegio', plaza: 'iglesia',
      trees: { kind: 'arbol', amount: 0.3 },
    },
    Ximena: {
      blurb: 'Guasmo e Isla Trinitaria: casas de caña y bloque, muchas sobre el estero',
      layout: 'trabajo', roads: [10, 20],
      ground: 'tierra', road: 'tierra', water: 'estero', palafitos: 1,
      houses: { colors: PALETTES.cana, roofs: ['zinc'], stories: [1, 2], cana: 0.6 },
      work: { kind: 'puerto', label: 'Puerto marítimo' }, market: 'Mercado', school: 'Escuela', plaza: 'cancha',
      trees: { kind: 'arbol', amount: 0.25 },
    },
  },
};

const FALLBACK = LOOKS.manta.Tarqui;
export const lookOf = (city, zone) => LOOKS[city]?.[zone] ?? FALLBACK;
