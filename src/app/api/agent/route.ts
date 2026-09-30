import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { runAgentChat } from "@/lib/agent/chat";
import { formatBeijingTime } from "@/lib/datetime";
import { SCHOOL_NAME } from "@/lib/constants";

// POST /api/agent：Agentic AI 对话框后端。
// 用当前登录会话（RLS）读取上下文并驱动 DeepSeek function calling，不暴露 service_role。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: { tab?: string; messages?: { role: "user" | "assistant"; text: string }[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  const tab = body.tab === "settings" ? "settings" : "digest";
  const messages = Array.isArray(body.messages)
    ? body.messages.filter((m) => m && typeof m.text === "string" && m.text.trim())
    : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  }

  const context = await buildContext(user.id, supabase, tab);

  try {
    const result = await runAgentChat({ userId: user.id, supabase, context, messages });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

async function buildContext(userId: string, supabase: SupabaseClient, tab: string): Promise<string> {
  const { data: cfg } = await supabase
    .from("configs")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const { data: run } = await supabase
    .from("runs")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: digest } = await supabase
    .from("digests")
    .select("date, hot_count, email_status")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lines = [
    `学校：${SCHOOL_NAME}（单校，不支持修改学校）。`,
    `当前 Tab：${tab === "settings" ? "设置与状态" : "日报"}。`,
    `当前配置：关注关键词=[${(cfg?.include_keywords ?? []).join("、")}]，排除关键词=[${(cfg?.exclude_keywords ?? []).join("、")}]，` +
      `收件邮箱=[${(cfg?.recipient_emails ?? []).join("、")}]，发送时间=${cfg?.send_time ?? "08:00"}（北京时间），` +
      `邮件日报=${cfg?.email_enabled ? "开启" : "关闭"}。`,
  ];

  if (run) {
    lines.push(
      `最近运行：${formatBeijingTime(run.started_at)}，状态=${run.status}，获取 ${run.items_count} 条、事件 ${run.events_count} 个。`,
    );
  } else {
    lines.push("最近运行：尚无运行记录。");
  }

  if (digest) {
    lines.push(`最新日报：${digest.date}，热点 ${digest.hot_count ?? 0} 条，邮件状态=${digest.email_status}。`);
  } else {
    lines.push("最新日报：尚无日报。");
  }

  return lines.join("\n");
}