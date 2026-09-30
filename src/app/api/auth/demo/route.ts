import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/constants";
import { beijingDateString } from "@/lib/datetime";

// 一键 Demo 登录：
// 1) 用 service_role 预置 demo 用户（关闭邮箱确认）
// 2) 登录获取会话，返回 token 给浏览器端 setSession
// 3) 预置 3 天示例历史日报（明确标记为示例，绝不与真实数据混用）
export async function POST() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
  }

  const admin = createAdminClient();

  // 1. 预置 demo 用户（已存在则报错，忽略，交给下方登录兜底）
  const { error: createError } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  void createError;

  // 2. 登录获取会话
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: error?.message ?? "Demo 登录失败" }, { status: 401 });
  }

  // 3. 预置 3 天示例历史日报（仅当该用户尚无日报时）
  await seedDemoDigests(admin, data.user.id);

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    email: data.user.email,
  });
}

async function seedDemoDigests(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { count } = await admin
    .from("digests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) > 0) return;

  const rows = [1, 2, 3].map((i) => ({
    user_id: userId,
    date: beijingDateString(new Date(Date.now() - i * 86400000)),
    html: demoDigestHtml(i),
    email_status: "skipped",
  }));

  await admin.from("digests").insert(rows);
}

function demoDigestHtml(i: number): string {
  return `<div style="font-family: sans-serif; color: #18181b;">
    <h3 style="margin: 0 0 8px;">【示例日报】第 ${i} 天（预置演示数据，非真实抓取）</h3>
    <p style="margin: 0;">这是用于演示「历史日报」列表的示例数据。接入抓取与 AI 总结流程后，此处将替换为真实生成的校园热点日报。</p>
  </div>`;
}