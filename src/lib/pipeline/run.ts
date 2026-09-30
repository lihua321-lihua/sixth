import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CATEGORY_LABELS,
  DEFAULT_INCLUDE_KEYWORDS,
  DEFAULT_EXCLUDE_KEYWORDS,
  DEFAULT_HOT_WINDOW_DAYS,
  normalizeSources,
  type EventCategory,
} from "@/lib/constants";
import { beijingDateString } from "@/lib/datetime";
import type { RunStatus, RunSummary } from "@/lib/types";
import { fetchSource, type FetchedArticle } from "@/lib/crawler/fetch-source";
import { sleep, errorMessage } from "@/lib/crawler/http";
import { normalizeTitle, normalizeUrl, fingerprintOf } from "./normalize";
import { isExcluded, matchesAny } from "./keywords";
import { mergeItems, type NormalizedItem, type EventCandidate } from "./merge";
import { classifyEvent, type HistoricalEventLike } from "./classify";
import { summarizeEvent, inferCredibility, aiSameEvent } from "@/lib/ai/summarize";

const SOURCE_CAP = 12; // 每来源最多条数
const SOURCE_GAP_MS = 1200; // 来源间间隔

function toTimestamp(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface EventRow {
  category: EventCategory;
  fingerprint: string;
  title: string;
  summary: string | null;
  reason: string | null;
  credibility: string | null;
  is_rumor: boolean;
  source_urls: string[];
  first_seen_at: string;
}

export interface RunPipelineOptions {
  triggerType?: "manual" | "scheduled";
}

// 主流水线：抓取 → 标准化 → 去重合并 → 分类 → AI 总结 → 生成日报 → 记录状态
export async function runPipeline(
  userId: string,
  supabase: SupabaseClient,
  opts: RunPipelineOptions = {},
): Promise<RunSummary> {
  const triggerType = opts.triggerType ?? "manual";

  // 1. 读取配置
  const { data: cfg } = await supabase
    .from("configs")
    .select("include_keywords, exclude_keywords, hot_window_days, sources")
    .eq("user_id", userId)
    .maybeSingle();
  const include = cfg?.include_keywords ?? DEFAULT_INCLUDE_KEYWORDS;
  const exclude = cfg?.exclude_keywords ?? DEFAULT_EXCLUDE_KEYWORDS;
  const sources = normalizeSources(cfg?.sources);
  const hotWindowDays =
    typeof cfg?.hot_window_days === "number" && cfg.hot_window_days > 0
      ? cfg.hot_window_days
      : DEFAULT_HOT_WINDOW_DAYS;

  // 2. 已知 URL 的发布时间（复用，避免重复抓详情页）
  const { data: existingItems } = await supabase
    .from("items")
    .select("url, published_at")
    .eq("user_id", userId);
  const known = new Map<string, string>();
  for (const row of existingItems ?? []) {
    if (row.published_at) known.set(row.url, row.published_at);
  }

  // 3. 创建运行记录
  const { data: run, error: runErr } = await supabase
    .from("runs")
    .insert({ user_id: userId, trigger_type: triggerType, status: "running", started_at: new Date().toISOString() })
    .select()
    .single();
  if (runErr || !run) {
    throw new Error("无法创建运行记录：" + (runErr?.message ?? "unknown"));
  }

  // 4. 串行抓取各来源（单来源失败不阻断）
  const allFetched: FetchedArticle[] = [];
  const sourceResults: RunSummary["sources"] = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    await supabase.from("source_runs").insert({
      user_id: userId,
      run_id: run.id,
      source: src.key,
      status: "pending",
      started_at: new Date().toISOString(),
    });

    let status: "success" | "failed" = "success";
    let error: string | null = null;
    let articles: FetchedArticle[] = [];
    try {
      articles = await fetchSource(src, { cap: SOURCE_CAP, knownPublishedAt: known });
    } catch (e) {
      status = "failed";
      error = errorMessage(e);
    }

    await supabase
      .from("source_runs")
      .update({ status, items_count: articles.length, error, finished_at: new Date().toISOString() })
      .eq("run_id", run.id)
      .eq("source", src.key);

    if (status === "success") allFetched.push(...articles);
    sourceResults.push({ source: src.key, name: src.name, status, items_count: articles.length, error });

    if (i < sources.length - 1) await sleep(SOURCE_GAP_MS);
  }

  // 5. 标准化 + 排除词过滤 + 关注词打分
  const normalized: NormalizedItem[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const seenUrl = new Set<string>();
  const fetchedAt = new Date().toISOString();

  for (const a of allFetched) {
    const url = normalizeUrl(a.url);
    const title = normalizeTitle(a.title);
    if (isExcluded(title, exclude)) continue;
    if (seenUrl.has(url)) continue;
    seenUrl.add(url);

    normalized.push({
      title: a.title,
      normalizedTitle: title,
      url,
      source: a.source,
      published_at: a.published_at,
      matchedKeywords: matchesAny(title, include),
    });

    itemRows.push({
      user_id: userId,
      title,
      url,
      source: a.source,
      published_at: toTimestamp(a.published_at),
      fetched_at: fetchedAt,
      raw: a.raw,
    });
  }

  if (itemRows.length) {
    await supabase.from("items").upsert(itemRows, { onConflict: "user_id,url", ignoreDuplicates: true });
  }

  // 6. 去重合并（灰区用 AI 二次判定，可选）
  const judge = process.env.OPENAI_API_KEY ? aiSameEvent : undefined;
  const candidates: EventCandidate[] = await mergeItems(normalized, judge);

  // 7. 时效窗口内历史事件（用于分类比对）
  const since = new Date(Date.now() - hotWindowDays * 86400000).toISOString();
  const { data: history } = await supabase
    .from("events")
    .select("fingerprint, source_urls, first_seen_at")
    .eq("user_id", userId)
    .gte("last_seen_at", since);
  const historical: HistoricalEventLike[] = (history ?? []).map((h) => ({
    fingerprint: h.fingerprint,
    source_urls: h.source_urls ?? [],
    first_seen_at: h.first_seen_at,
  }));

  // 8. 分类 + AI 总结 + 生成事件行
  const now = new Date().toISOString();
  const eventRows: EventRow[] = [];
  let hotspotCount = 0;

  for (const c of candidates) {
    const fingerprint = fingerprintOf(c.title);
    const category = classifyEvent(fingerprint, c.matched_keywords, c.source_urls, historical);
    if (category !== "low") hotspotCount++;

    const ai =
      category === "low"
        ? { summary: null, reason: null, credibility: inferCredibility(c.sources), is_rumor: false }
        : await summarizeEvent({
            title: c.title,
            sources: c.sources,
            source_urls: c.source_urls,
            keywords: c.matched_keywords,
          });

    // 历史首次出现时间（保留最早）
    const same = historical.filter((h) => h.fingerprint === fingerprint);
    const firstSeen = same.reduce<string>((min, h) => (min === null || h.first_seen_at < min ? h.first_seen_at : min), now);

    eventRows.push({
      category,
      fingerprint,
      title: c.title,
      summary: ai.summary,
      reason: ai.reason,
      credibility: ai.credibility,
      is_rumor: ai.is_rumor,
      source_urls: c.source_urls,
      first_seen_at: firstSeen ?? now,
    });
  }

  if (eventRows.length) {
    await supabase
      .from("events")
      .upsert(
        eventRows.map((e) => ({
          user_id: userId,
          category: e.category,
          fingerprint: e.fingerprint,
          title: e.title,
          summary: e.summary,
          reason: e.reason,
          credibility: e.credibility,
          is_rumor: e.is_rumor,
          source_urls: e.source_urls,
          first_seen_at: e.first_seen_at,
          last_seen_at: now,
        })),
        { onConflict: "user_id,fingerprint" },
      );
  }

  // 9. 运行统计与状态
  const succeeded = sourceResults.filter((s) => s.status === "success").length;
  const failed = sources.length - succeeded;
  let runStatus: RunStatus;
  if (succeeded === 0) runStatus = "failed";
  else if (failed > 0) runStatus = "partial";
  else runStatus = "success";

  let emptyReason: string | null = null;
  if (succeeded === 0) emptyReason = "全部来源失败";
  else if (hotspotCount === 0) emptyReason = "无新热点";
  else if (failed > 0) emptyReason = "部分失败";

  // 10. 生成日报
  const digestHtml = buildDigestHtml(eventRows, sourceResults, emptyReason);
  const today = beijingDateString();
  await supabase.from("digests").upsert(
    {
      user_id: userId,
      date: today,
      html: digestHtml,
      email_status: "pending",
      empty_reason: emptyReason,
      hot_count: hotspotCount,
    },
    { onConflict: "user_id,date" },
  );

  // 11. 更新运行记录
  await supabase
    .from("runs")
    .update({
      status: runStatus,
      items_count: itemRows.length,
      events_count: eventRows.length,
      sources_succeeded: succeeded,
      sources_failed: failed,
      error: null,
      finished_at: now,
    })
    .eq("id", run.id);

  // 12. 写入当天运行锁（仅成功/部分成功，供定时任务防重复）
  if (runStatus !== "failed") {
    await supabase.from("run_locks").upsert(
      { user_id: userId, date: today, trigger_type: triggerType, run_id: run.id },
      { onConflict: "user_id,date,trigger_type" },
    );
  }

  return {
    run_id: run.id,
    status: runStatus,
    items_count: itemRows.length,
    events_count: eventRows.length,
    sources_succeeded: succeeded,
    sources_failed: failed,
    empty_reason: emptyReason,
    sources: sourceResults,
  };
}

function buildDigestHtml(
  events: EventRow[],
  sources: RunSummary["sources"],
  emptyReason: string | null,
): string {
  const order: EventCategory[] = ["new", "ongoing", "updated", "low"];
  const grouped: Record<EventCategory, EventRow[]> = {
    new: [],
    ongoing: [],
    updated: [],
    low: [],
  };
  for (const e of events) grouped[e.category].push(e);

  const sections = order
    .map((cat) => {
      const list = grouped[cat];
      const itemsHtml = list.length
        ? list
            .map((e) => {
              const links = e.source_urls
                .map((u, i) => `<a href="${u}" style="color:#2563eb">来源${i + 1}</a>`)
                .join(" · ");
              const summary = e.summary ? `<p style="margin:4px 0">${escapeHtml(e.summary)}</p>` : "";
              const reason = e.reason ? `<p style="margin:2px 0;color:#71717a;font-size:12px">关注原因：${escapeHtml(e.reason)}</p>` : "";
              const rumor = e.is_rumor ? " <span style=\"color:#dc2626\">[传闻]</span>" : "";
              return `<li style="margin-bottom:12px">
                <div style="font-weight:600">${escapeHtml(e.title)}${rumor}</div>
                ${summary}${reason}
                <div style="font-size:12px;color:#71717a">${links}${e.credibility ? " · " + escapeHtml(e.credibility) : ""}</div>
              </li>`;
            })
            .join("")
        : `<li style="color:#a1a1aa">无</li>`;
      return `<h4 style="margin:16px 0 8px">${CATEGORY_LABELS[cat]}（${list.length}）</h4><ul style="padding-left:18px;margin:0">${itemsHtml}</ul>`;
    })
    .join("");

  const sourceRows = sources
    .map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${s.status === "success" ? "成功" : "失败"}</td><td>${s.items_count}</td><td>${s.error ? escapeHtml(s.error) : ""}</td></tr>`)
    .join("");

  return `<div style="font-family:sans-serif;color:#18181b;max-width:680px">
    <h2 style="margin:0 0 4px">校园热点日报</h2>
    <p style="margin:0 0 16px;color:#71717a;font-size:13px">${beijingDateString()} · ${emptyReason ?? "正常生成"}</p>
    ${sections}
    <h4 style="margin:16px 0 8px">来源状态</h4>
    <table style="border-collapse:collapse;font-size:12px" cellpadding="6">
      <tr><th align="left">来源</th><th align="left">状态</th><th align="left">条数</th><th align="left">错误</th></tr>
      ${sourceRows}
    </table>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}