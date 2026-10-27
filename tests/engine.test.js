import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, expNeg, hashSeed } from '../src/engine/rng.js';
import {
  makeConfig,
  configHash,
  buildPopulation,
  simulateRun,
  runBatch,
  aggregate,
  optimizePolicy,
  runMonteCarlo,
  mayorReport,
  headline,
} from '../src/engine/index.js';

const SMALL = { agents: 3000, runs: 8, days: 90, optimizeRuns: 2 };

test('expNeg coincide con Math.exp', () => {
  for (const x of [0, 1e-6, 0.01, 0.5, 1, 2.5, 10, 50]) {
    assert.ok(Math.abs(expNeg(x) - Math.exp(-x)) < 1e-12, `x=${x}`);
  }
});

test('el generador es determinista', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  for (let i = 0; i < 1000; i++) assert.equal(a.nextU32(), b.nextU32());
  assert.notEqual(new Rng(1).nextU32(), new Rng(2).nextU32());
  assert.equal(hashSeed(2026, 'corrida', 3), hashSeed(2026, 'corrida', 3));
});

test('misma configuración y semilla => mismo resultado', () => {
  const policy = { priority: 'anillo', closures: true, quarantine: true };
  const a = runBatch(SMALL, policy);
  const b = runBatch(SMALL, policy);
  assert.deepEqual(a, b);
  assert.equal(configHash(makeConfig(SMALL)), configHash(makeConfig(SMALL)));
});

test('otra semilla => otro resultado', () => {
  const policy = { priority: 'anillo', closures: true, quarantine: true };
  const a = runBatch({ ...SMALL, seed: 1 }, policy);
  const b = runBatch({ ...SMALL, seed: 2 }, policy);
  assert.notDeepEqual(a.map((r) => r.nada.infected), b.map((r) => r.nada.infected));
});

test('un lote parcial da lo mismo que esas corridas dentro del total (para repartir en Lambda)', () => {
  const policy = { priority: 'mixto', closures: false, quarantine: true };
  const all = runBatch(SMALL, policy);
  const part = runBatch(SMALL, policy, 3, 2);
  assert.deepEqual(part, all.slice(3, 5));
});

test('nunca se vacuna a un caso reportado (zombi o exorcizado conocido)', () => {
  for (const r0 of [1.8, 3.6]) {
    const runs = runBatch({ ...SMALL, r0, detectionProb: 1 }, { priority: 'conectados', closures: true, quarantine: true });
    for (const r of runs) {
      assert.equal(r.adaptativa.wastedVisible, 0);
      assert.equal(r.azar.wastedVisible, 0);
    }
  }
});

test('el gasto nunca supera el presupuesto', () => {
  const budget = 50000;
  const runs = runBatch({ ...SMALL, budget, r0: 3 }, { priority: 'anillo', closures: true, quarantine: true });
  for (const r of runs) {
    for (const s of ['nada', 'azar', 'adaptativa']) assert.ok(r[s].spent <= budget + 1e-6, `${s} gastó ${r[s].spent}`);
  }
});

test('la línea base "azar" usa los mismos recursos que la estrategia', () => {
  const cfg = makeConfig({ ...SMALL, r0: 2.5 });
  const pop = buildPopulation(cfg);
  const policy = { priority: 'anillo', closures: true, quarantine: true };
  for (let seed = 1; seed <= 5; seed++) {
    const adaptive = simulateRun(pop, cfg, 'adaptativa', seed, null, policy);
    const random = simulateRun(pop, cfg, 'azar', seed, adaptive);
    assert.equal(random.dosesUsed, adaptive.dosesUsed);
    assert.equal(random.closures.length, adaptive.closures.length);
    assert.equal(random.quarantines, adaptive.quarantines);
  }
});

test('"nada" no gasta ni interviene', () => {
  const cfg = makeConfig(SMALL);
  const res = simulateRun(buildPopulation(cfg), cfg, 'nada', 7);
  assert.equal(res.spent, 0);
  assert.equal(res.dosesUsed, 0);
  assert.equal(res.closures.length, 0);
});

test('la población conserva el estado: S+E+I+R = N cada día', () => {
  const cfg = makeConfig({ ...SMALL, r0: 3 });
  const res = simulateRun(buildPopulation(cfg), cfg, 'nada', 11);
  for (let d = 0; d <= cfg.days; d++) {
    assert.equal(res.daily.S[d] + res.daily.E[d] + res.daily.I[d] + res.daily.R[d], cfg.agents);
  }
});

