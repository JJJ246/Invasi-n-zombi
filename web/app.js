// Archivo principal de la página: une todas las piezas.
// - Pantalla "Preparar": escenarios, parámetros y validación del formulario.
// - "Calcular": manda la simulación al worker (o a AWS), muestra la transición y los 21 planes probados.
// - Pantalla "El plan": KPIs, pasos del plan, Brote Sorpresa y las cuatro vistas (barrio, ciudad, curva, informe).
import { makeConfig } from './engine/config.js';
import { candidatePolicies } from './engine/montecarlo.js';
import { CITIES } from './engine/cities.js';
import { mayorReport, TERMS } from './engine/report.js';
import { CityPlayer } from './mapa-ciudad.js';
import { Barrio } from './barrio.js';
import { ContagionMap } from './arbol-contagio.js';
import { renderVecino, interestingPeople } from './ficha-vecino.js';
import { CALIBRATION } from './engine/calibration.js';
import { DENGUE_MANABI_2024 } from './engine/dengue-manabi-2024.js';
import { SCENARIOS } from './escenarios.js';
import { startFilm } from './historia.js';

const API_URL = (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '';
const form = document.getElementById('controls');
const $ = (id) => document.getElementById(id);
const fmt = (x) => Math.round(x).toLocaleString('es-EC');
const usd = (x) => `USD ${fmt(x)}`;
const pct = (x) => `${Math.round(x * 100)} %`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const FIELDS = [
  'city', 'r0', 'dosesPerDay', 'vaccineEfficacy', 'budget', 'start', 'initialInfected', 'responseStartDay', 'vaccineStartDay',
  'detectionProb', 'quarantineCompliance', 'costPerDose', 'quarantineCostPerHouseholdDay', 'closureCostPerDay', 'days',
  'seed', 'runs', 'latentMin', 'latentMax', 'infectiousMin', 'infectiousMax',
];
const TEXT_FIELDS = new Set(['city', 'start']);
const LABELS = { nada: 'Sin hacer nada', azar: 'Lo mismo, al azar', adaptativa: 'Plan del Comité' };
const COLORS = { nada: '#e5383b', azar: '#f5b83d', adaptativa: '#8be04e' };
const PRIORITY = { anillo: 'Quienes rodean a los casos', mixto: 'Entorno de los casos y los más conectados', conectados: 'Los más conectados de la ciudad' };
const PRIORITY_SHORT = { anillo: 'quienes rodean a cada caso', mixto: 'el entorno de los casos y los más conectados', conectados: 'quienes ven a más gente cada día' };
const toWho = (key) => (PRIORITY_SHORT[key].startsWith('el ') ? `al ${PRIORITY_SHORT[key].slice(3)}` : `a ${PRIORITY_SHORT[key]}`);

const PRESET_LABELS = {
  doble: 'el doble de contagio',
  mitad: 'la mitad de las vacunas',
  mercado: 'empieza en otro mercado',
  variante: 'una variante que la vacuna cubre a medias',
  tarde: 'el Comité llega 10 días tarde',
  pobre: 'la mitad del presupuesto',
};

let chart = null;
let busy = false;
let previous = null; // último resultado, para mostrar qué cambió tras un Brote Sorpresa
let scenario = 'zombi';
const terms = () => TERMS[SCENARIOS[scenario].theme];
const player = new CityPlayer($('cityCard'));
const barrio = new Barrio($('barrio'), player);
const tree = new ContagionMap($('treeCard'), player);
// Solo para las pruebas automáticas (abriendo la página con ?pruebas).
if (new URLSearchParams(location.search).has('pruebas')) window.__comite = { player, barrio, tree };

// ---------- Pantallas y transición ----------
const wipeEl = $('wipe');
// Cortina que cae, cambia lo de atrás y se va hacia abajo.
function wipe(middle) {
  if (reduced) return middle();
  wipeEl.className = 'wipe down';
  wipeEl.addEventListener('animationend', () => {
    middle();
    wipeEl.className = 'wipe up';
  }, { once: true });
}
let screen = 'setup';
function showScreen(name, animate = true) {
  if (name === screen) return;
  const swap = () => {
    screen = name;
    $('setupScreen').hidden = name !== 'setup';
    $('resultsScreen').hidden = name !== 'results';
    // La historia vive arriba de "Preparar"; con el plan a la vista se esconde para que todo quepa.
    $('historia').hidden = name === 'results';
    document.body.classList.toggle('on-results', name === 'results');
    document.querySelectorAll('.stepper [data-screen]').forEach((b) => b.classList.toggle('on', b.dataset.screen === name));
    barrio.setActive(name === 'results' && view === 'barrio');
    if (name === 'results') scrollTo(0, 0);
    else toSetup('instant');
  };
  animate ? wipe(swap) : swap();
}
const toSetup = (behavior = 'smooth') => scrollTo({ top: $('setupScreen').getBoundingClientRect().top + scrollY - 64, behavior });
// "La historia": vuelve al principio de la película.
function toStory() {
  if (screen === 'results') showScreen('setup');
  requestAnimationFrame(() => setTimeout(() => scrollTo({ top: 0, behavior: 'smooth' }), screen === 'setup' ? 0 : 700));
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-screen]');
  if (!b || b.disabled) return;
  e.preventDefault();
  if (b.dataset.screen === 'historia') toStory();
  else if (b.dataset.screen === 'setup' && screen === 'setup') toSetup();
  else showScreen(b.dataset.screen);
});
$('skipFilm').addEventListener('click', () => toSetup());
// Al terminar la historia, la página entra sola al simulador.
startFilm({ onEnd: () => screen === 'setup' && toSetup() });
// Entrar con /#simulador lleva directo a "Preparar". El navegador no debe devolver la página arriba.
history.scrollRestoration = 'manual';
if (location.hash === '#simulador') addEventListener('load', () => setTimeout(() => toSetup('instant'), 30));
$('backBtn').addEventListener('click', () => showScreen('setup'));
// Al ir a la portada, la cortina cae antes de cambiar de página.
for (const a of document.querySelectorAll('a[data-wipe]')) {
  a.addEventListener('click', (e) => {
    if (reduced || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    wipeEl.className = 'wipe down';
    wipeEl.addEventListener('animationend', () => (location.href = a.href), { once: true });
  });
}
if (!reduced && /portada/.test(document.referrer)) {
  wipeEl.style.transform = 'translateY(0)';
  requestAnimationFrame(() => { wipeEl.style.transform = ''; wipeEl.className = 'wipe up'; });
}

// ---------- Vistas: barrio, ciudad, curva, informe ----------
let view = 'barrio';
function setView(name) {
  view = name;
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === name));
  for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== name;
  $('legend').hidden = !(name === 'barrio' || name === 'mapa');
  $('cityCard').querySelector('.city-controls').style.visibility = name === 'barrio' || name === 'mapa' ? '' : 'hidden';
  barrio.setActive(name === 'barrio' && screen === 'results');
  if (name === 'mapa' && player.trace) player.resize();
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

