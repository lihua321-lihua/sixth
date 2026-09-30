import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPipeline } from "@/lib/pipeline/run";
import { deliverCurrentDigest } from "@/lib/mail/deliver";
import { beijingDateString, beijingTimeHM } from "@/lib/datetime";

// 定时任务入口：由 Netlify Scheduled Function 每小时 UTC 触发（cron-tick.js 转发，携带 CRON_SECRET）。
// 逻辑：校验密钥 → 北京时间判断是否到各用户发送时间 → run_locks 防重复 → 抓取处理生成日报 → 发邮件。
export async function POST(request: Request) {
  const secret =
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("secret");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET 未配置" }, { status: 500 });
  }
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: configs, error: cfgErr } = await admin
    .from("configs")
    .select("*")
    .eq("email_enabled", true);
  if (cfgErr) {
    return NextResponse.json({ error: cfgErr.message }, { status: 500 });
  }

  const nowHM = beijingTimeHM();
  const today = beijingDateString();
  const processed: {
    user: string;
    action: "skipped-time" | "skipped-already-run" | "ran" | "pipeline-error";
    status?: string;
    email_sent?: boolean;
    error?: string;
  }[] = [];

  for (const cfg of configs ?? []) {
    const sendTime = (cfg.send_time ?? "08:00").slice(0, 5);
    if (sendTime !== nowHM) {
      processed.push({ user: cfg.user_id, action: "skipped-time" });
      continue;
    }

    // 防重复：当天已有运行锁（manual 或 scheduled 成功）则跳过
    const { data: locks } = await admin
      .from("run_locks")
      .select("trigger_type")
      .eq("user_id", cfg.user_id)
      .eq("date", today);
    if (locks && locks.length > 0) {
      processed.push({ user: cfg.user_id, action: "skipped-already-run" });
      continue;
    }

    // 抓取 → 处理 → 生成日报
    let status: string;
    try {
      const summary = await runPipeline(cfg.user_id, admin, { triggerType: "scheduled" });
      status = summary.status;
    } catch (e) {
      processed.push({
        user: cfg.user_id,
        action: "pipeline-error",
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    // 发送邮件（失败不阻断日报，已记录 email_logs / digest.email_status）
    const recipients = cfg.recipient_emails ?? [];
    let emailSent = false;
    for (const to of recipients) {
      const r = await deliverCurrentDigest(cfg.user_id, admin, to);
      emailSent = emailSent || r.ok;
    }

    processed.push({ user: cfg.user_id, action: "ran", status, email_sent: emailSent });
  }

  return NextResponse.json({ ok: true, beijing_time: nowHM, processed });
}

export async function GET(request: Request) {
  return POST(request);
}