test('el optimizador elige una política y la estrategia gana a las líneas base en promedio', () => {
  const cfg = { agents: 4000, runs: 16, r0: 2.5, optimizeRuns: 3 };
  const opt = optimizePolicy(cfg);
  assert.ok(opt.best.priority);
  const s = aggregate(cfg, runBatch(cfg, opt.best));
  assert.ok(s.savedVsNone.mean > 0, 'debe salvar gente frente a no hacer nada');
  assert.ok(s.savedVsRandom.mean > 0, 'debe salvar gente frente al azar');
});

test('valida parámetros fuera de rango o desconocidos', () => {
  assert.throws(() => makeConfig({ r0: 50 }));
  assert.throws(() => makeConfig({ inventado: 1 }));
  assert.throws(() => makeConfig({ start: 'mercado:Quito' }));
});

test('el informe para el alcalde se genera en lenguaje simple', () => {
  const s = runMonteCarlo(SMALL);
  const text = mayorReport(s);
  assert.match(text, /QUÉ HACER/);
  assert.match(text, /semilla/);
  assert.match(headline(s), /salva en promedio/);
});

test('la animación reproduce exactamente la corrida del Monte Carlo (grabar no cambia el resultado)', async () => {
  const { traceRun } = await import('../src/engine/index.js');
  const policy = { priority: 'anillo', closures: true, quarantine: true, reserve: 0.5 };
  const cfg = { ...SMALL, r0: 2.5 };
  const runs = runBatch(cfg, policy);
  const s = aggregate(cfg, runs);
  const t = traceRun(cfg, policy, s.representativeRun);
  const r = runs[s.representativeRun];
  for (const k of ['nada', 'azar', 'adaptativa']) {
    assert.equal(t[k].infected, r[k].infected, k);
    // El último cuadro coincide con los conteos del día final.
    const last = t[k].frames.subarray(cfg.days * t.N);
    const zombies = [...last].filter((c) => (c & 7) === 2).length;
    assert.equal(zombies, t[k].I[cfg.days]);
  }
  assert.equal(t.layout.x.length, t.N);
});

test('prueba de signos: valores conocidos', async () => {
  const { signTestP } = await import('../src/engine/montecarlo.js');
  assert.equal(signTestP(0, 0), 1);
  assert.ok(Math.abs(signTestP(10, 0) - 1 / 1024) < 1e-12); // 10 de 10: (1/2)^10
  assert.ok(Math.abs(signTestP(5, 5) - 0.623046875) < 1e-9); // P(X >= 5 | n=10)
  assert.ok(signTestP(90, 10) < 1e-15);
});

test('fumigación: solo con plaga por mosquito, y el azar fumiga lo mismo', () => {
  const policy = { priority: 'anillo', closures: false, quarantine: false, reserve: 0.5, fumigation: true };
  const plain = makeConfig({ ...SMALL, r0: 2.5 });
  const res = simulateRun(buildPopulation(plain), plain, 'adaptativa', 3, null, policy);
  assert.equal(res.fumigations.length, 0, 'sin mosquito no hay fumigación');

  const cfg = makeConfig({ ...SMALL, r0: 2.5, vectorBorne: true, latentMin: 8, latentMax: 14, infectiousMin: 3, infectiousMax: 7 });
  const pop = buildPopulation(cfg);
  let total = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const adaptive = simulateRun(pop, cfg, 'adaptativa', seed, null, policy);
    const random = simulateRun(pop, cfg, 'azar', seed, adaptive);
    assert.equal(random.fumigations.length, adaptive.fumigations.length);
    total += adaptive.fumigations.length;
  }
  assert.ok(total > 0, 'con mosquito y brote, la estrategia fumiga');
});

test('con mosquito, el optimizador también prueba políticas con fumigación', async () => {
  const { candidatePolicies } = await import('../src/engine/montecarlo.js');
  assert.equal(candidatePolicies(makeConfig({})).length, 21);
  const withVector = candidatePolicies(makeConfig({ vectorBorne: true }));
  assert.ok(withVector.length > 21);
  assert.ok(withVector.some((p) => p.fumigation));
});
