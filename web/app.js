import { makeConfig } from './engine/config.js';
import { CITIES } from './engine/cities.js';
import { headline, mayorReport, TERMS } from './engine/report.js';
import { CityPlayer } from './city.js';
import { Barrio } from './barrio.js';
import { renderVecino, interestingPeople } from './vecino.js';
import { CALIBRATION } from './engine/calibration.js';
import { DENGUE_MANABI_2024 } from './engine/dengue-manabi-2024.js';
import { SCENARIOS } from './escenarios.js';

const API_URL = (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '';
const form = document.getElementById('controls');
const $ = (id) => document.getElementById(id);
const fmt = (x) => Math.round(x).toLocaleString('es-EC');
const usd = (x) => `USD ${fmt(x)}`;

const FIELDS = [
  'city', 'r0', 'dosesPerDay', 'vaccineEfficacy', 'budget', 'start', 'initialInfected', 'responseStartDay', 'vaccineStartDay',
  'detectionProb', 'quarantineCompliance', 'costPerDose', 'quarantineCostPerHouseholdDay', 'closureCostPerDay', 'days',
  'seed', 'runs', 'latentMin', 'latentMax', 'infectiousMin', 'infectiousMax',
];
const TEXT_FIELDS = new Set(['city', 'start']);
const LABELS = { nada: 'Sin hacer nada', azar: 'Mismos recursos, al azar', adaptativa: 'Plan del Comité' };
const COLORS = { nada: '#ef5350', azar: '#f2b33d', adaptativa: '#34c77b' };
const PRIORITY = { anillo: 'El entorno de los casos, los más conectados primero', mixto: 'Mezcla: entorno de casos y más conectados', conectados: 'Los más conectados de la ciudad' };

const PRESET_LABELS = {
  doble: 'el doble de contagioso',
  mitad: 'la mitad de vacunas',
  mercado: 'empieza en otro mercado',
  variante: 'la vacuna protege a medias',
  tarde: 'se actúa 10 días tarde',
  pobre: 'la mitad del presupuesto',
};

let chart = null;
let busy = false;
let previous = null; // último resultado, para mostrar qué cambió tras un Brote Sorpresa
let scenario = 'zombi';
const terms = () => TERMS[SCENARIOS[scenario].theme];
const player = new CityPlayer(document.querySelector('.city'));
const barrio = new Barrio($('barrio'), player);

// Vista: el barrio de cerca (vecinos caminando, al estilo de un juego) o toda la ciudad (tres mapas).
function setView(view) {
  const isBarrio = view === 'barrio';
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === view));
  $('barrio').hidden = !isBarrio;
  document.querySelector('.city-grid').hidden = isBarrio;
  $('barrioNote').hidden = !isBarrio;
  $('mapNote').hidden = isBarrio;
  $('cityEvents').hidden = isBarrio;
  barrio.setActive(isBarrio);
  if (!isBarrio && player.trace) player.resize();
  if (player.playing) {
    player.pause(); // vuelve a arrancar con la nueva velocidad
    player.play();
  }
}
document.querySelector('.view-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) setView(b.dataset.view);
});
setView('barrio');

// ---------- Escenarios y ciudad ----------
$('scenarios').innerHTML = Object.entries(SCENARIOS)
  .map(([key, s]) => `<label class="scenario"><input type="radio" name="scenario" value="${key}"><b>${s.title}</b><span>${s.sub}</span></label>`)
  .join('');

function fillStart(city, value) {
  const zones = CITIES[city].zones;
  const options = [
    ...zones.map((z) => [`mercado:${z}`, `Mercado de ${z}`]),
    ...zones.map((z) => [`parroquia:${z}`, `En casas de ${z}`]),
    ['colegio', 'En un colegio'],
    ['aleatorio', 'En cualquier lugar (al azar)'],
  ];
  form.elements.start.innerHTML = options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  form.elements.start.value = options.some(([v]) => v === value) ? value : options[0][0];
}

