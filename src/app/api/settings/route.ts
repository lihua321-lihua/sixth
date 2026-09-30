import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeSources, type Source } from "@/lib/constants";

// 设置界面「来源管理 / 时效窗口」的写入接口。
// 仅作用于当前登录用户（依赖 RLS，使用用户会话，不暴露 service_role）。
// 请求体：{ sources?: Source[]; hot_window_days?: number }，二者可单独更新。

const MAX_SOURCES = 20;

function dedupeKeys(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.map((s) => {
    let key = s.key;
    if (seen.has(key)) {
      let i = 2;
      while (seen.has(`${key}_${i}`)) i++;
      key = `${key}_${i}`;
    }
    seen.add(key);
    return key === s.key ? s : { ...s, key };
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.sources !== undefined) {
    if (!Array.isArray(body.sources)) {
      return NextResponse.json({ error: "sources 必须是数组" }, { status: 400 });
    }
    const sources = dedupeKeys(normalizeSources(body.sources));
    if (sources.length > MAX_SOURCES) {
      return NextResponse.json({ error: `来源数量过多（最多 ${MAX_SOURCES} 个）` }, { status: 400 });
    }
    patch.sources = sources;
  }

  if (body.hot_window_days !== undefined) {
    const d = Number(body.hot_window_days);
    if (!Number.isInteger(d) || d < 1 || d > 365) {
      return NextResponse.json({ error: "时效窗口必须是 1~365 的整数（天）" }, { status: 400 });
    }
    patch.hot_window_days = d;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "没有可更新的内容" }, { status: 400 });
  }

  const { error } = await supabase
    .from("configs")
    .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json({ error: "保存失败：" + error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}