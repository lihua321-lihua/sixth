// 关键词处理：排除词过滤 + 关注词命中打分。

export function matchesAny(text: string, keywords: string[]): string[] {
  const hits: string[] = [];
  if (!keywords.length) return hits;
  for (const kw of keywords) {
    if (kw && text.includes(kw)) hits.push(kw);
  }
  return hits;
}

export function isExcluded(text: string, excludeKeywords: string[]): boolean {
  return matchesAny(text, excludeKeywords).length > 0;
}

// 关注词命中数作为相关性得分
export function scoreByKeywords(text: string, includeKeywords: string[]): number {
  return matchesAny(text, includeKeywords).length;
}