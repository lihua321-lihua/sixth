import type { SupabaseClient } from "@supabase/supabase-js";
import { runPipeline } from "@/lib/pipeline/run";
import { deliverCurrentDigest } from "@/lib/mail/deliver";
import { formatBeijingTime } from "@/lib/datetime";
import { normalizeSources, sourceNameByKey } from "@/lib/constants";
import type { SectionToggle } from "@/lib/types";

// /api/agent 的 6 个工具定义与执行。所有操作仅作用于当前登录用户（依赖 RLS），
// 不使用 service_role，不暴露密钥。

export interface ToolContext {
  userId: string;
  supabase: SupabaseClient;
}

export interface ToolOutcome {
  message: string;
  refresh?: string[];
  sectionToggles?: SectionToggle[];
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TOOLS: ToolDef[] = [
  {
    name: "update_config",
    description: "修改用户配置：关注关键词、排除关键词、收件邮箱、每日发送时间（北京时间 HH:MM）、是否启用邮件日报、时效窗口天数。",
    parameters: {
      type: "object",
      properties: {
        include_keywords: { type: "array", items: { type: "string" }, description: "关注关键词列表" },
        exclude_keywords: { type: "array", items: { type: "string" }, description: "排除关键词列表" },
        recipient_emails: { type: "array", items: { type: "string" }, description: "收件邮箱列表" },
        send_time: { type: "string", description: "每日发送时间，格式 HH:MM（北京时间）" },
        email_enabled: { type: "boolean", description: "是否启用邮件日报" },
        hot_window_days: { type: "integer", description: "时效窗口天数（1~365），决定热点事件在多少天内仍视为持续关注" },
      },
    },
  },
  {
    name: "run_now",
    description: "立即运行一次完整流程：抓取来源、标准化、去重合并、分类、AI 总结，生成今日日报。",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "send_test_email",
    description: "把当前日报作为测试邮件发送到指定邮箱。",
    parameters: {
      type: "object",
      properties: { email: { type: "string", description: "接收测试邮件的邮箱地址" } },
      required: ["email"],
    },
  },
  {
    name: "get_run_status",
    description: "查询最近一次运行状态与各数据来源的抓取结果。",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_digest",
    description: "查询最新日报中的热点事件概览。",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "toggle_section",
    description: "展开或折叠界面上的某个区块。",
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description: "区块 id：runSummary、config、sourceStatus、history、notes、new、ongoing、updated、low",
        },
        open: { type: "boolean", description: "true 展开，false 折叠" },
      },
      required: ["section", "open"],
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  switch (name) {
    case "update_config":
      return updateConfig(args, ctx);
    case "run_now":
      return runNow(ctx);
    case "send_test_email":
      return sendTestEmail(args, ctx);
    case "get_run_status":
      return getRunStatus(ctx);
    case "get_digest":
      return getDigest(ctx);
    case "toggle_section":
      return toggleSection(args);
    default:
      return { message: `未知工具：${name}` };
  }
}

async function updateConfig(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const patch: Record<string, unknown> = {};

  if (Array.isArray(args.include_keywords)) {
    const kws = args.include_keywords.map(String).map((s) => s.trim()).filter(Boolean);
    if (kws.length === 0) return { message: "关注关键词不能为空，未做修改。" };
    if (kws.length > 50) return { message: "关注关键词过多（最多 50 个），未做修改。" };
    patch.include_keywords = kws;
  }
  if (Array.isArray(args.exclude_keywords)) {
    patch.exclude_keywords = args.exclude_keywords.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(args.recipient_emails)) {
    const emails = args.recipient_emails.map(String).map((s) => s.trim()).filter(Boolean);
    for (const e of emails) {
      if (!EMAIL_RE.test(e)) return { message: `邮箱 ${e} 格式不正确，未做修改。` };
    }
    patch.recipient_emails = emails;
  }
  if (typeof args.send_time === "string" && /^\d{2}:\d{2}$/.test(args.send_time.trim())) {
    patch.send_time = args.send_time.trim();
  }
  if (typeof args.email_enabled === "boolean") {
    patch.email_enabled = args.email_enabled;
  }
  if (typeof args.hot_window_days === "number" && Number.isInteger(args.hot_window_days)) {
    if (args.hot_window_days < 1 || args.hot_window_days > 365) {
      return { message: "时效窗口必须是 1~365 的整数（天），未做修改。" };
    }
    patch.hot_window_days = args.hot_window_days;
  }

  if (Object.keys(patch).length === 0) {
    return { message: "没有可更新的配置项。" };
  }

  const { error } = await ctx.supabase
    .from("configs")
    .upsert({ user_id: ctx.userId, ...patch }, { onConflict: "user_id" });
  if (error) {
    return { message: `配置更新失败：${error.message}` };
  }
  return { message: "配置已更新。", refresh: ["config"] };
}

