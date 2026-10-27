import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handler as simulate } from '../src/lambda/simulate.mjs';
import { handler as batch } from '../src/lambda/batch.mjs';
import { runBatch } from '../src/engine/index.js';

// Sin RESULTS_BUCKET ni WORKER_FUNCTION la Lambda corre en modo local (sin caché ni reparto).
const SMALL = { agents: 3000, runs: 6, days: 80, optimizeRuns: 2 };

test('POST /simulate devuelve el resumen con la política elegida', async () => {
  const res = await simulate({ body: JSON.stringify({ config: SMALL }) });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.engine, 'aws');
  assert.equal(body.runs, 6);
  assert.ok(body.policy.priority);
  assert.equal(body.ranking.length, 21);
});

test('POST /simulate rechaza parámetros inválidos con 400', async () => {
  const res = await simulate({ body: JSON.stringify({ config: { r0: 99 } }) });
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /r0/);
});

test('POST /simulate rechaza demasiadas simulaciones', async () => {
  const res = await simulate({ body: JSON.stringify({ config: { runs: 5000 } }) });
  assert.equal(res.statusCode, 400);
});

test('el lote de Lambda da lo mismo que el motor del navegador', async () => {
  const policy = { priority: 'anillo', closures: true, quarantine: true };
  const fromLambda = await batch({ config: SMALL, policy, from: 2, count: 3 });
  assert.deepEqual(fromLambda, runBatch(SMALL, policy, 2, 3));
});
