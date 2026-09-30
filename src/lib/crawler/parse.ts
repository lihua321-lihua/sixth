import * as cheerio from "cheerio";

// 学校站点（博达/VSB CMS）HTML 解析：
// 列表页文章链接：<a href="info/<栏目>/<id>.htm" title="完整标题">被截断文本</a>
// 详情页标题在 h1 或 h2；日期形如「发布日期/发布时间/时间：YYYY-MM-DD」。

export interface ListArticle {
  title: string;
  url: string; // 绝对 URL
}

export interface DetailInfo {
  title: string;
  published_at: string | null; // YYYY-MM-DD 或 null
  text: string; // 正文纯文本（用于关键词匹配）
}

// 将「2026-9-5」等非补零日期规范为「2026-09-05」，便于与北京时间字符串比较
function normalizeDate(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

// 从列表页提取文章链接（去重 by URL）
export function parseListLinks(html: string, baseUrl: string): ListArticle[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: ListArticle[] = [];

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    // 仅识别文章详情页链接（info/栏目/文章.htm），排除栏目导航页
    if (!/info\/\d+\/\d+\.s?htm$/i.test(href)) return;

    const rawTitle =
      ($(el).attr("title") ?? "").trim() || $(el).text().trim().replace(/\s+/g, " ");
    const title = rawTitle.replace(/\s+/g, " ").trim();
    if (!title) return;

    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({ title, url: abs });
  });

  return out;
}

// 从详情页提取标题与发布日期
export function parseDetail(html: string): DetailInfo {
  const $ = cheerio.load(html);

  let title = $("h1").first().text().trim().replace(/\s+/g, " ");
  if (!title) title = $("h2").first().text().trim().replace(/\s+/g, " ");
  if (!title) {
    // <title> 常带站点后缀，取第一个分隔符前段
    const raw = $("title").first().text().trim().replace(/\s+/g, " ");
    title = raw.split(/[-_|—]/, 1)[0].trim();
  }

  // 正文纯文本：去除脚本/样式后压缩空白，用于关注/排除关键词匹配
  $("script, style").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();

  const bodyText = $("body").text();
  let published_at: string | null = null;

  const labeled = /(?:发布日期|发布时间|时间)\s*[：:]\s*(\d{4}-\d{1,2}-\d{1,2})/.exec(bodyText);
  if (labeled) {
    published_at = labeled[1];
  } else {
    const first = /(\d{4}-\d{1,2}-\d{1,2})/.exec(bodyText);
    published_at = first ? first[1] : null;
  }

  return { title, published_at: normalizeDate(published_at), text };
}