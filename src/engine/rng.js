// Aleatoriedad 100 % determinista: misma semilla => mismos números en el navegador y en AWS Lambda.
// Solo usa aritmética entera de 32 bits (Math.imul, >>>), que es idéntica en todos los motores JS.

// FNV-1a de 32 bits sobre texto: convierte cualquier lista de partes en una semilla.
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  const text = parts.map(String).join('|');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// splitmix32: expande una semilla en el estado inicial del generador.
function splitmix32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

const rotl = (x, k) => (x << k) | (x >>> (32 - k));

// xoshiro128**: generador rápido y de buena calidad estadística.
export class Rng {
  constructor(seed) {
    const sm = splitmix32(seed);
    this.s = new Uint32Array([sm(), sm(), sm(), sm()]);
    if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0) this.s[0] = 1;
  }

  nextU32() {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }

  // Número en [0, 1).
  next() {
    return this.nextU32() / 4294967296;
  }

  // Entero en [0, n).
  int(n) {
    return Math.floor(this.next() * n);
  }

  // Elige un entero en [min, max] (ambos incluidos).
  between(min, max) {
    return min + this.int(max - min + 1);
  }
}

// e^(-x) para x >= 0 sin Math.exp: la especificación de JS permite que Math.exp difiera
// en el último bit entre navegadores; esta versión usa solo + - * / y es idéntica en todos.
const LN2 = 0.6931471805599453;
export function expNeg(x) {
  if (x <= 0) return 1;
  if (x > 700) return 0;
  const k = Math.floor(x / LN2);
  const r = x - k * LN2; // r en [0, ln2)
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 18; n++) {
    term *= -r / n;
    sum += term;
  }
  for (let i = 0; i < k; i++) sum *= 0.5;
  return sum;
}
