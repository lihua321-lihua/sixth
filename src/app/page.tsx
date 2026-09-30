import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Dashboard } from "@/components/dashboard/dashboard";
import type { DashboardInitial } from "@/lib/types";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const initial: DashboardInitial = {
    config: null,
    latestRun: null,
    recentSources: [],
    digests: [],
    events: [],
    latestEmailLog: null,
  };

  // 表可能尚未初始化，逐项容错，交给前端渲染空态
  try {
    const cfg = await supabase.from("configs").select("*").eq("user_id", user.id).maybeSingle();
    if (cfg.data) {
      initial.config = cfg.data;
      // 学校未选择 → 跳引导页强制选择（行存在但 school 为 null 才跳，避免表未初始化时死循环）
      if (!cfg.data.school) redirect("/select-school");
    }
  } catch {
    /* ignore */
  }

  try {
    const run = await supabase
      .from("runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (run.data) {
      initial.latestRun = run.data;
      const sr = await supabase.from("source_runs").select("*").eq("run_id", run.data.id);
      initial.recentSources = sr.data ?? [];
    }
  } catch {
    /* ignore */
  }

  try {
    const d = await supabase.from("digests").select("*").order("date", { ascending: false }).limit(30);
    initial.digests = d.data ?? [];
  } catch {
    /* ignore */
  }

  try {
    const ev = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    initial.events = ev.data ?? [];
  } catch {
    /* ignore */
  }

  try {
    const el = await supabase
      .from("email_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    initial.latestEmailLog = el.data ?? null;
  } catch {
    /* ignore */
  }

  return <Dashboard email={user.email ?? ""} initial={initial} />;
}