// Aplica una plantilla: valores de la ciudad (población, recursos) + los de la enfermedad.
function applyScenario(key, keep = {}) {
  scenario = key;
  const s = SCENARIOS[key];
  const city = s.config.city ?? form.elements.city.value ?? 'manta';
  const base = makeConfig({ city });
  setForm({ ...base, ...s.config, city, ...keep });
  form.querySelector(`input[name="scenario"][value="${key}"]`).checked = true;
  renderLegend();
}

function setForm(values) {
  fillStart(values.city, values.start);
  for (const name of FIELDS) if (name !== 'start') form.elements[name].value = values[name];
  form.elements.vectorBorne.checked = values.vectorBorne === true;
  updateOutputs();
}

function readForm() {
  const cfg = {};
  for (const name of FIELDS) {
    const raw = form.elements[name].value;
    cfg[name] = TEXT_FIELDS.has(name) ? raw : Number(raw);
  }
  cfg.vectorBorne = form.elements.vectorBorne.checked;
  return cfg;
}

function updateOutputs() {
  $('r0Out').textContent = Number(form.elements.r0.value).toFixed(1).replace('.', ',');
  $('dosesOut').textContent = fmt(form.elements.dosesPerDay.value);
  $('effOut').textContent = `${Math.round(form.elements.vaccineEfficacy.value * 100)} %`;
}

// Al cambiar de ciudad: sus valores por defecto de población, recursos y lugar de inicio.
form.elements.city.addEventListener('change', () => {
  const keep = readForm();
  const base = makeConfig({ city: keep.city });
  setForm({ ...keep, ...base, ...SCENARIOS[scenario].config, city: keep.city, seed: keep.seed, runs: keep.runs });
});
$('scenarios').addEventListener('change', (e) => {
  const current = readForm();
  applyScenario(e.target.value, { seed: current.seed, runs: current.runs });
});

function renderLegend() {
  const T = terms();
  const items = [['#3f7d58', T.S], ['#facc15', `${T.E} (el comité no lo ve)`], ['#ff3b3b', T.I], ['#60a5fa', T.R], ['#2dd4bf', 'Vacunado'], ['#c084fc', 'Hogar en cuarentena']];
  $('legend').innerHTML = items.map(([c, t]) => `<span><i style="--c:${c}"></i>${t}</span>`).join('') + '<span>Mercado / colegios cerrados y fumigación se anotan en el mapa</span>';
  $('curveTitle').firstChild.textContent = `${T.active} por día `;
  $('thInfected').textContent = `Personas ${T.bittenM}`;
}

const PRESETS = {
  doble: (c) => ({ r0: Math.min(5, +(c.r0 * 2).toFixed(1)) }),
  mitad: (c) => ({ dosesPerDay: Math.round(c.dosesPerDay / 2 / 250) * 250 }),
  // Otro mercado: el siguiente de la lista de zonas de la ciudad.
  mercado: (c) => {
    const zones = CITIES[c.city].zones;
    const now = zones.indexOf(c.start.split(':')[1]);
    return { start: `mercado:${zones[(now + 1) % zones.length]}` };
  },
  variante: (c) => ({ vaccineEfficacy: +(c.vaccineEfficacy / 2).toFixed(2) }),
  tarde: (c) => ({ responseStartDay: c.responseStartDay + 10, vaccineStartDay: c.vaccineStartDay + 10 }),
  pobre: (c) => ({ budget: Math.round(c.budget / 2) }),
};

