import { normalizeTitle } from "./normalize";
import { simhash32, hammingDistance } from "./simhash";

// 字符串相似度与标题近似判定。

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1).fill(0).map((_, j) => j);
  const curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return curr[n];
}

export function levenshteinRatio(a: string, b: string): number {
  const d = levenshteinDistance(a, b);
  const max = Math.max(a.length, b.length, 1);
  return 1 - d / max;
}

// 标题是否判定为同一事件（近似）：SimHash 汉明距离 ≤3 且编辑距离相似度 ≥0.8
export function titlesSimilar(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ratio = levenshteinRatio(na, nb);
  if (ratio < 0.8) return false;
  return hammingDistance(simhash32(na), simhash32(nb)) <= 3;
}