// ---------- Escenarios ----------
$('scenarios').innerHTML = Object.entries(SCENARIOS)
  .map(([key, s]) => `<label class="scenario"><input type="radio" name="scenario" value="${key}">${s.art}<b>${s.title}</b><span class="sub">${s.sub}</span><span class="tag">${s.tag}</span></label>`)
  .join('');

function fillStart(city, value) {
  const zones = CITIES[city].zones;
  const options = [
    ...zones.map((z) => [`mercado:${z}`, `Mercado de ${z}`]),
    ...zones.map((z) => [`parroquia:${z}`, `Una casa en ${z}`]),
    ['colegio', 'Un colegio'],
    ['aleatorio', 'Cualquier lugar (al azar)'],
  ];
  form.elements.start.innerHTML = options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  form.elements.start.value = options.some(([v]) => v === value) ? value : options[0][0];
}

// Aplica una plantilla: valores de la ciudad (población, recursos) + los de la enfermedad.
function applyScenario(key, keep = {}) {
  scenario = key;
  const s = SCENARIOS[key];
  const city = s.config.city;
  const base = makeConfig({ city });
  setForm({ ...base, ...s.config, city, ...keep });
  form.querySelector(`input[name="scenario"][value="${key}"]`).checked = true;
  // Cada brote cambia la paleta, los títulos y los textos de toda la página.
  document.body.dataset.theme = key;
  document.querySelector('.intro h1').textContent = s.ui.h1;
  document.querySelector('.intro .lead').innerHTML = s.ui.lead;
  // Con mosquito se prueban también los planes con fumigación (por eso el dengue tiene más).
  $('nPlans').textContent = candidatePolicies(makeConfig({ ...base, ...s.config, city })).length;
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
  $('effOut').textContent = pct(form.elements.vaccineEfficacy.value);
  $('budgetOut').textContent = usd(form.elements.budget.value);
}

