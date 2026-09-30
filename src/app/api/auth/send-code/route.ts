import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail, mailConfigured } from "@/lib/mail/send";
import {
  generateCode,
  hashCode,
  renderVerificationEmail,
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
} from "@/lib/auth/verification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isProd = process.env.NODE_ENV === "production";

function errText(err: unknown): string {
  if (err == null) return "unknown";
  if (typeof err === "string") return err;
  const e = err as { message?: string };
  return e.message || String(err);
}

// 服务端错误统一出口：真实原因写入日志；仅在非生产环境回传详情，便于定位。
function serverError(fallback: string, err: unknown, status = 500) {
  const detail = errText(err);
  console.error(detail);
  return NextResponse.json(
    { error: isProd ? fallback : `${fallback}（${detail}）` },
    { status },
  );
}

// 发送注册验证码邮件：
// 1) 校验邮箱格式；2) 校验重发间隔（60 秒）；3) 生成 6 位码并哈希入库；4) 发送邮件。
export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  }

  if (!mailConfigured()) {
    return NextResponse.json({ error: "邮件服务未配置" }, { status: 500 });
  }

  const admin = createAdminClient();

  // 重发间隔：同一邮箱同一目的，60 秒内只允许发送一条
  const cooldownSince = new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString();
  const { data: recent } = await admin
    .from("verification_codes")
    .select("id")
    .eq("email", email)
    .eq("purpose", "register")
    .gt("created_at", cooldownSince)
    .limit(1);
  if (recent && recent.length > 0) {
    return NextResponse.json({ error: "发送过于频繁，请 60 秒后重试" }, { status: 429 });
  }

  const code = generateCode();
  const { error: insertError } = await admin.from("verification_codes").insert({
    email,
    code_hash: hashCode(code),
    purpose: "register",
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (insertError) {
    return serverError("验证码生成失败", insertError);
  }

  const result = await sendMail({
    to: email,
    subject: "校园热点追踪工具 · 注册验证码",
    html: renderVerificationEmail(code),
  });
  if (!result.ok) {
    return serverError("验证码邮件发送失败，请稍后重试", result.error ?? "未知原因", 502);
  }

  return NextResponse.json({ ok: true });
}