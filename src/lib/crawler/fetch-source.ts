import type { Source } from "@/lib/constants";
import { fetchText, sleep } from "./http";
import { parseListLinks, parseDetail } from "./parse";

// 单来源抓取编排：列表页 →（对新 URL）详情页，串行、间隔，返回标准化前的原始条目。

export interface FetchedArticle {
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  raw: Record<string, unknown>;
}

export interface FetchSourceOptions {
  cap?: number; // 每来源最多抓取条数
  // URL → published_at 复用表：已入库且有日期的 URL 不重复抓详情页
  knownPublishedAt?: Map<string, string>;
  detailDelayMs?: number; // 详情页抓取间隔
}

export async function fetchSource(
  source: Source,
  opts: FetchSourceOptions = {},
): Promise<FetchedArticle[]> {
  const cap = opts.cap ?? 12;
  const known = opts.knownPublishedAt ?? new Map<string, string>();
  const detailDelayMs = opts.detailDelayMs ?? 700;

  const listPath = source.listPath ?? "/index.htm";
  const listUrl = source.baseUrl + listPath;
  const html = await fetchText(listUrl);
  const links = parseListLinks(html, source.baseUrl);

  const out: FetchedArticle[] = [];
  for (const link of links.slice(0, cap)) {
    let title = link.title;
    let published_at: string | null = null;
    let text = "";

    if (known.has(link.url)) {
      published_at = known.get(link.url) ?? null;
    } else {
      try {
        const detail = await fetchText(link.url);
        const info = parseDetail(detail);
        if (info.title) title = info.title;
        published_at = info.published_at;
        text = info.text;
      } catch {
        // 详情页抓取失败不致命：保留列表页标题，日期与正文留空
      }
      await sleep(detailDelayMs);
    }

    out.push({ title, url: link.url, source: source.key, published_at, raw: { text } });
  }

  return out;
}