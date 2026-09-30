// 32 位 SimHash：用于标题近似去重。
// 对文本做 bigram 分词，逐 token 加权累加，按位取符号得到 32 位指纹。

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  const clean = text.replace(/\s+/g, "").toLowerCase();
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    out.push(clean.slice(i, i + 2));
  }
  if (clean.length === 1) out.push(clean);
  return out;
}

export function simhash32(text: string): number {
  const tokens = tokenize(text);
  const weights = new Int32Array(32);

  for (const tok of tokens) {
    const h = fnv1a(tok);
    for (let i = 0; i < 32; i++) {
      weights[i] += h & (1 << i) ? 1 : -1;
    }
  }

  let hash = 0;
  for (let i = 0; i < 32; i++) {
    if (weights[i] > 0) hash |= 1 << i;
  }
  return hash >>> 0;
}

export function hammingDistance(a: number, b: number): number {
  let x = (a ^ b) >>> 0;
  let d = 0;
  while (x) {
    d += x & 1;
    x >>>= 1;
  }
  return d;
}