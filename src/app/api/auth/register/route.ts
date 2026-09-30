import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashCode, MAX_VERIFY_ATTEMPTS } from "@/lib/auth/verification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

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

// 邮箱验证码注册：
// 1) 校验邮箱/密码/验证码格式；2) 校验验证码（有效、未过期、未使用）；3) 创建已确认账号。
export async function POST(request: Request) {
  let email = "";
  let password = "";
  let code = "";
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      code?: string;
    };
    email = (body.email ?? "").trim().toLowerCase();
    password = body.password ?? "";
    code = (body.code ?? "").trim();
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }
  if (!CODE_RE.test(code)) {
    return NextResponse.json({ error: "请输入 6 位数字验证码" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 取该邮箱最新一条未使用、未过期的验证码
  const { data: rows, error: selectError } = await admin
    .from("verification_codes")
    .select("*")
    .eq("email", email)
    .eq("purpose", "register")
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (selectError) {
    return serverError("验证码查询失败", selectError);
  }

  const row = rows?.[0];
  if (!row) {
    return NextResponse.json({ error: "验证码已过期或不存在，请重新获取" }, { status: 400 });
  }

  if (row.code_hash !== hashCode(code)) {
    const attempts = (row.attempts ?? 0) + 1;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await admin.from("verification_codes").update({ used: true }).eq("id", row.id);
      return NextResponse.json(
        { error: "验证码错误次数过多，请重新获取" },
        { status: 400 },
      );
    }
    await admin.from("verification_codes").update({ attempts }).eq("id", row.id);
    return NextResponse.json({ error: "验证码错误" }, { status: 400 });
  }

  // 验证码正确，标记已使用
  await admin.from("verification_codes").update({ used: true }).eq("id", row.id);

  // 创建账号（email_confirm: true 跳过官方确认邮件，直接可登录）
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    const msg = String(createError.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    }
    return serverError("注册失败，请稍后重试", createError);
  }

  return NextResponse.json({ ok: true });
}