async function runNow(ctx: ToolContext): Promise<ToolOutcome> {
  const summary = await runPipeline(ctx.userId, ctx.supabase, { triggerType: "manual" });
  const parts = [
    `运行完成：获取 ${summary.items_count} 条内容，合并为 ${summary.events_count} 个事件。`,
    `来源成功 ${summary.sources_succeeded} 个、失败 ${summary.sources_failed} 个。`,
  ];
  if (summary.empty_reason) parts.push(`提示：${summary.empty_reason}。`);
  return { message: parts.join(" "), refresh: ["all"] };
}

async function sendTestEmail(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const email = String(args.email ?? "").trim();
  if (!EMAIL_RE.test(email)) {
    return { message: "请提供有效的邮箱地址。" };
  }
  const result = await deliverCurrentDigest(ctx.userId, ctx.supabase, email);
  if (!result.ok) {
    return { message: `邮件发送失败：${result.error}` };
  }
  return { message: `测试邮件已发送到 ${email}，请查收（含垃圾箱）。`, refresh: ["status"] };
}

async function getRunStatus(ctx: ToolContext): Promise<ToolOutcome> {
  const { data: run } = await ctx.supabase
    .from("runs")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return { message: "还没有运行记录，你可以让我「立即运行一次」生成日报。" };

  const labels: Record<string, string> = {
    running: "运行中",
    success: "成功",
    partial: "部分失败",
    failed: "失败",
  };
  let msg =
    `最近一次运行（${formatBeijingTime(run.started_at)}）：${labels[run.status] ?? run.status}，` +
    `获取 ${run.items_count} 条、合并 ${run.events_count} 个事件，来源成功 ${run.sources_succeeded} / 失败 ${run.sources_failed}。`;

  const { data: cfg } = await ctx.supabase
    .from("configs")
    .select("sources")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const sourceList = normalizeSources(cfg?.sources);

  const { data: srcRuns } = await ctx.supabase.from("source_runs").select("*").eq("run_id", run.id);
  if (srcRuns && srcRuns.length > 0) {
    const detail = srcRuns
      .map((s) => {
        const name = sourceNameByKey(sourceList, s.source);
        return s.status === "success"
          ? `${name}：成功 ${s.items_count} 条`
          : `${name}：失败${s.error ? `（${s.error}）` : ""}`;
      })
      .join("；");
    msg += ` 各来源：${detail}。`;
  }
  return { message: msg, refresh: ["status"] };
}

async function getDigest(ctx: ToolContext): Promise<ToolOutcome> {
  const { data: digest } = await ctx.supabase
    .from("digests")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!digest) return { message: "还没有生成日报，你可以让我「立即运行一次」生成日报。" };

  const { data: events } = await ctx.supabase
    .from("events")
    .select("category,title")
    .eq("user_id", ctx.userId)
    .order("last_seen_at", { ascending: false })
    .limit(20);

  const hot = (events ?? []).filter((e) => e.category !== "low");
  const hotCount = (digest.hot_count ?? hot.length) as number;
  const titles = hot.slice(0, 10).map((e, i) => `${i + 1}. ${e.title}`).join("；");
  const msg = `最新日报（${digest.date}）包含 ${hotCount} 条热点。` +
    (titles ? `热点包括：${titles}。` : "暂无热点内容。") +
    "完整内容请查看「日报」Tab。";
  return { message: msg };
}

function toggleSection(args: Record<string, unknown>): ToolOutcome {
  const section = String(args.section ?? "");
  const open = args.open === true;
  if (!section) return { message: "请指定要展开或折叠的区块。" };
  return {
    message: open ? `已展开区块「${section}」。` : `已折叠区块「${section}」。`,
    sectionToggles: [{ section, open }],
  };
}