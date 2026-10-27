// Ciudades que el motor sabe simular. Para agregar otra: generar su mapa con scripts/build-map.py y sumar
// una entrada aquí con sus zonas (en el mismo orden que el mapa), su población y cómo se reparte.
import { MAP as MANTA_MAP, SHAPES as MANTA_SHAPES } from './maps/manta.js';
import { MAP as GYE_MAP, SHAPES as GYE_SHAPES } from './maps/guayaquil.js';

export const CITIES = {
  manta: {
    name: 'Manta',
    province: 'Manabí',
    zones: ['Manta', 'Tarqui', 'Los Esteros', 'Eloy Alfaro', 'San Mateo'],
    // null = reparto uniforme de hogares entre zonas (SUPUESTO documentado en el README; no hay datos por parroquia).
    zoneShare: null,
    defaults: {
      realPopulation: 258697, // INEC, Censo 2022: población urbana de Manta
      householdMean: 3.3, // INEC, Censo 2022: personas por hogar en Manabí
      singleHouseholdShare: 0.145,
      start: 'mercado:Tarqui',
    },
    map: MANTA_MAP,
    shapes: MANTA_SHAPES,
    water: { text: 'Océano Pacífico', x: 0.03, y: 0.09 },
  },
  guayaquil: {
    name: 'Guayaquil',
    province: 'Guayas',
    zones: ['Tarqui', 'Pascuales', 'Centro', 'Febres Cordero', 'Letamendi', 'García Moreno', 'Ximena'],
    // Proporciones del Censo 2010 por parroquia urbana (INEC); "Centro" suma las 9 parroquias del casco central
    // (Ayacucho, Bolívar, Carbo, Nueve de Octubre, Olmedo, Roca, Rocafuerte, Sucre, Urdaneta). Chongón no se incluye.
    zoneShare: [1050826, 74932, 80146, 343836, 95943, 50028, 546254],
    defaults: {
      realPopulation: 2650288, // INEC, Censo 2022: población urbana de Guayaquil
      householdMean: 3.39, // INEC, Censo 2022: 2.746.403 personas en 810.562 hogares
      singleHouseholdShare: 0.145, // SUPUESTO: mismo valor que Manabí
      start: 'mercado:Centro',
      // Recursos escalados por población (~10 veces Manta), SUPUESTO: la misma capacidad por habitante.
      dosesPerDay: 25000,
      budget: 3000000,
      closureCostPerDay: 30000, // las zonas de Guayaquil son ~5 veces más grandes que las parroquias de Manta
      fumigationCostPerDay: 15000,
    },
    map: GYE_MAP,
    shapes: GYE_SHAPES,
    water: null,
  },
};

export const cityOf = (cfg) => CITIES[cfg.city];
export const zonesOf = (cfg) => CITIES[cfg.city].zones;
