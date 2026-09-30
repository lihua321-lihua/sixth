import { createHash } from "crypto";

// 标题 / URL 归一化，以及事件指纹生成。

// 标题归一化：折叠空白、去首尾及尾部省略号
export function normalizeTitle(title: string): string {
  let t = title.replace(/\s+/g, " ").trim();
  t = t.replace(/[.。…·]+$/, "").trim();
  return t;
}

// URL 规范化：去 hash、去跟踪参数、去末尾斜杠
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "spm",
      "from",
    ]) {
      u.searchParams.delete(key);
    }
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return url.trim();
  }
}

// 事件指纹：标题归一化后取 sha1（URL 会变化，故不参与指纹；分类阶段据此与历史比对）
export function fingerprintOf(title: string): string {
  return createHash("sha1").update(normalizeTitle(title)).digest("hex");
}