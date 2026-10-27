# Genera el mapa real de Manta para "La ciudad en vivo":
#   web/img/manta-satelite.jpg  imagen satelital (Esri World Imagery) recortada a las 5 parroquias urbanas
#   src/engine/manta-map.js     límites reales de las parroquias (OpenStreetMap) y una grilla de densidad
#                               construida (edificios y calles de OpenStreetMap) para ubicar los hogares
# Uso: python3 scripts/build-map.py [carpeta_cache]   (requiere Pillow; las teselas se guardan en la caché)
import base64, json, math, os, subprocess, sys, time
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.map-cache')
UA = 'plaga-zombie-manta/1.0 (hackathon demo)'
Z = 15
N = 2 ** Z
GRID_W = 240  # celdas de la grilla de densidad a lo ancho (~75 m por celda)
OUT_W = 2000  # ancho de la imagen publicada

# Mismo orden que PARROQUIAS en src/engine/config.js; ids de las relaciones administrativas de OSM.
PARROQUIAS = [('Manta', 282076), ('Tarqui', 18354318), ('Los Esteros', 18354316), ('Eloy Alfaro', 18354317), ('San Mateo', 18354296)]


def get(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # curl usa los certificados del sistema (el Python de python.org en macOS no trae los suyos).
        subprocess.run(['curl', '-sSfL', '-A', UA, '-o', path, url], check=True)
        time.sleep(0.2)  # cortesía con los servidores de teselas
    return path


def world_px(lon, lat):
    s = math.sin(math.radians(lat))
    return ((lon + 180) / 360 * N * 256, (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * N * 256)


# 1. Límites de las parroquias (Nominatim, geometría simplificada).
polys = []
for name, osm_id in PARROQUIAS:
    path = get(f'https://nominatim.openstreetmap.org/lookup?osm_ids=R{osm_id}&format=json&polygon_geojson=1&polygon_threshold=0.0002',
               f'{CACHE}/R{osm_id}.json')
    g = json.load(open(path))[0]['geojson']
    rings = g['coordinates'] if g['type'] == 'Polygon' else [r for p in g['coordinates'] for r in p]
    polys.append([[world_px(lon, lat) for lon, lat in ring] for ring in rings])

# 2. Recorte: los límites con un margen, más mar arriba para que se lea la costa.
xs = [p[0] for rings in polys for r in rings for p in r]
ys = [p[1] for rings in polys for r in rings for p in r]
x0, x1 = min(xs) - 120, max(xs) + 120
y0, y1 = min(ys) - 160, max(ys) + 60
cw, ch = x1 - x0, y1 - y0

# 3. Mosaicos satelital y OSM.
tx0, tx1, ty0, ty1 = int(x0 // 256), int(x1 // 256), int(y0 // 256), int(y1 // 256)
mosaic = {k: Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256)) for k in ('sat', 'osm')}
for tx in range(tx0, tx1 + 1):
    for ty in range(ty0, ty1 + 1):
        sat = get(f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}', f'{CACHE}/sat/{tx}_{ty}.jpg')
        osm = get(f'https://tile.openstreetmap.org/{Z}/{tx}/{ty}.png', f'{CACHE}/osm/{tx}_{ty}.png')
        mosaic['sat'].paste(Image.open(sat).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
        mosaic['osm'].paste(Image.open(osm).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
box = (round(x0 - tx0 * 256), round(y0 - ty0 * 256), round(x1 - tx0 * 256), round(y1 - ty0 * 256))
sat = mosaic['sat'].crop(box)
osm = mosaic['osm'].crop(box)
out = sat.resize((OUT_W, round(OUT_W * ch / cw)), Image.LANCZOS)

# La fuente satelital tiene un parche rectangular de otra fecha (verde, con nubes) en los cerros al oeste,
# fuera de la zona poblada. Se detecta (columnas y filas mayoritariamente verdes) y se rellena con la
# textura vecina en espejo, solo para que no distraiga.
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
out.save(f'{ROOT}/web/img/manta-satelite.jpg', quality=82, optimize=True, progressive=True)

# 4. Polígonos en coordenadas [0, 1] del recorte.
norm = [[[((x - x0) / cw, (y - y0) / ch) for x, y in r] for r in rings] for rings in polys]


def inside(px, py, rings):
    hit = False
    for r in rings:
        for (ax, ay), (bx, by) in zip(r, r[1:] + r[:1]):
            if (ay > py) != (by > py) and px < (bx - ax) * (py - ay) / (by - ay) + ax:
                hit = not hit
    return hit


# 5. Densidad construida por celda: proporción de píxeles de edificios, zonas residenciales y calles en el mapa OSM.
BUILT = [(217, 208, 201), (196, 182, 171), (224, 223, 223), (255, 255, 255), (247, 250, 191), (252, 214, 164)]
grid_h = round(GRID_W * ch / cw)
cell = cw / GRID_W
owner = bytearray([255] * (GRID_W * grid_h))
weight = bytearray(GRID_W * grid_h)
pix = osm.load()
for gy in range(grid_h):
    for gx in range(GRID_W):
        cx, cy = (gx + 0.5) / GRID_W, (gy + 0.5) / grid_h
        k = next((i for i, rings in enumerate(norm) if inside(cx, cy, rings)), 255)
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
        owner[gy * GRID_W + gx] = k
        weight[gy * GRID_W + gx] = min(255, round(share ** 1.5 * 255))  # potencia > 1: concentra en lo más denso

js = f'''// GENERADO por scripts/build-map.py — no editar a mano.
// Mapa real de Manta: límites de parroquias y densidad construida de OpenStreetMap (© colaboradores de OSM, ODbL);
// imagen satelital de Esri World Imagery (Esri, Maxar, Earthstar Geographics). Coordenadas en [0, 1] del recorte.
export const MAP = {{
  image: 'img/manta-satelite.jpg',
  aspect: {cw / ch:.4f},
  attribution: 'Imagen © Esri, Maxar, Earthstar Geographics · Límites y densidad © colaboradores de OpenStreetMap',
  gridW: {GRID_W},
  gridH: {grid_h},
  // Por celda: parroquia dueña (255 = fuera de la ciudad) y peso de densidad construida (0–255), en base64.
  owner: '{base64.b64encode(owner).decode()}',
  weight: '{base64.b64encode(weight).decode()}',
}};
export const PARROQUIA_SHAPES = {json.dumps([[[[round(x, 4), round(y, 4)] for x, y in r] for r in rings] for rings in norm], separators=(',', ':'))};
'''
open(f'{ROOT}/src/engine/manta-map.js', 'w').write(js)
counts = [sum(1 for i in range(len(owner)) if owner[i] == k and weight[i] > 0) for k in range(len(PARROQUIAS))]
print(f'mapa {cw / ch:.2f}:1, grilla {GRID_W}x{grid_h}, celdas habitadas por parroquia {counts}')
