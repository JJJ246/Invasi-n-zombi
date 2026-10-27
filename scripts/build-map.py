# Genera el mapa real de una ciudad para "La ciudad en vivo":
#   web/img/<ciudad>-satelite.jpg  imagen satelital (Esri World Imagery) recortada a sus zonas urbanas
#   src/engine/maps/<ciudad>.js    límites reales de las zonas (OpenStreetMap) y una grilla de densidad
#                                  construida (edificios y calles de OpenStreetMap) para ubicar los hogares
# Uso: python3 scripts/build-map.py <manta|guayaquil> [carpeta_cache]   (requiere Pillow)
# Para agregar otra ciudad basta con sumar una entrada a CITIES (ids de relaciones administrativas de OSM).
import base64, json, math, os, subprocess, sys, time
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CITY = sys.argv[1] if len(sys.argv) > 1 else 'manta'
CACHE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, '.map-cache')
UA = 'plaga-zombie-manta/1.0 (hackathon demo)'
CELL_M = 75  # tamaño de cada celda de la grilla de densidad, en metros
OUT_MAX = 2000  # lado mayor de la imagen publicada, en píxeles

# Cada zona: (nombre, [ids de relaciones de OSM]). Mismo orden que las zonas en src/engine/cities.js.
CITIES = {
    'manta': {
        'zoom': 15,
        'sea_top': 160,  # margen extra arriba para que se lea la costa
        'patch_green': True,
        'zones': [('Manta', [282076]), ('Tarqui', [18354318]), ('Los Esteros', [18354316]), ('Eloy Alfaro', [18354317]), ('San Mateo', [18354296])],
    },
    'guayaquil': {
        'zoom': 14,
        'sea_top': 60,
        'patch_green': False,
        'zones': [
            ('Tarqui', [2032872]),
            ('Pascuales', [2032869]),
            # Las 9 parroquias pequeñas del casco central, agrupadas para que el mapa se lea.
            ('Centro', [2032823, 2032828, 2032830, 2032831, 2032832, 2032867, 2032870, 2032871, 2032973]),
            ('Febres Cordero', [2033913]),
            ('Letamendi', [2032986]),
            ('García Moreno', [2032822]),
            # Ximena: el sur (Guasmos, Floresta, Trinitaria…), mapeado en OSM por barrios.
            ('Ximena', [2032974, 2032975, 2032976, 2032977, 2032979, 2032980, 2032981, 2032982, 2032983, 2032985, 2032990, 2032993, 2032996, 10335274]),
        ],
    },
}
C = CITIES[CITY]
Z = C['zoom']
N = 2 ** Z


