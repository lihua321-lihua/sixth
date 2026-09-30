// 全局常量与数据来源定义
// 项目只支持一所学校：北华航天工业学院

export const SCHOOL_NAME = "北华航天工业学院";
export const SCHOOL_SHORT = "华航";

// Demo 登录账号（可用环境变量覆盖，本地演示专用）
export const DEMO_EMAIL = process.env.DEMO_EMAIL || "";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "";

export interface Source {
  key: string;
  name: string;
  baseUrl: string;
  /** 新闻列表页路径（相对 baseUrl）。默认 /index.htm，部分站点列表在独立栏目页。 */
  listPath?: string;
}

// 4 个数据来源，全部国内可直连
export const SOURCES: Source[] = [
  { key: "news", name: "学校主新闻网", baseUrl: "https://news.nciae.edu.cn" },
  { key: "aero", name: "航空宇航学院", baseUrl: "https://aero.nciae.edu.cn" },
  { key: "yjsb", name: "研究生教学部", baseUrl: "https://yjsb.nciae.edu.cn" },
  { key: "zb", name: "本科招生信息网", baseUrl: "https://zb.nciae.edu.cn", listPath: "/xwdt.htm" },
];

// 时效窗口（天）：数据源更新慢，热点事件在该天数内仍视为「持续关注」，默认 30。
export const DEFAULT_HOT_WINDOW_DAYS = 30;

// 从数据库 jsonb 解读来源列表；非法 / 缺失时回退到内置默认来源。
export function normalizeSources(value: unknown): Source[] {
  if (!Array.isArray(value)) return SOURCES;
  const out: Source[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const baseUrl = typeof o.baseUrl === "string" ? o.baseUrl.trim() : "";
    if (!name || !baseUrl) continue;
    const key = typeof o.key === "string" && o.key.trim() ? o.key : sourceKeyFromUrl(baseUrl);
    const listPath = typeof o.listPath === "string" && o.listPath.trim() ? o.listPath.trim() : undefined;
    out.push({ key, name, baseUrl, ...(listPath ? { listPath } : {}) });
  }
  return out;
}

// 依据 URL 生成稳定的自定义来源 key（形如 custom_news_nciae_edu_cn）
export function sourceKeyFromUrl(url: string): string {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    // 非标准 URL 时退回原文
  }
  return "custom_" + host.replace(/[^a-zA-Z0-9]+/g, "_");
}

// 依据来源列表把 source key 解析为显示名（找不到时退回 key 本身）
export function sourceNameByKey(sources: Source[], key: string): string {
  return sources.find((s) => s.key === key)?.name ?? key;
}

// 关注 / 排除关键词默认值（写入 configs 由数据库 handle_new_user 触发器预置）
export const DEFAULT_INCLUDE_KEYWORDS = [
  "航天",
  "宇航",
  "招生",
  "研究生",
  "招聘",
  "就业",
  "竞赛",
  "获奖",
  "科研",
  "校园",
  "华航",
  "北华航天工业学院",
];

export const DEFAULT_EXCLUDE_KEYWORDS = ["放假安排", "值班表", "停水停电", "失物招领"];

// 事件分类
export const EVENT_CATEGORIES = ["new", "ongoing", "updated", "low"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  new: "今天新出现",
  ongoing: "持续受到关注",
  updated: "已有重要更新",
  low: "普通 / 低相关",
};

// 可信度分级
export const CREDIBILITY_LEVELS = ["官方事实", "媒体报道", "传闻待证实"] as const;
export type Credibility = (typeof CREDIBILITY_LEVELS)[number];