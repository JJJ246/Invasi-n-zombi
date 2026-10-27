// POST /simulate — coordina el Monte Carlo en AWS.
// 1) Si esta configuración ya se simuló, devuelve el resultado guardado en S3 (misma semilla = mismo resultado).
// 2) Optimiza la política una vez.
// 3) Reparte las corridas entre varias Lambdas "batch" en paralelo y junta los resultados.
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { makeConfig, configHash, optimizePolicy, runBatch, aggregate } from '../engine/index.js';

const lambda = new LambdaClient({});
const s3 = new S3Client({});
const { WORKER_FUNCTION, RESULTS_BUCKET } = process.env;
const MAX_RUNS = 1000; // límite para responder antes del tiempo máximo de API Gateway (30 s)
const LOCAL_RUNS = 60; // hasta aquí no vale la pena repartir
const MAX_PARALLEL = 8; // cuentas nuevas suelen tener 10 ejecuciones simultáneas

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function readCache(key) {
  if (!RESULTS_BUCKET) return null; // modo local (tests): sin caché
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: RESULTS_BUCKET, Key: key }));
    return JSON.parse(await res.Body.transformToString());
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404 || err.$metadata?.httpStatusCode === 403) return null;
    throw err;
  }
}

async function runInWorkers(cfg, policy) {
  const chunk = Math.ceil(cfg.runs / MAX_PARALLEL);
  const jobs = [];
  for (let from = 0; from < cfg.runs; from += chunk) {
    const count = Math.min(chunk, cfg.runs - from);
    jobs.push(
      lambda
        .send(new InvokeCommand({ FunctionName: WORKER_FUNCTION, Payload: JSON.stringify({ config: cfg, policy, from, count }) }))
        .then((res) => {
          const payload = JSON.parse(Buffer.from(res.Payload).toString());
          if (res.FunctionError) throw new Error(payload.errorMessage || 'Falló un lote de simulaciones');
          return payload;
        }),
    );
  }
  return (await Promise.all(jobs)).flat();
}

export async function handler(event) {
  let cfg;
  try {
    const body = JSON.parse(event.body || '{}');
    cfg = makeConfig(body.config || {});
  } catch (err) {
    return json(400, { error: err.message });
  }
  if (cfg.runs > MAX_RUNS) return json(400, { error: `En la nube se permiten hasta ${MAX_RUNS} simulaciones por consulta` });

  const hash = configHash(cfg);
  const key = `results/${hash}.json`;
  const cached = await readCache(key);
  if (cached) return json(200, { ...cached, cache: true });

  const started = Date.now();
  const optimization = optimizePolicy(cfg);
  const local = cfg.runs <= LOCAL_RUNS || !WORKER_FUNCTION;
  const runs = local ? runBatch(cfg, optimization.best) : await runInWorkers(cfg, optimization.best);
  const summary = {
    ...aggregate(cfg, runs),
    policy: optimization.best,
    ranking: optimization.ranking,
    engine: 'aws',
    seconds: (Date.now() - started) / 1000,
  };
  if (RESULTS_BUCKET) {
    await s3.send(new PutObjectCommand({ Bucket: RESULTS_BUCKET, Key: key, Body: JSON.stringify(summary), ContentType: 'application/json' }));
  }
  console.log(JSON.stringify({ hash, runs: cfg.runs, seconds: summary.seconds, policy: optimization.best }));
  return json(200, summary);
}
