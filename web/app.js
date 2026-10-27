import { DEFAULTS } from './engine/config.js';
import { headline, mayorReport } from './engine/report.js';
import { CityPlayer } from './city.js';
import { renderVecino, interestingPeople } from './vecino.js';
import { CALIBRATION } from './engine/calibration.js';
import { DENGUE_MANABI_2024, DENGUE_PERIODS } from './engine/dengue-manabi-2024.js';

const API_URL = (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '';
const form = document.getElementById('controls');
const $ = (id) => document.getElementById(id);
const fmt = (x) => Math.round(x).toLocaleString('es-EC');
const usd = (x) => `USD ${fmt(x)}`;

const FIELDS = [
  'r0', 'dosesPerDay', 'vaccineEfficacy', 'budget', 'start', 'initialInfected', 'responseStartDay', 'vaccineStartDay',
  'detectionProb', 'quarantineCompliance', 'costPerDose', 'quarantineCostPerHouseholdDay', 'closureCostPerDay', 'days',
  'seed', 'runs', 'latentMin', 'latentMax', 'infectiousMin', 'infectiousMax',
];
const LABELS = { nada: 'No hacer nada', azar: 'Al azar (mismos recursos)', adaptativa: 'Estrategia del Comité' };
const COLORS = { nada: '#f87171', azar: '#facc15', adaptativa: '#4ade80' };
const PRIORITY = { anillo: 'Entorno de casos + más conectados', mixto: 'Mixta', conectados: 'Más conectados de la ciudad' };

const PRESET_LABELS = {
  doble: '×2 contagio',
  mitad: '½ vacunas',
  mercado: 'empieza en el mercado',
  variante: 'la vacuna cubre a medias',
  tarde: 'respuesta 10 días más tarde',
  pobre: '½ presupuesto',
  dengue: 'dengue de Manabí 2024 (calibrado con datos reales)',
};

let chart = null;
let busy = false;
let previous = null; // último resultado, para mostrar qué cambió tras un Brote Sorpresa
const player = new CityPlayer(document.querySelector('.city'));

// Modo Vecino: la ficha de la persona elegida se actualiza con el día de la animación.
const vecino = $('vecino');
let neighbours = [];
let nextNeighbour = 0;
player.onSelect = (i) => {
  renderVecino(vecino, player.trace, i, player.day);
  vecino.hidden = false;
};
player.onDay = (day) => {
  if (!vecino.hidden && player.selected >= 0) renderVecino(vecino, player.trace, player.selected, day);
};
vecino.addEventListener('click', (e) => {
  if (e.target.closest('.close')) {
    vecino.hidden = true;
    player.selected = -1;
    player.show(player.day);
  }
  const link = e.target.closest('[data-person]');
  if (link) player.select(Number(link.dataset.person));
});
$('meetBtn').addEventListener('click', () => {
  if (!neighbours.length) return;
  player.select(neighbours[nextNeighbour++ % neighbours.length]);
});

function setForm(values) {
  for (const name of FIELDS) form.elements[name].value = values[name];
  form.elements.vectorBorne.checked = values.vectorBorne === true;
  updateOutputs();
}

function readForm() {
  const cfg = {};
  for (const name of FIELDS) {
    const raw = form.elements[name].value;
    cfg[name] = name === 'start' ? raw : Number(raw);
  }
  cfg.vectorBorne = form.elements.vectorBorne.checked;
  return cfg;
}

function updateOutputs() {
  $('r0Out').textContent = Number(form.elements.r0.value).toFixed(1);
  $('dosesOut').textContent = fmt(form.elements.dosesPerDay.value);
  $('effOut').textContent = `${Math.round(form.elements.vaccineEfficacy.value * 100)} %`;
}

const PRESETS = {
  doble: (c) => ({ r0: Math.min(5, +(c.r0 * 2).toFixed(1)) }),
  mitad: (c) => ({ dosesPerDay: Math.round(c.dosesPerDay / 2 / 250) * 250 }),
  mercado: () => ({ start: 'mercado:Manta' }),
  variante: (c) => ({ vaccineEfficacy: +(c.vaccineEfficacy / 2).toFixed(2) }),
  tarde: (c) => ({ responseStartDay: c.responseStartDay + 10, vaccineStartDay: c.vaccineStartDay + 10 }),
  pobre: (c) => ({ budget: Math.round(c.budget / 2) }),
  // La transmisibilidad del dengue de Manabí 2024, calibrada con los datos del MSP, aplicada a Manta.
  dengue: () => ({ r0: CALIBRATION.r0, ...DENGUE_PERIODS, days: 180, vectorBorne: true }),
};

function setBusy(on, text) {
  busy = on;
  $('runBtn').disabled = on;
  for (const b of document.querySelectorAll('[data-preset]')) b.disabled = on;
  $('progress').hidden = !on;
  if (text) $('status').textContent = text;
}

function runLocal(config) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        $('progress').value = data.value;
        $('status').textContent = data.text;
      } else if (data.type === 'done') {
        worker.terminate();
        resolve(data.summary);
      } else {
        worker.terminate();
        reject(new Error(data.message));
      }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message)); };
    worker.postMessage({ config });
  });
}

