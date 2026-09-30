import type { EventCategory } from "@/lib/constants";

// 事件分类：与时效窗口内（由调用方过滤）历史事件比对。
// new=首次出现；ongoing=历史出现且无实质新增；updated=出现新链接/进展；low=未命中关注词。

export interface HistoricalEventLike {
  fingerprint: string;
  source_urls: string[];
  first_seen_at: string;
}

export function classifyEvent(
  fingerprint: string,
  matchedKeywords: string[],
  sourceUrls: string[],
  historical: HistoricalEventLike[],
): EventCategory {
  // 未命中关注词 → 低相关
  if (matchedKeywords.length === 0) return "low";

  const same = historical.filter((h) => h.fingerprint === fingerprint);
  if (same.length === 0) return "new";

  const oldUrls = new Set(same.flatMap((h) => h.source_urls));
  const hasNewUrl = sourceUrls.some((u) => !oldUrls.has(u));
  return hasNewUrl ? "updated" : "ongoing";
}