// Al cambiar de brote se conservan la semilla y las simulaciones (si son válidas); lo demás vuelve al escenario.
const keepRun = () => {
  const { seed, runs } = readForm();
  const keep = {};
  if (form.elements.seed.value !== '' && seed >= 0 && seed <= 4294967295) keep.seed = Math.floor(seed);
  if (runs >= 10 && runs <= 5000) keep.runs = runs;
  return keep;
};
$('scenarios').addEventListener('change', (e) => applyScenario(e.target.value, keepRun()));

function renderLegend() {
  const T = terms();
  const E = scenario === 'zombi' ? 'Mordido, todavía no se nota' : T.E;
  const items = [['#5fd38d', T.S], ['#facc15', E], ['#ff3b3b', T.I], ['#60a5fa', T.R], ['#2dd4bf', 'Vacunado'], ['#c084fc', 'Casa en cuarentena']];
  $('legend').innerHTML = items.map(([c, t]) => `<span><i style="--c:${c}"></i>${t}</span>`).join('') + '<span>El color del rombo sobre cada vecino es su estado</span>';
  $('curveTitle').textContent = `${T.active} cada día`;
  $('thInfected').textContent = T.bittenM[0].toUpperCase() + T.bittenM.slice(1);
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
  tree.setDay(day);
  if (!vecino.hidden && player.selected >= 0) renderVecino(vecino, player.trace, player.selected, day, SCENARIOS[scenario].theme);
};
vecino.addEventListener('click', (e) => {
  if (e.target.closest('.close')) {
    vecino.hidden = true;
    player.selected = -1;
    player.show(player.day, true);
  }
  const link = e.target.closest('[data-person]');
  if (link) player.select(Number(link.dataset.person));
});
$('meetBtn').addEventListener('click', () => {
  if (!neighbours.length) return;
  if (view !== 'barrio') setView('barrio');
  player.select(neighbours[nextNeighbour++ % neighbours.length]);
});

// ---------- Mientras optimiza: los 21 planes candidatos van apareciendo con su resultado ----------
const PRIORITY_ICON = { anillo: 'i-users', mixto: 'i-bio', conectados: 'i-zap' };
let board = [];
function resetPolicies() {
  board = [];
  $('policies').innerHTML = '';
}
function showPolicy({ k, n, result }) {
  const p = result.policy;
  const on = (flag, ic, title) => `<svg class="ic${flag ? '' : ' off'}" aria-label="${title}"><use href="#${ic}"/></svg>`;
  if (!board.length) $('policies').innerHTML = Array.from({ length: n }, (_, j) => `<div class="pol" data-k="${j}"><b>${j + 1}</b></div>`).join('');
  board[k] = result;
  const tile = $('policies').querySelector(`[data-k="${k}"]`);
  tile.innerHTML = `<b>${k + 1}</b><span class="pol-ic">${on(true, PRIORITY_ICON[p.priority], PRIORITY[p.priority])}${on(p.quarantine, 'i-house-q', 'Cuarentena')}${on(p.closures, 'i-lock', 'Cierres')}${on((p.reserve ?? 0) > 0, 'i-coins', 'Reserva')}</span><em>${fmt(result.infected)}</em>`;
  tile.classList.add('done');
  // El mejor hasta ahora brilla en verde.
  const best = board.reduce((b, r, j) => (r && (b < 0 || r.infected < board[b].infected || (r.infected === board[b].infected && r.spent < board[b].spent)) ? j : b), -1);
  $('policies').querySelectorAll('.pol').forEach((t) => t.classList.toggle('best', Number(t.dataset.k) === best));
  $('busyText').textContent = `Probando los planes del Comité: ${k + 1} de ${n}. El mejor por ahora deja ${fmt(board[best].infected)} ${terms().bittenM}.`;
}