async function runCloud(config) {
  $('status').textContent = `Corriendo ${config.runs} simulaciones en AWS Lambda…`;
  const res = await fetch(`${API_URL.replace(/\/$/, '')}/simulate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

// La animación: el worker repite la corrida típica guardando el estado de cada persona cada día.
function loadCity(s) {
  const worker = new Worker('./worker.js', { type: 'module' });
  worker.onmessage = ({ data }) => {
    worker.terminate();
    if (data.type !== 'trace') return;
    player.load(data.trace, s.config, s.runs);
    vecino.hidden = true;
    neighbours = interestingPeople(data.trace);
    nextNeighbour = 0;
    $('meetBtn').disabled = neighbours.length === 0;
  };
  worker.postMessage({ type: 'trace', config: s.config, policy: s.policy, run: s.representativeRun });
}

const policyText = (p) =>
  `${PRIORITY[p.priority].toLowerCase()}, ${p.quarantine ? 'con' : 'sin'} cuarentenas, ${p.closures ? 'con' : 'sin'} cierres, reserva ${Math.round((p.reserve ?? 0) * 100)} %`;

function showChanges(before, after, label) {
  const box = $('changes');
  const row = (title, a, b) => `<div><span>${title}</span><strong>${a} → ${b}</strong></div>`;
  const changes = [];
  const p0 = before.policy, p1 = after.policy;
  if (p0.priority !== p1.priority) changes.push(`Vacunas: de "${PRIORITY[p0.priority]}" a "${PRIORITY[p1.priority]}".`);
  if (p0.quarantine !== p1.quarantine) changes.push(p1.quarantine ? 'Ahora sí conviene aislar los hogares de los casos.' : 'Ya no conviene gastar en cuarentenas.');
  if (p0.closures !== p1.closures) changes.push(p1.closures ? 'Ahora sí conviene cerrar mercados o colegios donde haya casos.' : 'Ya no conviene cerrar mercados ni colegios: el dinero rinde más en otra cosa.');
  if ((p0.reserve ?? 0) !== (p1.reserve ?? 0)) changes.push(`Reserva de presupuesto: de ${Math.round((p0.reserve ?? 0) * 100)} % a ${Math.round((p1.reserve ?? 0) * 100)} %.`);
  if (!!p0.fumigation !== !!p1.fumigation) changes.push(p1.fumigation ? 'Ahora conviene enviar brigadas de fumigación a las parroquias con casos.' : 'Ya no conviene fumigar.');
  if (!changes.length) changes.push(`La misma política sigue siendo la mejor (${policyText(p1)}).`);
  box.innerHTML =
    `<h3>🎃 Brote Sorpresa: ${label}. La estrategia se volvió a optimizar.</h3>` +
    `<div class="delta">` +
    row('Mordidos con la estrategia', fmt(before.strategies.adaptativa.infected.mean), fmt(after.strategies.adaptativa.infected.mean)) +
    row('Salvados vs no hacer nada', fmt(before.savedVsNone.mean), fmt(after.savedVsNone.mean)) +
    row('Gana al azar', `${Math.round(before.winRateVsRandom * 100)} %`, `${Math.round(after.winRateVsRandom * 100)} %`) +
    row('Costo', usd(before.strategies.adaptativa.spent.mean), usd(after.strategies.adaptativa.spent.mean)) +
    `</div><ul>${changes.map((c) => `<li>${c}</li>`).join('')}</ul>`;
  box.hidden = false;
}

async function simulate(surprise = null) {
  if (busy) return;
  const config = readForm();
  const useCloud = API_URL && $('useCloud').checked;
  setBusy(true, 'Preparando…');
  const started = performance.now();
  try {
    const summary = useCloud ? await runCloud(config) : await runLocal(config);
    render(summary, (performance.now() - started) / 1000);
    if (surprise && previous) showChanges(previous, summary, surprise);
    else $('changes').hidden = true;
    previous = summary;
    loadCity(summary);
  } catch (err) {
    $('status').textContent = `No se pudo simular: ${err.message}`;
  } finally {
    setBusy(false);
  }
}

function render(s, seconds) {
  const where = s.engine === 'aws' ? 'en AWS Lambda' : 'en este navegador';
  $('status').textContent = `Listo: ${s.runs} simulaciones ${where} en ${seconds.toFixed(1)} s.`;
  $('headline').textContent = headline(s);
  renderVerdict(s);

  $('kSavedNone').textContent = fmt(s.savedVsNone.mean);
  $('kSavedNoneRange').textContent = `rango ${fmt(s.savedVsNone.p5)} a ${fmt(s.savedVsNone.p95)}`;
  $('kSavedRandom').textContent = fmt(s.savedVsRandom.mean);
  $('kSavedRandomRange').textContent = `rango ${fmt(s.savedVsRandom.p5)} a ${fmt(s.savedVsRandom.p95)}`;
  $('kWin').textContent = s.takeoffRuns ? `${Math.round(s.winRateVsRandom * 100)} %` : '—';
  $('kWinNote').textContent = `${s.takeoffRuns} de ${s.runs} brotes despegaron; pierde en ${Math.round(s.lossRateVsRandom * 100)} %`;
  $('kCost').textContent = usd(s.strategies.adaptativa.spent.mean);
  $('kCostNote').textContent = `presupuesto ${usd(s.config.budget)}`;

  const tbody = $('compare').querySelector('tbody');
  tbody.innerHTML = '';
  for (const key of ['nada', 'azar', 'adaptativa']) {
    const x = s.strategies[key];
    const tr = document.createElement('tr');
    if (key === 'adaptativa') tr.className = 'best';
    for (const text of [LABELS[key], fmt(x.infected.mean), `${fmt(x.infected.p5)} – ${fmt(x.infected.p95)}`, fmt(x.peak.mean), usd(x.spent.mean)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  const a = s.strategies.adaptativa;
  $('wasted').textContent =
    `Vacunas a casos ya reportados: ${a.wastedVisible} (siempre 0). Dosis que cayeron en mordidos sin síntomas o casos sin reportar: ${fmt(a.wastedHidden.mean)} en promedio; nadie puede distinguirlos de un sano.`;

  $('report').textContent = mayorReport(s);

  $('nPolicies').textContent = s.ranking.length;
  const rtbody = $('ranking').querySelector('tbody');
  rtbody.innerHTML = '';
  s.ranking.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'best';
    const fumigation = s.config.vectorBorne ? (r.policy.fumigation ? 'Sí' : 'No') : '—';
    for (const text of [i + 1, PRIORITY[r.policy.priority], r.policy.closures ? 'Sí' : 'No', r.policy.quarantine ? 'Sí' : 'No', fumigation, `${Math.round((r.policy.reserve ?? 0) * 100)} %`, fmt(r.infected), usd(r.spent)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    rtbody.appendChild(tr);
  });

  $('footer').textContent =
    `Semilla ${s.config.seed} · huella de configuración ${s.configHash} · 1 agente = ${s.scale.toFixed(1)} habitantes reales de Manta · ` +
    `misma semilla y configuración = mismo resultado.`;

  drawChart(s);
}

// Veredicto de la prueba de fuego con prueba de signos: ¿ganar fue suerte?
function renderVerdict(s) {
  const box = $('verdict');
  if (!s.verdictVsRandom) {
    box.hidden = true;
    return;
  }
  const pText = (p) => (p < 0.001 ? 'p < 0,001' : `p = ${p.toFixed(3).replace('.', ',')}`);
  const line = (v, name) =>
    `<div class="${v.passed ? 'ok' : 'ko'}">${v.passed ? '✅' : '❌'} ${v.passed ? 'Supera' : 'No se puede afirmar que supere'} a <b>${name}</b>: ` +
    `gana ${v.wins}, pierde ${v.losses}, empata ${v.ties} de ${s.takeoffRuns} brotes que despegan (prueba de signos, ${pText(v.p)}).</div>`;
  box.innerHTML = line(s.verdictVsNone, 'no hacer nada') + line(s.verdictVsRandom, 'actuar al azar con los mismos recursos');
  box.hidden = false;
}

function drawChart(s) {
  if (!window.Chart) return;
  const labels = s.strategies.nada.curve.mean.map((_, d) => d);
  const datasets = [];
  for (const key of ['nada', 'azar', 'adaptativa']) {
    const c = s.strategies[key].curve;
    datasets.push(
      { label: `${LABELS[key]} (p95)`, data: c.p95, borderWidth: 0, pointRadius: 0, fill: false, borderColor: 'transparent' },
      { label: `${LABELS[key]} (p5)`, data: c.p5, borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: `${COLORS[key]}22`, borderColor: 'transparent' },
      { label: LABELS[key], data: c.mean, borderColor: COLORS[key], borderWidth: 2.5, pointRadius: 0, fill: false },
    );
  }
  if (chart) chart.destroy();
  chart = new window.Chart($('curve'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { title: { display: true, text: 'Día', color: '#a99fd1' }, ticks: { color: '#a99fd1', maxTicksLimit: 12 }, grid: { color: '#2a2250' } },
        y: { title: { display: true, text: 'Zombis activos (personas)', color: '#a99fd1' }, ticks: { color: '#a99fd1' }, grid: { color: '#2a2250' } },
      },
      plugins: {
        legend: { labels: { color: '#ece8ff', filter: (item) => !item.text.includes('(p') } },
        tooltip: { filter: (item) => !item.dataset.label.includes('(p'), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
      },
    },
  });
}

// Datos reales del MSP frente al motor calibrado (no depende de la simulación actual).
function drawCalibration() {
  if (!window.Chart) return;
  const c = CALIBRATION;
  new window.Chart($('calib'), {
    data: {
      labels: c.observed.map((_, w) => `SE ${w + 1}`),
      datasets: [
        { type: 'bar', label: 'Casos reales (MSP)', data: c.observed, backgroundColor: '#ff8a3d99', borderWidth: 0 },
        { type: 'line', label: 'Modelo calibrado', data: c.model, borderColor: '#2dd4bf', borderWidth: 2.5, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { color: '#a99fd1', maxTicksLimit: 13 }, grid: { color: '#2a2250' } },
        y: { title: { display: true, text: 'Casos reportados por semana', color: '#a99fd1' }, ticks: { color: '#a99fd1' }, grid: { color: '#2a2250' } },
      },
      plugins: { legend: { labels: { color: '#ece8ff' } } },
    },
  });
  $('calibNote').innerHTML =
    `El mismo motor, sin intervenciones, ajustado a los ${fmt(c.observed.reduce((a, b) => a + b, 0))} casos de 2024 del ` +
    `<a href="${DENGUE_MANABI_2024.url}" target="_blank" rel="noopener">Ministerio de Salud Pública</a>: ` +
    `R0 efectivo <b>${c.r0}</b>, se reporta el <b>${(c.reportedFraction * 100).toFixed(1)} %</b> de las infecciones, ` +
    `R² = <b>${c.r2}</b>. El botón 🦟 aplica esta plaga calibrada a Manta. Detalle y límites en docs/calibracion.md.`;
}

form.addEventListener('input', updateOutputs);
form.addEventListener('submit', (e) => {
  e.preventDefault();
  simulate();
});
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
    e.preventDefault();
    simulate();
  }
});
$('resetBtn').addEventListener('click', () => setForm(DEFAULTS));
$('copyBtn').addEventListener('click', () => navigator.clipboard?.writeText($('report').textContent));
for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => {
    const current = readForm();
    setForm({ ...current, ...PRESETS[button.dataset.preset](current) });
    simulate(PRESET_LABELS[button.dataset.preset]);
  });
}

if (API_URL) $('cloudRow').hidden = false;
setForm(DEFAULTS);
if (window.Chart) drawCalibration();
else window.addEventListener('load', drawCalibration);
