// Navegación sobre el barrio: una grilla de dónde se puede caminar (calles, veredas, plazas, playa),
// sacada de una máscara blanco/negro que Higgsfield pintó sobre la misma imagen.
// Las rutas se buscan con A* (prefiriendo el centro de la vereda) y luego se "estiran" para que no zigzagueen.

export async function loadGrid(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, w, h).data;
  const walk = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) walk[i] = px[i * 4] > 128 ? 1 : 0;
  // Distancia al borde más cercano (en celdas): sirve para ir por el medio de la vereda.
  const clear = new Float32Array(w * h).fill(0);
  const queue = [];
  for (let i = 0; i < w * h; i++) if (walk[i]) { clear[i] = Infinity; } else queue.push(i);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (clear[j] > clear[i] + 1) { clear[j] = clear[i] + 1; queue.push(j); }
    }
  }
  // Zonas conectadas, para no pedir rutas imposibles.
  const comp = new Int32Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!walk[i] || comp[i]) continue;
    n++;
    const stack = [i];
    comp[i] = n;
    while (stack.length) {
      const k = stack.pop();
      const x = k % w;
      const y = (k / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const j = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && walk[j] && !comp[j]) { comp[j] = n; stack.push(j); }
      }
    }
  }
  return { w, h, walk, clear, comp, img };
}

// Celda caminable más cercana a un punto (x, y de 0 a 1).
export function snap(grid, x, y) {
  const cx = Math.min(grid.w - 1, Math.max(0, Math.floor(x * grid.w)));
  const cy = Math.min(grid.h - 1, Math.max(0, Math.floor(y * grid.h)));
  for (let r = 0; r < 40; r++) {
    let best = -1;
    let bestClear = -1;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
        const j = ny * grid.w + nx;
        if (grid.walk[j] && grid.clear[j] > bestClear) { best = j; bestClear = grid.clear[j]; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

export const isWalkable = (grid, x, y) => {
  const cx = Math.floor(x * grid.w);
  const cy = Math.floor(y * grid.h);
  return cx >= 0 && cy >= 0 && cx < grid.w && cy < grid.h && grid.walk[cy * grid.w + cx] === 1;
};

// A* en 8 direcciones. Caminar pegado a una pared cuesta más, así la ruta va por el medio.
export function findPath(grid, from, to) {
  if (from < 0 || to < 0 || grid.comp[from] !== grid.comp[to]) return null;
  const { w, walk, clear } = grid;
  const g = new Float32Array(walk.length).fill(Infinity);
  const came = new Int32Array(walk.length).fill(-1);
  const done = new Uint8Array(walk.length); // celdas ya resueltas: no se vuelven a abrir
  const heap = [[0, from]];
  g[from] = 0;
  const tx = to % w;
  const ty = (to / w) | 0;
  const hdist = (i) => { const dx = Math.abs((i % w) - tx); const dy = Math.abs(((i / w) | 0) - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const push = (item) => { heap.push(item); let k = heap.length - 1; while (k && heap[(k - 1) >> 1][0] > item[0]) { heap[k] = heap[(k - 1) >> 1]; k = (k - 1) >> 1; } heap[k] = item; };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[c][0] >= last[0]) break; heap[k] = heap[c]; k = c; } heap[k] = last; } return top; };
  while (heap.length) {
    const [, i] = pop();
    if (done[i]) continue;
    done[i] = 1;
    if (i === to) break;
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= grid.h) continue;
        const j = ny * w + nx;
        if (!walk[j] || done[j]) continue;
        if (dx && dy && (!walk[y * w + nx] || !walk[ny * w + x])) continue; // no cortar esquinas
        const cost = (dx && dy ? 1.414 : 1) * (1 + 2.5 / Math.min(clear[j], 6));
        if (g[i] + cost < g[j]) {
          g[j] = g[i] + cost;
          came[j] = i;
          push([g[j] + hdist(j) * 1.2, j]);
        }
      }
    }
  }
  if (came[to] < 0 && from !== to) return null;
  const cells = [];
  for (let i = to; i !== -1; i = came[i]) cells.unshift(i);
  return smooth(grid, cells);
}

// Línea recta caminable entre dos celdas (con un margen para no rozar paredes).
function lineOfSight(grid, a, b) {
  const { w } = grid;
  let x0 = a % w;
  let y0 = (a / w) | 0;
  const x1 = b % w;
  const y1 = (b / w) | 0;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 1; s < steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    if (grid.clear[y * w + x] < 1.5) return false;
  }
  return true;
}

// "Estirar" la ruta: se saltan los puntos intermedios mientras se pueda ir en línea recta.
function smooth(grid, cells) {
  if (cells.length < 3) return cells;
  const out = [cells[0]];
  let k = 0;
  while (k < cells.length - 1) {
    let far = k + 1;
    for (let j = cells.length - 1; j > k + 1; j--) if (lineOfSight(grid, cells[k], cells[j])) { far = j; break; }
    out.push(cells[far]);
    k = far;
  }
  return out;
}

export const cellCenter = (grid, i) => [((i % grid.w) + 0.5) / grid.w, (((i / grid.w) | 0) + 0.5) / grid.h];
