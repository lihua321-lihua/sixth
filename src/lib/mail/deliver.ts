import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSources, sourceNameByKey } from "@/lib/constants";
import type { CampusEvent } from "@/lib/types";
import { sendMail, mailConfigured } from "./send";
import { renderDigestEmail, type MailSourceStatus } from "./render";

export interface DeliverResult {
  ok: boolean;
  error?: string;
}

// 发送「当前日报」到指定邮箱：读取最新日报 + 最近运行 + 来源状态 + 事件，渲染并发送，
// 随后记录 email_logs 并更新日报邮件状态。供手动测试邮件与定时任务复用。
export async function deliverCurrentDigest(
  userId: string,
  supabase: SupabaseClient,
  to: string,
): Promise<DeliverResult> {
  if (!mailConfigured()) {
    return { ok: false, error: "未配置邮件服务（需 QQ_EMAIL_USER/QQ_EMAIL_PASS 或 RESEND_API_KEY）" };
  }

  const { data: digest } = await supabase
    .from("digests")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!digest) {
    return { ok: false, error: "尚无日报，请先点击「立即运行一次」生成日报" };
  }

  const { data: run } = await supabase
    .from("runs")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sourceRuns: { source: string; status: string; items_count: number; error: string | null }[] = [];
  if (run) {
    const { data: sr } = await supabase.from("source_runs").select("*").eq("run_id", run.id);
    sourceRuns = sr ?? [];
  }

  const { data: cfg } = await supabase
    .from("configs")
    .select("sources")
    .eq("user_id", userId)
    .maybeSingle();
  const sourceList = normalizeSources(cfg?.sources);

  const { data: ev } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false })
    .limit(100);
  const events = (ev ?? []) as CampusEvent[];

  const sources: MailSourceStatus[] = sourceRuns.map((s) => ({
    name: sourceNameByKey(sourceList, s.source),
    status: s.status === "success" ? "success" : "failed",
    items_count: s.items_count,
    error: s.error,
  }));

  const { subject, html } = renderDigestEmail({
    events,
    sources,
    runStartedAt: run?.started_at ?? null,
    emptyReason: digest.empty_reason ?? null,
  });

  const result = await sendMail({ to, subject, html });

  await supabase.from("email_logs").insert({
    user_id: userId,
    digest_id: digest.id,
    to_emails: [to],
    status: result.ok ? "sent" : "failed",
    error: result.error ?? null,
  });

  await supabase
    .from("digests")
    .update({ email_status: result.ok ? "sent" : "failed" })
    .eq("id", digest.id);

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}