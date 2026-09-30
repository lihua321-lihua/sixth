import { CATEGORY_LABELS, type EventCategory } from "@/lib/constants";
import { beijingDateString, formatBeijingTime } from "@/lib/datetime";
import type { CampusEvent } from "@/lib/types";

// 邮件渲染：按分类展示热点、来源状态、失败提示、运行时间；无新内容时切换主题与正文。

export interface MailSourceStatus {
  name: string;
  status: "success" | "failed";
  items_count: number;
  error: string | null;
}

export interface RenderEmailInput {
  events: CampusEvent[];
  sources: MailSourceStatus[];
  runStartedAt: string | null;
  emptyReason: string | null;
}

const ORDER: EventCategory[] = ["new", "ongoing", "updated", "low"];

export function renderDigestEmail(input: RenderEmailInput): { subject: string; html: string } {
  const hotspot = input.events.filter((e) => e.category !== "low");
  const noHotspot = hotspot.length === 0;

  const subject = noHotspot
    ? "今日无新增校园热点"
    : `校园热点日报（${beijingDateString()} · ${hotspot.length} 条热点）`;

  const html = noHotspot
    ? renderEmpty(input)
    : renderHotspots(input);

  return { subject, html };
}

function renderEmpty(input: RenderEmailInput): string {
  const sources = renderSources(input.sources);
  const runTime = input.runStartedAt ? formatBeijingTime(input.runStartedAt) : "暂无";
  return wrap(`
    <p style="margin:0 0 16px">今日已检查以下来源，暂未发现需要关注的新增校园热点，不编造热点内容。</p>
    ${sources}
    <p style="margin:16px 0 0;color:#71717a;font-size:13px">最近运行时间：${runTime}</p>
  `);
}

function renderHotspots(input: RenderEmailInput): string {
  const grouped: Record<EventCategory, CampusEvent[]> = { new: [], ongoing: [], updated: [], low: [] };
  for (const e of input.events) grouped[e.category].push(e);

  const sections = ORDER.map((cat) => {
    const list = grouped[cat];
    if (list.length === 0) return "";
    const items = list
      .map((e) => {
        const links = (e.source_urls ?? [])
          .map((u, i) => `<a href="${u}" style="color:#2563eb">来源${i + 1}</a>`)
          .join(" · ");
        const summary = e.summary ? `<p style="margin:4px 0">${escapeHtml(e.summary)}</p>` : "";
        const reason = e.reason ? `<p style="margin:2px 0;color:#71717a;font-size:12px">关注原因：${escapeHtml(e.reason)}</p>` : "";
        const rumor = e.is_rumor ? ' <span style="color:#dc2626">[传闻]</span>' : "";
        return `<li style="margin-bottom:12px">
          <div style="font-weight:600">${escapeHtml(e.title)}${rumor}</div>
          ${summary}${reason}
          <div style="font-size:12px;color:#71717a">${links}${e.credibility ? " · " + escapeHtml(e.credibility) : ""}</div>
        </li>`;
      })
      .join("");
    return `<h4 style="margin:16px 0 8px">${CATEGORY_LABELS[cat]}（${list.length}）</h4><ul style="padding-left:18px;margin:0">${items}</ul>`;
  }).join("");

  const failed = input.sources.filter((s) => s.status === "failed");
  const failureHint = failed.length
    ? `<p style="margin:16px 0 0;color:#dc2626;font-size:13px">部分来源获取失败：${failed
        .map((s) => `${s.name}${s.error ? "（" + escapeHtml(s.error) + "）" : ""}`)
        .join("；")}</p>`
    : "";

  const sources = renderSources(input.sources);
  const runTime = input.runStartedAt ? formatBeijingTime(input.runStartedAt) : "暂无";
  const emptyNote = input.emptyReason ? `<p style="margin:8px 0 0;color:#71717a;font-size:13px">备注：${escapeHtml(input.emptyReason)}</p>` : "";

  return wrap(`
    ${sections}
    ${failureHint}
    ${emptyNote}
    ${sources}
    <p style="margin:16px 0 0;color:#71717a;font-size:13px">最近运行时间：${runTime}</p>
  `);
}

function renderSources(sources: MailSourceStatus[]): string {
  const rows = sources
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>${s.status === "success" ? "成功" : "失败"}</td><td>${s.items_count}</td><td>${s.error ? escapeHtml(s.error) : ""}</td></tr>`,
    )
    .join("");
  return `<h4 style="margin:16px 0 8px">来源状态</h4>
    <table style="border-collapse:collapse;font-size:12px" cellpadding="6">
      <tr><th align="left">来源</th><th align="left">状态</th><th align="left">条数</th><th align="left">错误</th></tr>
      ${rows}
    </table>`;
}

function wrap(body: string): string {
  return `<div style="font-family:sans-serif;color:#18181b;max-width:680px">
    <h2 style="margin:0 0 4px">校园热点日报</h2>
    <p style="margin:0 0 16px;color:#71717a;font-size:13px">${beijingDateString()} · 北华航天工业学院</p>
    ${body}
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}