// "Modo Vecino": detrás de cada punto hay una persona. Al tocarla se ve su rutina, qué le pasa en las
// tres realidades (no hacer nada / al azar / Comité), quién la mordió y dónde, la cadena de contagio hasta
// el paciente cero y por qué el Comité la vacunó. Nombres, edades y oficios son ILUSTRATIVOS (se generan
// con la semilla); hogar, rutina, contagios y vacunas salen de la simulación.
import { hashSeed, Rng } from './engine/rng.js';
import { CITIES } from './engine/cities.js';

const FEMALE = ['María', 'Ana', 'Rosa', 'Carmen', 'Jessenia', 'Lucía', 'Valeria', 'Gabriela', 'Mercedes', 'Dayana', 'Fernanda', 'Narcisa', 'Paola', 'Camila', 'Johanna', 'Mayra', 'Luz', 'Betty', 'Doménica', 'Kerly'];
const MALE = ['José', 'Carlos', 'Luis', 'Jorge', 'Byron', 'Andrés', 'Javier', 'Washington', 'Kevin', 'Steven', 'Ramón', 'Pedro', 'Jefferson', 'Mateo', 'Holger', 'Ángel', 'Bryan', 'Marlon', 'Segundo', 'Fabricio'];
const SURNAMES = ['Zambrano', 'Mendoza', 'Delgado', 'Cedeño', 'Vera', 'Macías', 'Moreira', 'Alcívar', 'Mero', 'Pinargote', 'Intriago', 'Loor', 'Chávez', 'García', 'Pico', 'Anchundia', 'Reyes', 'Bravo', 'Quijije', 'Palma'];
const JOBS = [
  ['pescadora', 'pescador'], ['trabaja en una atunera', 'trabaja en una atunera'], ['comerciante', 'comerciante'],
  ['taxista', 'taxista'], ['profesora', 'profesor'], ['enfermera', 'enfermero'], ['cocinera', 'cocinero'],
  ['vendedora en el puerto', 'vendedor en el puerto'], ['oficinista', 'oficinista'], ['guardia', 'guardia'],
  ['costurera', 'mecánico'], ['cajera', 'albañil'],
];
// Nombre de la zona de la persona i en la ciudad de la animación.
let zoneNames = CITIES.manta.zones;
const zone = (p, i) => zoneNames[p.parroquia[i]];
const PLACE = {
  0: () => 'en su casa',
  1: () => 'en el colegio',
  2: () => 'en el trabajo',
  3: (p, i) => `en el bus (línea ${p.bus[i] + 1})`,
  4: (p, i) => `en el mercado de ${zone(p, i)}`,
  5: (p, i) => `en el barrio (${zone(p, i)})`,
};
// Vocabulario: "mordida" en la demo zombi, "contagiada" en un brote real.
let real = false;
const bitten = (who) => (real ? (who.female ? 'Contagiada' : 'Contagiado') : who.female ? 'Mordida' : 'Mordido');
const STRATS = [
  ['nada', 'Si nadie hace nada'],
  ['azar', 'Si se actúa al azar'],
  ['adaptativa', 'Con el plan del Comité'],
];
// Color del "plumbob" (el rombo de los Sims) según el estado del día en la realidad del Comité.
const STATE_COLOR = ['#4ade80', '#facc15', '#ff3b3b', '#60a5fa', '#2dd4bf'];
const STATE_TEXT = {
  zombi: [['Sana', 'Sano'], ['Mordida (aún no se nota)', 'Mordido (aún no se nota)'], ['Zombi', 'Zombi'], ['Exorcizada (recuperada)', 'Exorcizado (recuperado)'], ['Vacunada y protegida', 'Vacunado y protegido']],
  real: [['Sana', 'Sano'], ['Contagiada sin síntomas', 'Contagiado sin síntomas'], ['Contagiosa', 'Contagioso'], ['Recuperada', 'Recuperado'], ['Vacunada y protegida', 'Vacunado y protegido']],
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function persona(trace, i) {
  const p = trace.people;
  const rng = new Rng(hashSeed(trace.seed, 'vecino', i));
  const female = rng.next() < 0.5;
  const role = p.role[i];
  let age;
  let what;
  if (role === 1) {
    age = rng.between(6, 17);
    what = age < 12 ? 'va a la escuela' : 'estudia en el colegio';
  } else if (role === 2) {
    age = rng.between(19, 62);
    what = JOBS[rng.int(JOBS.length)][female ? 0 : 1];
  } else {
    const r = rng.next();
    if (r < 0.3) [age, what] = [rng.between(1, 5), 'se queda en casa (aún no va a la escuela)'];
    else if (r < 0.65) [age, what] = [rng.between(25, 60), 'trabaja en su casa'];
    else [age, what] = [rng.between(65, 88), female ? 'jubilada' : 'jubilado'];
  }
  // Mismo apellido para todo el hogar.
  const surname = SURNAMES[new Rng(hashSeed(trace.seed, 'hogar', p.home[i])).int(SURNAMES.length)];
  const first = (female ? FEMALE : MALE)[rng.int(20)];
  // Iniciales sobre un color propio (estable para cada persona).
  const initials = `${first[0]}${surname[0]}`;
  const color = `hsl(${Math.floor(rng.next() * 360)}, 55%, 72%)`;
  return { i, name: `${first} ${surname}`, first, female, age, what, initials, color };
}

const a = (who, f, m) => (who.female ? f : m);

function fate(trace, strategy, i) {
  const s = trace[strategy].story;
  const p = trace.people;
  const day = s.infectedDay[i];
  const vax = s.vaccinatedDay[i];
  const who = persona(trace, i);
  if (day === 0) return { cls: 'z', text: `Es el paciente cero: el brote empieza con ${a(who, 'ella', 'él')}.` };
  if (day > 0) {
    const by = s.infectedBy[i];
    const place = PLACE[s.infectedLayer[i]](p, i);
    const biter = by >= 0 ? ` por ${persona(trace, by).name}` : '';
    const vaxNote = vax >= 0 && vax < day ? ` Se vacunó el día ${vax}, pero la vacuna no le hizo efecto.` : vax >= 0 ? ` La vacunaron el día ${vax}, cuando ya estaba ${bitten(who).toLowerCase()} sin saberlo.` : '';
    return { cls: 'z', text: `${bitten(who)} el día ${day} ${place}${biter}.${vaxNote}` };
  }
  const never = real ? 'Nunca se contagió.' : `Nunca ${a(who, 'la', 'lo')} mordieron.`;
  if (vax >= 0) return { cls: 'v', text: `${a(who, 'Vacunada', 'Vacunado')} el día ${vax}. ${never}` };
  return { cls: 's', text: never };
}

function chain(trace, strategy, i, max = 12) {
  const s = trace[strategy].story;
  const out = [];
  let cur = i;
  const seen = new Set();
  while (cur >= 0 && !seen.has(cur) && out.length < max) {
    seen.add(cur);
    out.push(cur);
    cur = s.infectedBy[cur];
  }
  const last = out[out.length - 1];
  return { steps: out, complete: s.infectedDay[last] === 0, truncated: cur >= 0 };
}

function whyVaccinated(trace, i, who) {
  const s = trace.adaptativa.story;
  const day = s.vaccinatedDay[i];
  if (day < 0) return null;
  const contacts = Math.round(trace.people.connectivity[i]);
  if (s.vaxReason[i] === 1) {
    const place = s.vaxLayer[i] >= 0 ? PLACE[s.vaxLayer[i]](trace.people, i) : 'cerca';
    return `El día ${day} había casos reportados cerca: el mayor riesgo lo tenía ${place}. Además tiene unos ${contacts} contactos por día, así que si se contagiaba podía morder a muchos. Por eso ${a(who, 'fue de las primeras', 'fue de los primeros')} en la fila.`;
  }
  if (s.vaxReason[i] === 2) return `El día ${day} todavía no había focos cerca, así que el Comité protegió a las personas más conectadas de la ciudad: tiene unos ${contacts} contactos por día (bus, colegio o trabajo).`;
  return `${a(who, 'Vacunada', 'Vacunado')} el día ${day}.`;
}

// Vecinos con historia: mordidos sin hacer nada, a salvo con el Comité (y si fue por la vacuna, mejor).
export function interestingPeople(trace) {
  const n = trace.nada.story;
  const c = trace.adaptativa.story;
  const list = [];
  for (let i = 0; i < trace.N; i++) {
    if (n.infectedDay[i] > 0 && c.infectedDay[i] < 0) {
      const steps = chain(trace, 'nada', i).steps.length;
      list.push({ i, score: (c.vaccinatedDay[i] >= 0 ? 4 : 0) + Math.min(steps, 6) + (trace.people.role[i] ? 1 : 0) });
    }
  }
  list.sort((x, y) => y.score - x.score || x.i - y.i);
  return list.slice(0, 60).map((x) => x.i);
}

export function renderVecino(el, trace, i, day, theme = 'zombi') {
  real = theme === 'real';
  zoneNames = CITIES[trace.city].zones;
  const p = trace.people;
  const who = persona(trace, i);
  const code = trace.adaptativa.frames[day * trace.N + i] & 7;
  const routine = [`Vive en ${zone(p, i)}, ${p.homeSize[i] === 1 ? a(who, 'sola', 'solo') : `con ${p.homeSize[i] - 1} ${p.homeSize[i] === 2 ? 'persona' : 'personas'}`}`];
  if (p.bus[i] >= 0) routine.push(`toma el bus de la línea ${p.bus[i] + 1}`);
  if (p.colegio[i] >= 0) routine.push(`va al colegio en ${zone(p, i)}`);
  if (p.trabajo[i] >= 0) routine.push(`trabaja en ${zone(p, i)}`);
  routine.push(`compra en el mercado de ${zone(p, i)}`);
  const maxC = 40;
  const contacts = p.connectivity[i];

  const fates = STRATS.map(([k, label]) => {
    const f = fate(trace, k, i);
    return `<li class="${k}"><span class="fate-label">${label}</span><span class="fate ${f.cls}">${esc(f.text)}</span></li>`;
  }).join('');

  const ch = chain(trace, 'nada', i);
  let chainHtml = '';
  if (ch.steps.length > 1 || trace.nada.story.infectedDay[i] === 0) {
    const s = trace.nada.story;
    const rows = ch.steps.map((k, idx) => {
      const pk = persona(trace, k);
      const d = s.infectedDay[k];
      const where = d === 0 ? 'paciente cero' : `día ${d}, ${PLACE[s.infectedLayer[k]](p, k)}`;
      return `<li><button type="button" class="link" data-person="${k}"><span class="mini" style="--c:${pk.color}">${pk.initials}</span>${esc(pk.name)}</button> <small>${esc(where)}</small>${idx === 0 ? ` <b>(${a(who, 'ella', 'él')})</b>` : ''}</li>`;
    }).join('');
    const tail = ch.complete ? '' : '<li><small>y la cadena sigue más atrás</small></li>';
    chainHtml = `<h4>Cadena de contagio si nadie hace nada <small>(de ${a(who, 'ella', 'él')} hacia el paciente cero)</small></h4><ol class="chain">${rows}${tail}</ol>`;
  }
  const why = whyVaccinated(trace, i, who);
  el.innerHTML = `
    <button type="button" class="close" aria-label="Cerrar"><svg class="ic"><use href="#i-close"/></svg></button>
    <div class="vecino-head">
      <div class="avatar" style="--c:${who.color}"><span class="plumbob" style="--p:${STATE_COLOR[code] ?? '#4ade80'}" title="Hoy, con el plan: ${STATE_TEXT[theme][code][who.female ? 0 : 1]}"></span>${who.initials}</div>
      <div>
        <h3>${esc(who.name)} <small>${who.age} años</small></h3>
        <p class="muted">${esc(who.what)}. Día ${day}, con el plan: <b style="color:${STATE_COLOR[code]}">${STATE_TEXT[theme][code][who.female ? 0 : 1]}</b></p>
        <div class="need"><span>Contactos al día</span><i><b style="width:${Math.min(100, (contacts / maxC) * 100)}%"></b></i><em>${Math.round(contacts)}</em></div>
      </div>
    </div>
    <p class="routine">${esc(routine.slice(0, -1).join(', '))} y ${esc(routine[routine.length - 1])}.</p>
    <h4>Qué le pasa en cada caso <small>(el mismo brote)</small></h4>
    <ul class="fates">${fates}</ul>
    ${why ? `<h4>Por qué ${a(who, 'la', 'lo')} vacunó el Comité</h4><p>${esc(why)}</p>` : ''}
    ${chainHtml}
    <p class="hint">Nombres, edades y oficios son ilustrativos. Hogar, rutina, contagios y vacunas salen de la simulación.</p>`;
}