// ---------- Simulación ----------
function setBusy(on, text) {
  busy = on;
  $('runBtn').disabled = on;
  for (const b of document.querySelectorAll('[data-preset]')) b.disabled = on;
  $('busy').hidden = !on;
  if (on) {
    $('progress').style.width = '0';
    resetPolicies();
  }
  if (text) $('busyText').textContent = text;
}

function runLocal(config) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        if (data.value > 0) $('progress').style.width = `${50 + data.value / 2}%`;
        $('busyText').textContent = data.value > 0 ? `El mejor plan, contra el azar y contra no hacer nada: ${data.text.replace('Simulando: ', '').replace('…', '')}` : data.text;
      } else if (data.type === 'policy') {
        showPolicy(data);
        $('progress').style.width = `${((data.k + 1) / data.n) * 50}%`;
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
  $('busyText').textContent = `Calculando ${config.runs} simulaciones en AWS Lambda…`;
  $('progress').style.width = '50%';
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
  return new Promise((resolve) => {
    const worker = new Worker('./worker.js', { type: 'module' });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.type === 'trace') {
        barrio.load(data.trace, makeConfig(s.config), SCENARIOS[scenario].theme, terms());
        barrio.mood = scenario;
        tree.load(data.trace, SCENARIOS[scenario].theme);
        player.load(data.trace, s.config, s.runs, terms());
        vecino.hidden = true;
        neighbours = interestingPeople(data.trace);
        nextNeighbour = 0;
        $('meetBtn').disabled = neighbours.length === 0;
      }
      resolve();
    };
    worker.postMessage({ type: 'trace', config: s.config, policy: s.policy, run: s.representativeRun });
  });
}

const policyText = (p) =>
  `vacunar primero ${toWho(p.priority)}, ${p.quarantine ? 'con' : 'sin'} cuarentenas y ${p.closures ? 'con' : 'sin'} cierres`;

function showChanges(before, after, label) {
  const box = $('changes');
  const T = terms();
  const row = (title, a, b) => `<div><span>${title}</span><strong><s>${a}</s>${b}</strong></div>`;
  const changes = [];
  const p0 = before.policy, p1 = after.policy;
  if (p0.priority !== p1.priority) changes.push(`Las vacunas ahora van primero ${toWho(p1.priority)}. Antes iban ${toWho(p0.priority)}.`);
  if (p0.quarantine !== p1.quarantine) changes.push(p1.quarantine ? 'Ahora sí conviene aislar las casas de los casos.' : 'Ya no conviene gastar en cuarentenas.');
  if (p0.closures !== p1.closures) changes.push(p1.closures ? 'Ahora sí conviene cerrar mercados o colegios donde haya casos.' : 'Ya no conviene cerrar mercados ni colegios: el dinero rinde más en otra cosa.');
  if ((p0.reserve ?? 0) !== (p1.reserve ?? 0)) changes.push(`Ahora se guarda el ${pct(p1.reserve ?? 0)} del presupuesto (antes, el ${pct(p0.reserve ?? 0)}).`);
  if (!!p0.fumigation !== !!p1.fumigation) changes.push(p1.fumigation ? 'Ahora conviene mandar brigadas de fumigación a las zonas con casos.' : 'Ya no conviene fumigar.');
  if (!changes.length) changes.push(`El mismo plan sigue siendo el mejor: ${policyText(p1)}.`);
  box.innerHTML =
    `<button type="button" class="close" aria-label="Cerrar"><svg class="ic"><use href="#i-close"/></svg></button>` +
    `<h3>Brote sorpresa: ${label}. El Comité recalculó el plan.</h3>` +
    `<div class="delta">` +
    row(`${T.bittenM[0].toUpperCase()}${T.bittenM.slice(1)} con el plan`, fmt(before.strategies.adaptativa.infected.mean), fmt(after.strategies.adaptativa.infected.mean)) +
    row('A salvo frente a no hacer nada', fmt(before.savedVsNone.mean), fmt(after.savedVsNone.mean)) +
    row('Le gana al azar', pct(before.winRateVsRandom), pct(after.winRateVsRandom)) +
    row('Costo', usd(before.strategies.adaptativa.spent.mean), usd(after.strategies.adaptativa.spent.mean)) +
    `</div><ul>${changes.map((c) => `<li>${c}</li>`).join('')}</ul>`;
  box.hidden = false;
}
$('changes').addEventListener('click', (e) => {
  if (e.target.closest('.close')) $('changes').hidden = true;
});

