import { normalizeTitle } from "./normalize";
import { titlesSimilar, levenshteinRatio } from "./similar";

// 去重合并：把标准化后的条目贪心聚类为「候选事件」。
// 合并条件：URL 相同；或标题近似（SimHash+编辑距离）+ 关键词重叠 + 时间窗口（≤3 天）。
// 相似度灰区（编辑距离相似度 0.6~0.8）可借助外部 judgeSame（OpenAI）二次判定。

export interface NormalizedItem {
  title: string; // 原始标题（已做去空格，未做尾部省略号处理前更贴合展示）
  normalizedTitle: string;
  url: string; // 规范化后的 URL
  source: string;
  published_at: string | null;
  matchedKeywords: string[];
}

export interface EventCandidate {
  title: string; // 代表标题
  source_urls: string[]; // 去重后的所有原始链接
  matched_keywords: string[]; // 关注词命中并集
  sources: string[]; // 来源 key 去重
  published_at: string | null; // 最新发布日期
}

type JudgeSame = (titleA: string, titleB: string) => Promise<boolean>;

function intersect(a: string[], b: string[]): boolean {
  return a.some((x) => b.includes(x));
}

function withinTimeWindow(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // 缺日期不因时间窗拒绝合并
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return true;
  return Math.abs(da - db) <= 3 * 86400000;
}

function isNewer(a: string | null, latest: string | null): boolean {
  if (!a) return false;
  if (!latest) return true;
  const da = new Date(a).getTime();
  const dl = new Date(latest).getTime();
  if (Number.isNaN(da)) return false;
  if (Number.isNaN(dl)) return true;
  return da > dl;
}

function isGrayZone(a: string, b: string): boolean {
  const ratio = levenshteinRatio(normalizeTitle(a), normalizeTitle(b));
  return ratio >= 0.6 && ratio < 0.8;
}

async function canMerge(
  item: NormalizedItem,
  cluster: EventCandidate,
  judgeSame?: JudgeSame,
): Promise<boolean> {
  if (cluster.source_urls.includes(item.url)) return true;

  let similar = titlesSimilar(item.title, cluster.title);
  if (!similar && judgeSame && isGrayZone(item.title, cluster.title)) {
    try {
      similar = await judgeSame(item.title, cluster.title);
    } catch {
      similar = false;
    }
  }
  if (!similar) return false;

  if (!withinTimeWindow(item.published_at, cluster.published_at)) return false;

  if (item.matchedKeywords.length && cluster.matched_keywords.length) {
    if (!intersect(item.matchedKeywords, cluster.matched_keywords)) return false;
  }
  return true;
}

export async function mergeItems(
  items: NormalizedItem[],
  judgeSame?: JudgeSame,
): Promise<EventCandidate[]> {
  const clusters: {
    title: string;
    titleScore: number;
    source_urls: Set<string>;
    matched_keywords: Set<string>;
    sources: Set<string>;
    published_at: string | null;
  }[] = [];

  for (const item of items) {
    let target: (typeof clusters)[number] | null = null;
    for (const c of clusters) {
      const representative: EventCandidate = {
        title: c.title,
        source_urls: [...c.source_urls],
        matched_keywords: [...c.matched_keywords],
        sources: [...c.sources],
        published_at: c.published_at,
      };
      if (await canMerge(item, representative, judgeSame)) {
        target = c;
        break;
      }
    }

    if (target) {
      target.source_urls.add(item.url);
      item.matchedKeywords.forEach((k) => target.matched_keywords.add(k));
      target.sources.add(item.source);
      if (isNewer(item.published_at, target.published_at)) {
        target.published_at = item.published_at;
      }
      // 代表标题取关注词命中更多者
      if (item.matchedKeywords.length > target.titleScore) {
        target.title = item.title;
        target.titleScore = item.matchedKeywords.length;
      }
    } else {
      clusters.push({
        title: item.title,
        titleScore: item.matchedKeywords.length,
        source_urls: new Set([item.url]),
        matched_keywords: new Set(item.matchedKeywords),
        sources: new Set([item.source]),
        published_at: item.published_at,
      });
    }
  }

  return clusters.map((c) => ({
    title: c.title,
    source_urls: [...c.source_urls],
    matched_keywords: [...c.matched_keywords],
    sources: [...c.sources],
    published_at: c.published_at,
  }));
}