def get(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # curl usa los certificados del sistema (el Python de python.org en macOS no trae los suyos).
        subprocess.run(['curl', '-sSfL', '-A', UA, '-o', path, url], check=True)
        time.sleep(1.1 if 'nominatim' in url else 0.2)  # cortesía: Nominatim pide 1 consulta por segundo
    return path


def world_px(lon, lat):
    s = math.sin(math.radians(lat))
    return ((lon + 180) / 360 * N * 256, (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * N * 256)


# 1. Límites de las zonas (Nominatim, geometría simplificada). Cada zona es una lista de polígonos.
zones = []
for name, ids in C['zones']:
    polys = []
    for osm_id in ids:
        path = get(f'https://nominatim.openstreetmap.org/lookup?osm_ids=R{osm_id}&format=json&polygon_geojson=1&polygon_threshold=0.0002',
                   f'{CACHE}/R{osm_id}.json')
        g = json.load(open(path))[0]['geojson']
        parts = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        polys += [[[world_px(lon, lat) for lon, lat in ring] for ring in part] for part in parts]
    zones.append(polys)

# 2. Recorte: los límites con un margen.
xs = [p[0] for z in zones for poly in z for r in poly for p in r]
ys = [p[1] for z in zones for poly in z for r in poly for p in r]
x0, x1 = min(xs) - 120, max(xs) + 120
y0, y1 = min(ys) - C['sea_top'], max(ys) + 60
cw, ch = x1 - x0, y1 - y0

# 3. Mosaicos satelital y OSM.
tx0, tx1, ty0, ty1 = int(x0 // 256), int(x1 // 256), int(y0 // 256), int(y1 // 256)
mosaic = {k: Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256)) for k in ('sat', 'osm')}
for tx in range(tx0, tx1 + 1):
    for ty in range(ty0, ty1 + 1):
        sat = get(f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}', f'{CACHE}/z{Z}/sat/{tx}_{ty}.jpg')
        osm = get(f'https://tile.openstreetmap.org/{Z}/{tx}/{ty}.png', f'{CACHE}/z{Z}/osm/{tx}_{ty}.png')
        mosaic['sat'].paste(Image.open(sat).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
        mosaic['osm'].paste(Image.open(osm).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
box = (round(x0 - tx0 * 256), round(y0 - ty0 * 256), round(x1 - tx0 * 256), round(y1 - ty0 * 256))
sat = mosaic['sat'].crop(box)
osm = mosaic['osm'].crop(box)
k_out = OUT_MAX / max(cw, ch)
out = sat.resize((round(cw * k_out), round(ch * k_out)), Image.LANCZOS)

if C['patch_green']:
    # La fuente satelital de Manta tiene un parche rectangular de otra fecha (verde, con nubes) en los cerros
    # al oeste, fuera de la zona poblada. Se detecta y se rellena con la textura vecina en espejo.
    px_ = out.load()
    green = lambda x, y: px_[x, y][1] - px_[x, y][0] > 12 and px_[x, y][1] > px_[x, y][2]
    cols = [x for x in range(out.width // 2) if sum(green(x, y) for y in range(0, out.height, 3)) > out.height / 15]
    if cols:
        gx0, gx1 = cols[0], cols[-1] + 1
        rows = [y for y in range(out.height) if sum(green(x, y) for x in range(gx0, gx1)) > (gx1 - gx0) / 2]
        gy0, gy1 = rows[0], rows[-1] + 1
        gx0, gx1, gy0, gy1 = gx0 - 4, gx1 + 4, gy0 - 10, gy1 + 6  # incluye el borde del parche
        patch = out.crop((2 * gx0 - gx1, gy0, gx0, gy1)).transpose(Image.FLIP_LEFT_RIGHT)
        out.paste(patch, (gx0, gy0))
        print(f'parche de la fuente rellenado: x {gx0}–{gx1}, y {gy0}–{gy1}')

os.makedirs(f'{ROOT}/web/img', exist_ok=True)
out.save(f'{ROOT}/web/img/{CITY}-satelite.jpg', quality=82, optimize=True, progressive=True)

# 4. Polígonos en coordenadas [0, 1] del recorte.
norm = [[[[((x - x0) / cw, (y - y0) / ch) for x, y in r] for r in poly] for poly in z] for z in zones]


def inside(px, py, poly):
    hit = False
    for r in poly:
        for (ax, ay), (bx, by) in zip(r, r[1:] + r[:1]):
            if (ay > py) != (by > py) and px < (bx - ax) * (py - ay) / (by - ay) + ax:
                hit = not hit
    return hit


# Si dos zonas se superponen en OSM, la celda es de la zona más pequeña (la más específica).
def bbox_area(z):
    pts = [p for poly in z for r in poly for p in r]
    return (max(p[0] for p in pts) - min(p[0] for p in pts)) * (max(p[1] for p in pts) - min(p[1] for p in pts))


order = sorted(range(len(norm)), key=lambda k: bbox_area(norm[k]))

# 5. Densidad construida por celda: proporción de píxeles de edificios, zonas residenciales y calles en el mapa OSM.
BUILT = [(217, 208, 201), (196, 182, 171), (224, 223, 223), (255, 255, 255), (247, 250, 191), (252, 214, 164)]
lat_mid = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * ((y0 + y1) / 2) / (N * 256)))))
m_per_px = 156543.03392 * math.cos(math.radians(lat_mid)) / N
grid_w = max(60, round(cw * m_per_px / CELL_M))
grid_h = round(grid_w * ch / cw)
cell = cw / grid_w
owner = bytearray([255] * (grid_w * grid_h))
weight = bytearray(grid_w * grid_h)
pix = osm.load()
for gy in range(grid_h):
    for gx in range(grid_w):
        cx, cy = (gx + 0.5) / grid_w, (gy + 0.5) / grid_h
        k = next((k for k in order if any(inside(cx, cy, poly) for poly in norm[k])), 255)
        if k == 255:
            continue
        built = total = 0
        for sy in range(int(gy * cell), int((gy + 1) * cell), 2):
            for sx in range(int(gx * cell), int((gx + 1) * cell), 2):
                r, g, b = pix[min(sx, osm.width - 1), min(sy, osm.height - 1)]
                total += 1
                if any(abs(r - R) + abs(g - G) + abs(b - B) < 18 for R, G, B in BUILT):
                    built += 1
        share = built / max(total, 1)
        owner[gy * grid_w + gx] = k
        weight[gy * grid_w + gx] = min(255, round(share ** 1.5 * 255))  # potencia > 1: concentra en lo más denso

# Peso total de cada zona: aproxima cuánta gente vive en ella (se usa si la ciudad no da su reparto).
zone_weight = [sum(weight[i] for i in range(len(owner)) if owner[i] == k) for k in range(len(zones))]
shapes = [[[[round(x, 4), round(y, 4)] for x, y in r] for poly in z for r in poly] for z in norm]

os.makedirs(f'{ROOT}/src/engine/maps', exist_ok=True)
js = f'''// GENERADO por scripts/build-map.py {CITY} — no editar a mano.
// Mapa real: límites de zonas y densidad construida de OpenStreetMap (© colaboradores de OSM, ODbL);
// imagen satelital de Esri World Imagery (Esri, Maxar, Earthstar Geographics). Coordenadas en [0, 1] del recorte.
export const MAP = {{
  image: 'img/{CITY}-satelite.jpg',
  aspect: {cw / ch:.4f},
  attribution: 'Imagen © Esri, Maxar, Earthstar Geographics · Límites y densidad © colaboradores de OpenStreetMap',
  gridW: {grid_w},
  gridH: {grid_h},
  zoneWeight: {json.dumps(zone_weight)},
  // Por celda: zona dueña (255 = fuera de la ciudad) y peso de densidad construida (0–255), en base64.
  owner: '{base64.b64encode(owner).decode()}',
  weight: '{base64.b64encode(weight).decode()}',
}};
export const SHAPES = {json.dumps(shapes, separators=(',', ':'))};
'''
open(f'{ROOT}/src/engine/maps/{CITY}.js', 'w').write(js)
counts = [sum(1 for i in range(len(owner)) if owner[i] == k and weight[i] > 0) for k in range(len(zones))]
print(f'{CITY}: mapa {cw / ch:.2f}:1, grilla {grid_w}x{grid_h}, celdas habitadas por zona {counts}, peso {zone_weight}')
