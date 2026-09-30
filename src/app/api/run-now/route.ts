import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPipeline } from "@/lib/pipeline/run";

// 手动触发一次完整流程：抓取 → 标准化 → 去重 → 分类 → AI 总结 → 生成日报。
// 不做邮件、不做定时；运行会记录 runs / source_runs 状态。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const summary = await runPipeline(user.id, supabase);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}