// Aviso visible en cualquier pantalla (por ejemplo, un dato mal escrito).
let toastTimer = 0;
function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 6000);
}

// Revisa los datos antes de calcular: cada número dentro de su rango y los mínimos por debajo de los máximos.
const num = (x) => x.toLocaleString('es-EC', { maximumFractionDigits: 2 });
const labelOf = (el) => (el.closest('label')?.firstChild?.textContent ?? el.name).replace(/\s+/g, ' ').trim();
function checkForm() {
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  const f = form.elements;
  for (const el of form.querySelectorAll('input[type="number"], input[type="range"]')) {
    const v = el.value === '' ? NaN : Number(el.value);
    const min = el.min === '' ? -Infinity : Number(el.min);
    const max = el.max === '' ? Infinity : Number(el.max);
    if (!Number.isFinite(v) || v < min || v > max) return [el, `Revisa "${labelOf(el)}": tiene que ser un número entre ${num(min)} y ${num(max)}.`];
  }
  if (Number(f.latentMin.value) > Number(f.latentMax.value)) return [f.latentMax, 'Los días incubando: el mínimo no puede ser mayor que el máximo.'];
  if (Number(f.infectiousMin.value) > Number(f.infectiousMax.value)) return [f.infectiousMax, 'Los días contagiando: el mínimo no puede ser mayor que el máximo.'];
  return null;
}

async function simulate(surprise = null) {
  if (busy) return;
  const problem = checkForm();
  if (problem) {
    const [el, text] = problem;
    if (screen !== 'setup') showScreen('setup', false);
    el.closest('details')?.setAttribute('open', '');
    el.classList.add('invalid');
    el.focus();
    $('status').textContent = text;
    showToast(text);
    return;
  }
  const config = readForm();
  const useCloud = API_URL && $('useCloud').checked;
  setBusy(true, surprise ? `Brote sorpresa: ${surprise}…` : 'Preparando la ciudad…');
  const started = performance.now();
  try {
    const summary = useCloud ? await runCloud(config) : await runLocal(config);
    const seconds = (performance.now() - started) / 1000;
    $('busyText').textContent = 'Preparando el barrio…';
    $('progress').style.width = '100%';
    const first = !previous;
    if (first) {
      // Primera vez: se pasa a la pantalla del plan con la cortina.
      await new Promise((resolve) => wipe(() => {
        setBusy(false);
        $('resultsScreen').hidden = false;
        $('setupScreen').hidden = true;
        $('historia').hidden = true;
        screen = 'results';
        document.body.classList.add('on-results');
        document.querySelector('[data-screen="results"]').disabled = false;
        document.querySelectorAll('[data-screen]').forEach((b) => b.classList.toggle('on', b.dataset.screen === 'results'));
        scrollTo(0, 0);
        render(summary, seconds);
        resolve();
      }));
    } else {
      if (screen !== 'results') showScreen('results');
      render(summary, seconds);
    }
    if (surprise && previous) showChanges(previous, summary, surprise);
    else $('changes').hidden = true;
    previous = summary;
    await loadCity(summary);
    barrio.setActive(screen === 'results' && view === 'barrio');
  } catch (err) {
    // El motor nombra los datos por su nombre interno; se cambia por la etiqueta que ve la persona.
    const key = err.message.split(' ')[0];
    const el = form.elements[key];
    const text = `No se pudo calcular: ${el ? err.message.replace(key, `"${labelOf(el)}"`) : err.message}`;
    $('status').textContent = text;
    showToast(text);
  } finally {
    setBusy(false);
  }
}

