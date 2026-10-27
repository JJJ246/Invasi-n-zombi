// Traduce los resultados del Monte Carlo a decisiones en lenguaje simple.
// Es una plantilla determinista: no depende de ningún servicio externo y nunca falla en vivo.

const n = (x) => Math.round(x).toLocaleString('es-EC');
const pct = (x) => `${Math.round(x * 100)} %`;
const usd = (x) => `USD ${n(x)}`;
const dec = (x) => x.toLocaleString('es-EC', { maximumFractionDigits: 2 });

const PRIORITY_TEXT = {
  anillo: 'las personas que conviven, estudian, trabajan o viajan con casos reportados, empezando por las que tienen más contactos',
  mixto: 'una mezcla entre el entorno de los casos reportados y las personas con más contactos de la ciudad',
  conectados: 'las personas con más contactos diarios de la ciudad (estudiantes, trabajadores y usuarios de bus), sin esperar a los casos',
};

const START_TEXT = (start) => {
  if (start === 'aleatorio') return 'en un punto al azar de la ciudad';
  if (start === 'colegio') return 'en un colegio';
  const [kind, place] = start.split(':');
  return kind === 'mercado' ? `en el mercado de ${place}` : `en la parroquia ${place}`;
};

export function headline(summary) {
  const s = summary;
  return (
    `La estrategia del Comité salva en promedio ${n(s.savedVsNone.mean)} personas frente a no hacer nada ` +
    `y ${n(s.savedVsRandom.mean)} frente a actuar al azar con los mismos recursos. ` +
    `En los brotes que despegan (${s.takeoffRuns} de ${s.runs} simulaciones), gana a la acción al azar en el ${pct(s.winRateVsRandom)} de los casos.`
  );
}

export function mayorReport(summary) {
  const s = summary;
  const c = s.config;
  const none = s.strategies.nada;
  const adaptive = s.strategies.adaptativa;
  const policy = s.policy ?? { priority: 'anillo', closures: true, quarantine: true };
  const lines = [];

  lines.push('INFORME PARA EL ALCALDE DE MANTA');
  lines.push('');
  lines.push('LA SITUACIÓN');
  // Período latente largo = plaga tipo dengue (incluye la incubación dentro del mosquito).
  const disease = c.latentMin >= 8 ? 'al dengue de Manabí 2024 (calibrada con datos reales del MSP)' : 'a una influenza fuerte';
  lines.push(
    `Una plaga parecida ${disease} (cada caso contagia en promedio a ${dec(c.r0)} personas) empieza ${START_TEXT(c.start)}. ` +
      `Si no hacemos nada, en ${c.days} días serían mordidas ${n(none.infected.mean)} personas ` +
      `(entre ${n(none.infected.p5)} y ${n(none.infected.p95)} según la simulación), con el peor día alrededor del día ${Math.round(none.peakDay.mean)}.`,
  );
  lines.push('');
  lines.push('QUÉ HACER');
  let step = 1;
  if (policy.quarantine) {
    lines.push(
      `${step++}. Desde el día ${c.responseStartDay}: aislar ${c.quarantineDays} días el hogar de cada caso reportado ` +
        `y apoyarlo con comida e ingresos (${usd(c.quarantineCostPerHouseholdDay)} por hogar y día). En promedio son ${n(adaptive.quarantines.mean)} hogares.`,
    );
  }
  if (policy.reserve > 0) {
    lines.push(
      `${step++}. No gastar todo en vacunas: guardar el ${Math.round(policy.reserve * 100)} % del presupuesto ` +
        `(${usd(c.budget * policy.reserve)}) para ${c.vectorBorne ? 'cuarentenas, cierres y fumigación' : 'cuarentenas y cierres'}, que se necesitan durante todo el brote.`,
    );
  }
  if (c.dosesPerDay > 0) {
    const top = s.dosesByParroquia.slice(0, 2).map((x) => x.parroquia).join(' y ');
    lines.push(
      `${step++}. Desde el día ${c.vaccineStartDay}: aplicar las ${n(c.dosesPerDay)} vacunas que llegan cada día a ${PRIORITY_TEXT[policy.priority]}. ` +
        `Las parroquias que más dosis necesitan son ${top}. Nunca vacunar a quien ya es un caso reportado.`,
    );
  }
  if (policy.closures) {
    const frequent = s.closures.filter((x) => x.share >= 0.25).slice(0, 4);
    if (frequent.length) {
      for (const x of frequent) {
        const place = x.layer === 'mercado' ? `el mercado de ${x.parroquia}` : `los colegios de ${x.parroquia}`;
        lines.push(
          `${step++}. Cerrar ${place} durante ${c.closeDays} días cuando los casos reportados en la parroquia superen el ` +
            `${dec((x.layer === 'mercado' ? c.marketCloseThreshold : c.schoolCloseThreshold) * 100)} % (pasó en el ${pct(x.share)} de las simulaciones, normalmente cerca del día ${x.typicalDay}).`,
        );
      }
    } else {
      lines.push(`${step++}. Tener listos los cierres de mercados y colegios por parroquia, pero solo usarlos si los casos reportados superan el umbral.`);
    }
  } else {
    lines.push(`${step++}. No cerrar mercados ni colegios: con este escenario, el dinero rinde más en aislamiento de hogares y vacunas.`);
  }
  if (c.vectorBorne && policy.fumigation) {
    const where = (s.fumigations ?? []).filter((f) => f.share >= 0.25).map((f) => `${f.parroquia} (cerca del día ${f.typicalDay})`);
    lines.push(
      `${step++}. Enviar brigadas de fumigación ${c.fumigationDays} días a cada parroquia donde los casos reportados superen el ` +
        `${dec(c.fumigationThreshold * 100)} %${where.length ? `; normalmente se necesitan en ${where.join(', ')}` : ''}.`,
    );
  } else if (c.vectorBorne) {
    lines.push(`${step++}. No fumigar en este escenario: con este presupuesto rinde más aislar hogares y vacunar.`);
  }
  lines.push('');
  lines.push('QUÉ VAMOS A LOGRAR');
  lines.push(
    `Con este plan serían mordidas ${n(adaptive.infected.mean)} personas en promedio (entre ${n(adaptive.infected.p5)} y ${n(adaptive.infected.p95)}). ` +
      `Eso son ${n(s.savedVsNone.mean)} personas salvadas frente a no hacer nada y ${n(s.savedVsRandom.mean)} frente a repartir los mismos recursos al azar.`,
  );
  lines.push(`Costo promedio: ${usd(adaptive.spent.mean)} de un presupuesto de ${usd(c.budget)}.`);
  lines.push('');
  lines.push('CÓMO LO SABEMOS');
  lines.push(
    `Simulamos la ciudad ${s.runs} veces con la semilla ${c.seed} (huella de la configuración ${s.configHash}). ` +
      `La misma semilla da siempre el mismo resultado. Todos los supuestos y sus fuentes están en el README del proyecto.`,
  );
  return lines.join('\n');
}
