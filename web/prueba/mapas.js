// Los cinco barrios de prueba (pintados con Higgsfield) y sus destinos.
// Cada punto está en porcentaje de la imagen: [x, y]. "lugares" son los destinos de los paseos (casa, mercado,
// colegio, parada…). Por dónde se camina no se marca a mano: sale de la máscara img/prueba/paso_<barrio>.png.

export const MAPAS = {
  tarqui: {
    nombre: 'Tarqui',
    puntos: {
      a1: [37, 97], a2: [45, 89], a3: [53, 81], a4: [60, 74], parada: [67, 66], a6: [74, 61], a7: [80, 56], a8: [87, 51], casas: [94, 48],
      b1: [79, 47], colegio: [73, 41], m1: [55, 66], mercado: [45, 61], puestos: [37, 58],
      playa1: [12, 47], playa2: [24, 42], playa3: [36, 35], muelle: [45, 30],
    },
    lugares: ['a1', 'casas', 'parada', 'colegio', 'mercado', 'puestos', 'playa1', 'muelle'],
  },
  centro: {
    nombre: 'Manta centro',
    puntos: {
      a1: [8, 46], a2: [22, 52], a3: [36, 58], parada: [50, 64], a5: [63, 70], a6: [76, 77], a7: [88, 84],
      p1: [38, 48], fuente: [47, 48], p3: [55, 53], p4: [50, 40], iglesia: [58, 38], calle: [66, 57], colegio: [75, 60],
      n1: [28, 40], edificios: [36, 33],
    },
    lugares: ['a1', 'parada', 'fuente', 'iglesia', 'colegio', 'edificios', 'a7'],
  },
  esteros: {
    nombre: 'Los Esteros',
    puntos: {
      r1: [12, 46], r2: [24, 53], r3: [34, 60], r4: [44, 69], r5: [54, 79], palafitos: [18, 60],
      c1: [47, 52], c2: [58, 46], c3: [68, 40], c4: [80, 34], f1: [38, 44], fabrica: [24, 30], plaza: [48, 34], astillero: [64, 27],
      mercado: [56, 66], colegio: [72, 52], d1: [66, 62], d2: [77, 73], casas: [86, 80],
    },
    lugares: ['palafitos', 'fabrica', 'plaza', 'astillero', 'mercado', 'colegio', 'casas', 'r5'],
  },
  sanmateo: {
    nombre: 'San Mateo',
    puntos: {
      c1: [36, 32], c2: [50, 38], c3: [62, 44], cruce: [71, 50], c5: [83, 57], c6: [94, 63], parada: [73, 44], u1: [81, 40], casas: [88, 34],
      plaza: [62, 31], colegio: [50, 22], s1: [42, 27], mercado: [47, 50], playa1: [33, 52], playa2: [20, 42], muelle: [15, 58], m1: [64, 63], mirador: [75, 72],
    },
    lugares: ['casas', 'parada', 'plaza', 'colegio', 'mercado', 'playa2', 'muelle', 'mirador', 'c6'],
  },
  eloy: {
    nombre: 'Eloy Alfaro',
    puntos: {
      b1: [6, 62], tienda: [20, 66], b3: [30, 72], b4: [40, 80], b5: [50, 90], casasIzq: [15, 47],
      g1: [27, 55], plaza: [33, 48], iglesia: [45, 38], b6: [36, 61], b7: [48, 70], b8: [60, 79], b9: [70, 87],
      q1: [52, 52], q2: [60, 45], colegio: [69, 42], escalera: [70, 62],
    },
    lugares: ['b1', 'tienda', 'casasIzq', 'plaza', 'iglesia', 'colegio', 'b5', 'b9'],
  },
};