// Los números grandes suben de 0 a su valor.
function countUp(el, value, format = fmt) {
  if (reduced) return (el.textContent = format(value));
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 1100);
    el.textContent = format(value * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// El plan en pocas líneas, cada una con su ícono.
function planItems(s) {
  const c = s.config;
  const p = s.policy;
  const items = [];
  if (p.quarantine) items.push(['i-house-q', `<b>Aislar la casa</b> de cada caso reportado desde el día ${c.responseStartDay}`]);
  if (c.dosesPerDay > 0) items.push(['i-syringe', `<b>${fmt(c.dosesPerDay)} vacunas al día</b> para ${PRIORITY_SHORT[p.priority]}`]);
  if (p.closures) {
    const often = s.closures.filter((x) => x.share >= 0.25).slice(0, 2);
    const where = often.map((x) => (x.layer === 'mercado' ? `el mercado de ${x.parroquia}` : `los colegios de ${x.parroquia}`));
    items.push(['i-lock', where.length ? `<b>Cerrar ${where.join(' y ')}</b> solo cuando suban los casos` : '<b>Cerrar mercados o colegios</b> solo si suben los casos']);
  } else items.push(['i-market', '<b>No cerrar</b> mercados ni colegios: rinde más otra cosa']);
  if (c.vectorBorne && p.fumigation) items.push(['i-spray', '<b>Fumigar</b> las zonas donde aparecen casos']);
  if (p.reserve > 0) items.push(['i-coins', `<b>Guardar el ${pct(p.reserve)}</b> del dinero para todo el brote`]);
  return items.map(([ic, t]) => `<li><svg class="ic"><use href="#${ic}"/></svg><span>${t}</span></li>`).join('');
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// El informe para la alcaldía, con títulos y pasos numerados (el texto se escapa antes de insertarlo).
function reportHtml(text) {
  const out = [];
  let list = false;
  for (const line of text.split('\n').slice(1)) {
    const numbered = /^\d+\.\s/.test(line);
    if (list && !numbered) { out.push('</ol>'); list = false; }
    if (!line) continue;
    if (line === line.toUpperCase()) out.push(`<h5>${esc(line[0] + line.slice(1).toLowerCase())}</h5>`);
    else if (numbered) { if (!list) { out.push('<ol>'); list = true; } out.push(`<li>${esc(line.replace(/^\d+\.\s*/, ''))}</li>`); }
    else out.push(`<p>${esc(line)}</p>`);
  }
  if (list) out.push('</ol>');
  return out.join('');
}

function render(s, seconds) {
  const T = terms();
  const sc = SCENARIOS[scenario];
  const city = CITIES[s.config.city];
  const where = s.engine === 'aws' ? 'en AWS Lambda' : 'en este navegador';
  $('status').textContent = `Listo: ${s.runs} simulaciones ${where} en ${seconds.toFixed(1).replace('.', ',')} s.`;

  $('planTitle').textContent = `El plan para ${city.name}`;
  countUp($('kSavedNone'), s.savedVsNone.mean);
  $('savedLabel').textContent = `personas que no terminan ${T.bittenM} gracias al plan`;
  const fizzled = s.runs - s.takeoffRuns;
  $('headline').textContent = `Promedio de ${fmt(s.runs)} simulaciones, comparado con no hacer nada.${fizzled > 0 ? ` En ${fizzled} de ellas el brote se apagó solo.` : ''}`;
  $('planSteps').innerHTML = planItems(s);
  renderVerdict(s);

  countUp($('kSavedRandom'), s.savedVsRandom.mean);
  $('kWin').textContent = s.takeoffRuns ? pct(s.winRateVsRandom) : 'Sin datos';
  $('kWinNote').textContent = s.takeoffRuns ? `de los brotes le gana al azar (${s.takeoffRuns} de ${s.runs} crecieron)` : 'ningún brote llegó a crecer';
  countUp($('kCost'), s.strategies.adaptativa.spent.mean, usd);
  $('kCostNote').textContent = `gastados de ${usd(s.config.budget)}`;
  $('kRuns').textContent = fmt(s.runs);
  $('kRunsNote').textContent = `simulaciones ${where}, en ${seconds.toFixed(1).replace('.', ',')} s`;

  const tbody = $('compare').querySelector('tbody');
  tbody.innerHTML = '';
  for (const key of ['nada', 'azar', 'adaptativa']) {
    const x = s.strategies[key];
    const tr = document.createElement('tr');
    if (key === 'adaptativa') tr.className = 'best';
    for (const text of [LABELS[key], fmt(x.infected.mean), `${fmt(x.infected.p5)} a ${fmt(x.infected.p95)}`, fmt(x.peak.mean), usd(x.spent.mean)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  const a = s.strategies.adaptativa;
  $('wasted').textContent =
    `Vacunas puestas a casos ya reportados: ${a.wastedVisible}. Unas ${fmt(a.wastedHidden.mean)} dosis caen en personas ${T.bitten} que aún no tienen síntomas: nadie puede distinguirlas de una persona sana.`;

  $('report').innerHTML = reportHtml(mayorReport(s, { theme: sc.theme, disease: sc.disease }));

  $('nPolicies').textContent = s.ranking.length;
  const rtbody = $('ranking').querySelector('tbody');
  rtbody.innerHTML = '';
  $('ranking').classList.toggle('no-fum', !s.config.vectorBorne);
  s.ranking.slice(0, 3).forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'best';
    const fumigation = r.policy.fumigation ? 'Sí' : 'No';
    for (const text of [i + 1, PRIORITY[r.policy.priority], r.policy.closures ? 'Sí' : 'No', r.policy.quarantine ? 'Sí' : 'No', fumigation, fmt(r.infected), usd(r.spent)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    rtbody.appendChild(tr);
  });

  $('footer').textContent =
    `${city.name} tiene ${fmt(s.config.realPopulation)} habitantes urbanos y cada persona simulada representa a ${fmt(s.scale)}. ` +
    `Semilla ${s.config.seed}, huella ${s.configHash}: con la misma semilla y los mismos datos sale el mismo resultado.`;

  drawChart(s);
}

// ¿Ganar fue suerte? Prueba de signos sobre los brotes que crecieron.
function renderVerdict(s) {
  const box = $('verdict');
  if (!s.verdictVsRandom) {
    box.hidden = true;
    return;
  }
  const luck = (p) => (p < 0.001 ? 'no es suerte: menos de 1 en 1.000' : `probabilidad de que sea suerte: ${(p * 100).toFixed(1).replace('.', ',')} %`);
  const line = (v, name) =>
    `<div class="${v.passed ? 'ok' : 'ko'}"><b>${v.passed ? 'Le gana' : 'No le gana con claridad'}</b> a ${name} en ${v.wins} de ${s.takeoffRuns} brotes (${luck(v.p)}).</div>`;
  box.innerHTML = line(s.verdictVsNone, 'no hacer nada') + line(s.verdictVsRandom, 'repartir lo mismo al azar');
  box.hidden = false;
}

const AXIS = { ticks: { color: '#b5a5c2' }, grid: { color: '#2a1d35' } };
function drawChart(s) {
  if (!window.Chart) return;
  const labels = s.strategies.nada.curve.mean.map((_, d) => d);
  const datasets = [];
  for (const key of ['nada', 'azar', 'adaptativa']) {
    const c = s.strategies[key].curve;
    datasets.push(
      { label: `${key}:alto`, data: c.p95, borderWidth: 0, pointRadius: 0, fill: false, borderColor: 'transparent' },
      { label: `${key}:bajo`, data: c.p5, borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: `${COLORS[key]}26`, borderColor: 'transparent' },
      { label: LABELS[key], data: c.mean, borderColor: COLORS[key], borderWidth: key === 'adaptativa' ? 3 : 2.2, pointRadius: 0, fill: false, tension: 0.25 },
    );
  }
  if (chart) chart.destroy();
  chart = new window.Chart($('curve'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduced ? false : { duration: 1200, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ...AXIS, title: { display: true, text: 'Día', color: '#b5a5c2' }, ticks: { ...AXIS.ticks, maxTicksLimit: 12 } },
        y: { ...AXIS, title: { display: true, text: 'Personas', color: '#b5a5c2' }, ticks: { ...AXIS.ticks, callback: (v) => fmt(v) } },
      },
      plugins: {
        legend: { labels: { color: '#f4ecdc', boxWidth: 14, filter: (item) => !item.text.includes(':') } },
        tooltip: { filter: (item) => !item.dataset.label.includes(':'), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
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
      labels: c.observed.map((_, w) => `Semana ${w + 1}`),
      datasets: [
        { type: 'bar', label: 'Casos reales (MSP)', data: c.observed, backgroundColor: '#ff751899', borderWidth: 0 },
        { type: 'line', label: 'Lo que da el motor', data: c.model, borderColor: '#8be04e', borderWidth: 2.4, pointRadius: 0, tension: 0.3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ...AXIS, ticks: { ...AXIS.ticks, maxTicksLimit: 8 } },
        y: { ...AXIS, title: { display: true, text: 'Casos por semana', color: '#b5a5c2' } },
      },
      plugins: { legend: { labels: { color: '#f4ecdc', boxWidth: 14 } } },
    },
  });
  $('calibNote').innerHTML =
    `Dengue en Manabí, 2024: ${fmt(c.observed.reduce((x, y) => x + y, 0))} casos del ` +
    `<a href="${DENGUE_MANABI_2024.url}" target="_blank" rel="noopener">Ministerio de Salud Pública</a>. ` +
    `El motor, sin intervenir, sigue la curva real (R² de ${String(c.r2).replace('.', ',')}) con cada caso contagiando a ${String(c.r0).replace('.', ',')} personas.`;
}

form.addEventListener('input', updateOutputs);
// Calcular: un zombi se lanza contra la cámara y se traga la pantalla mientras el Comité empieza a calcular.
function zombieCut() {
  const cut = SCENARIOS[scenario].ui.cut;
  if (cut !== 'zombi') return swarmCut(cut === 'mosquito' ? 'i-mosquito' : 'i-virus');
  const v = $('zombieCut');
  if (reduced || !v.canPlayType('video/mp4')) return;
  v.hidden = false;
  v.classList.remove('out');
  v.currentTime = 0;
  v.volume = 0.55;
  v.play().catch(() => (v.hidden = true));
  const end = () => {
    v.classList.add('out');
    setTimeout(() => { v.hidden = true; v.pause(); }, 600);
  };
  v.onended = end;
  setTimeout(() => !v.hidden && !v.classList.contains('out') && end(), 6000);
}
// Gripe y dengue: una nube de virus o de mosquitos cubre la pantalla y se disipa.
function swarmCut(icon) {
  if (reduced) return;
  const box = document.createElement('div');
  box.className = 'swarm';
  box.innerHTML = Array.from({ length: 46 }, (_, k) => {
    const a = (k / 46) * Math.PI * 2;
    const style = `--x:${Math.cos(a) * 70}vw;--y:${Math.sin(a) * 70}vh;--d:${(k % 7) * 0.05}s;--s:${0.8 + (k % 5) * 0.35}`;
    return `<svg class="ic" style="${style}"><use href="#${icon}"/></svg>`;
  }).join('');
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2000);
}
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!busy && !checkForm()) zombieCut();
  simulate();
});
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'radio') {
    e.preventDefault();
    simulate();
  }
});
$('resetBtn').addEventListener('click', () => applyScenario(scenario, keepRun()));
$('copyBtn').addEventListener('click', () => navigator.clipboard?.writeText($('report').innerText));
for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => {
    const current = readForm();
    setForm({ ...current, ...PRESETS[button.dataset.preset](current) });
    simulate(PRESET_LABELS[button.dataset.preset]);
  });
}

if (API_URL) $('cloudRow').hidden = false;
applyScenario('zombi', { runs: 100 });
const whenLoaded = (fn) => (document.readyState === 'complete' ? fn() : window.addEventListener('load', fn));
whenLoaded(() => {
  drawCalibration();
  $('zombieCut').preload = 'auto'; // el video del zombi se baja cuando la página ya cargó
});