// ---------- Modo Vecino ----------
const vecino = $('vecino');
let neighbours = [];
let nextNeighbour = 0;
player.onSelect = (i) => {
  barrio.focus(i);
  renderVecino(vecino, player.trace, i, player.day, SCENARIOS[scenario].theme);
  vecino.hidden = false;
};
player.onDay = (day) => {
  if (!vecino.hidden && player.selected >= 0) renderVecino(vecino, player.trace, player.selected, day, SCENARIOS[scenario].theme);
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

// ---------- Simulación ----------
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
  $('status').textContent = `Calculando ${config.runs} simulaciones en AWS Lambda…`;
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
    barrio.load(data.trace, makeConfig(s.config), SCENARIOS[scenario].theme, terms());
    player.load(data.trace, s.config, s.runs, terms());
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
  const T = terms();
  const row = (title, a, b) => `<div><span>${title}</span><strong>${a} → ${b}</strong></div>`;
  const changes = [];
  const p0 = before.policy, p1 = after.policy;
  if (p0.priority !== p1.priority) changes.push(`Vacunas: de "${PRIORITY[p0.priority]}" a "${PRIORITY[p1.priority]}".`);
  if (p0.quarantine !== p1.quarantine) changes.push(p1.quarantine ? 'Ahora sí conviene aislar los hogares de los casos.' : 'Ya no conviene gastar en cuarentenas.');
  if (p0.closures !== p1.closures) changes.push(p1.closures ? 'Ahora sí conviene cerrar mercados o colegios donde haya casos.' : 'Ya no conviene cerrar mercados ni colegios: el dinero rinde más en otra cosa.');
  if ((p0.reserve ?? 0) !== (p1.reserve ?? 0)) changes.push(`Reserva de presupuesto: de ${Math.round((p0.reserve ?? 0) * 100)} % a ${Math.round((p1.reserve ?? 0) * 100)} %.`);
  if (!!p0.fumigation !== !!p1.fumigation) changes.push(p1.fumigation ? 'Ahora conviene enviar brigadas de fumigación a las zonas con casos.' : 'Ya no conviene fumigar.');
  if (!changes.length) changes.push(`El mismo plan sigue siendo el mejor (${policyText(p1)}).`);
  box.innerHTML =
    `<h3>Brote sorpresa: ${label}. El plan se volvió a calcular.</h3>` +
    `<div class="delta">` +
    row(`Personas ${T.bittenM} con el plan`, fmt(before.strategies.adaptativa.infected.mean), fmt(after.strategies.adaptativa.infected.mean)) +
    row('Protegidas frente a no hacer nada', fmt(before.savedVsNone.mean), fmt(after.savedVsNone.mean)) +
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
  const T = terms();
  const sc = SCENARIOS[scenario];
  const city = CITIES[s.config.city];
  const where = s.engine === 'aws' ? 'en AWS Lambda' : 'en este navegador';
  $('status').textContent = `Listo: ${s.runs} simulaciones ${where} en ${seconds.toFixed(1)} s.`;

  // Plan recomendado: los pasos del informe, en lenguaje simple.
  const report = mayorReport(s, { theme: sc.theme, disease: sc.disease });
  const lines = report.split('\n');
  const from = lines.indexOf('QUÉ HACER') + 1;
  const to = lines.indexOf('', from);
  $('planTitle').textContent = `Plan recomendado · ${city.name}`;
  $('headline').textContent = headline(s);
  $('planSteps').innerHTML = lines.slice(from, to).map((l) => `<li>${l.replace(/^\d+\.\s*/, '')}</li>`).join('');
  $('planCard').hidden = false;
  renderVerdict(s);

  $('kSavedNone').textContent = fmt(s.savedVsNone.mean);
  $('kSavedNoneRange').textContent = `rango ${fmt(s.savedVsNone.p5)} a ${fmt(s.savedVsNone.p95)}`;
  $('kSavedRandom').textContent = fmt(s.savedVsRandom.mean);
  $('kSavedRandomRange').textContent = `rango ${fmt(s.savedVsRandom.p5)} a ${fmt(s.savedVsRandom.p95)}`;
  $('kWin').textContent = s.takeoffRuns ? `${Math.round(s.winRateVsRandom * 100)} %` : '—';
  $('kWinNote').textContent = `${s.takeoffRuns} de ${s.runs} brotes crecieron; pierde en ${Math.round(s.lossRateVsRandom * 100)} %`;
  $('kCost').textContent = usd(s.strategies.adaptativa.spent.mean);
  $('kCostNote').textContent = `de un presupuesto de ${usd(s.config.budget)}`;

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
    `Vacunas a casos ya reportados: ${a.wastedVisible} (siempre 0). Dosis que cayeron en personas ${T.bittenM} sin síntomas o casos sin reportar: ${fmt(a.wastedHidden.mean)} en promedio; nadie puede distinguirlas de una persona sana.`;

  $('report').textContent = report;

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
    `${city.name}: ${fmt(s.config.realPopulation)} habitantes urbanos · semilla ${s.config.seed} · huella ${s.configHash} · ` +
    `cada persona simulada representa a ${fmt(s.scale)} habitantes · misma semilla y datos = mismo resultado.`;

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
    `<div class="${v.passed ? 'ok' : 'ko'}"><b>${v.passed ? 'Supera' : 'No se puede afirmar que supere'}</b> a ${name}: ` +
    `gana ${v.wins}, pierde ${v.losses} y empata ${v.ties} de ${s.takeoffRuns} brotes que crecieron (prueba de signos, ${pText(v.p)}).</div>`;
  box.innerHTML = line(s.verdictVsNone, 'no hacer nada') + line(s.verdictVsRandom, 'repartir los mismos recursos al azar');
  box.hidden = false;
}

