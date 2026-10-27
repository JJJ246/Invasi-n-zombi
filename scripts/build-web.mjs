// Arma dist/ = web/ + el motor (src/engine) para que el navegador use exactamente el mismo código que Lambda.
// Uso: node scripts/build-web.mjs [URL_DE_LA_API]
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const apiUrl = process.argv[2] ?? '';
rmSync(`${root}dist`, { recursive: true, force: true });
// Sin la basura de macOS (._* y .DS_Store) que aparece en discos externos.
const filter = (src) => !/(^|\/)(\._[^/]*|\.DS_Store)$/.test(src);
cpSync(`${root}web`, `${root}dist`, { recursive: true, filter });
cpSync(`${root}src/engine`, `${root}dist/engine`, { recursive: true, filter });
writeFileSync(`${root}dist/config.js`, `window.APP_CONFIG = { apiUrl: ${JSON.stringify(apiUrl)} };\n`);
console.log(`dist/ listo${apiUrl ? ` (API: ${apiUrl})` : ' (sin API: todo corre en el navegador)'}`);