const AXIS = { ticks: { color: '#98a2ae' }, grid: { color: '#222831' } };
function drawChart(s) {
  if (!window.Chart) return;
  const labels = s.strategies.nada.curve.mean.map((_, d) => d);
  const datasets = [];
  for (const key of ['nada', 'azar', 'adaptativa']) {
    const c = s.strategies[key].curve;
    datasets.push(
      { label: `${LABELS[key]} (p95)`, data: c.p95, borderWidth: 0, pointRadius: 0, fill: false, borderColor: 'transparent' },
      { label: `${LABELS[key]} (p5)`, data: c.p5, borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: `${COLORS[key]}1f`, borderColor: 'transparent' },
      { label: LABELS[key], data: c.mean, borderColor: COLORS[key], borderWidth: 2.2, pointRadius: 0, fill: false },
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
        x: { ...AXIS, title: { display: true, text: 'Día', color: '#98a2ae' }, ticks: { ...AXIS.ticks, maxTicksLimit: 12 } },
        y: { ...AXIS, title: { display: true, text: `${terms().active} (personas)`, color: '#98a2ae' } },
      },
      plugins: {
        legend: { labels: { color: '#e7eaee', boxWidth: 14, filter: (item) => !item.text.includes('(p') } },
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
        { type: 'bar', label: 'Casos reales (MSP)', data: c.observed, backgroundColor: '#f2b33d99', borderWidth: 0 },
        { type: 'line', label: 'Modelo calibrado', data: c.model, borderColor: '#3b9eff', borderWidth: 2.2, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ...AXIS, ticks: { ...AXIS.ticks, maxTicksLimit: 13 } },
        y: { ...AXIS, title: { display: true, text: 'Casos reportados por semana', color: '#98a2ae' } },
      },
      plugins: { legend: { labels: { color: '#e7eaee' } } },
    },
  });
  $('calibNote').innerHTML =
    `El mismo motor, sin intervenciones, ajustado a los ${fmt(c.observed.reduce((a, b) => a + b, 0))} casos de 2024 del ` +
    `<a href="${DENGUE_MANABI_2024.url}" target="_blank" rel="noopener">Ministerio de Salud Pública</a>: ` +
    `cada caso contagia a <b>${String(c.r0).replace('.', ',')}</b> personas, se reporta el <b>${(c.reportedFraction * 100).toFixed(1).replace('.', ',')} %</b> de las infecciones y ` +
    `R² = <b>${String(c.r2).replace('.', ',')}</b>. Las plantillas "Dengue" y "El Niño 2026" usan este contagio. Detalle y límites en docs/calibracion.md.`;
}

form.addEventListener('input', updateOutputs);
form.addEventListener('submit', (e) => {
  e.preventDefault();
  simulate();
});
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'radio') {
    e.preventDefault();
    simulate();
  }
});
$('resetBtn').addEventListener('click', () => {
  const current = readForm();
  applyScenario(scenario, { seed: current.seed, runs: current.runs });
});
$('copyBtn').addEventListener('click', () => navigator.clipboard?.writeText($('report').textContent));
for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => {
    const current = readForm();
    setForm({ ...current, ...PRESETS[button.dataset.preset](current) });
    simulate(PRESET_LABELS[button.dataset.preset]);
  });
}

if (API_URL) $('cloudRow').hidden = false;
applyScenario('zombi', { runs: 100 });
if (window.Chart) drawCalibration();
else window.addEventListener('load', drawCalibration);
