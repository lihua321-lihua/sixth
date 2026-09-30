"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SCHOOL_NAME } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { DigestTab } from "./digest-tab";
import { SettingsTab } from "./settings-tab";
import { AiDialog } from "./ai-dialog";
import type { AgentResult, DashboardInitial } from "@/lib/types";

export function Dashboard({ email, initial }: { email: string; initial: DashboardInitial }) {
  const router = useRouter();
  const [tab, setTab] = useState<"digest" | "settings">("digest");
  // 区块折叠状态：true 表示已折叠。由 AI toggleSection 或用户手动点击区块标题驱动。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleSection(section: string) {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  function handleAgentResult(result: AgentResult) {
    // 数据变更 → 重新拉取服务端渲染数据
    if (result.refresh.length > 0) router.refresh();
    // 展开/折叠指令
    if (result.sectionToggles.length > 0) {
      setCollapsed((prev) => {
        const next = { ...prev };
        for (const t of result.sectionToggles) next[t.section] = !t.open;
        return next;
      });
    }
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <div className="pb-40">
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-semibold">校园热点追踪</h1>
            <p className="text-xs text-zinc-500">
              {SCHOOL_NAME} · {email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TabButton active={tab === "digest"} onClick={() => setTab("digest")}>
              日报
            </TabButton>
            <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
              设置与状态
            </TabButton>
            <button onClick={logout} className="ml-2 text-xs text-zinc-400 hover:text-zinc-700">
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {tab === "digest" ? (
          <DigestTab initial={initial} collapsed={collapsed} onToggle={toggleSection} />
        ) : (
          <SettingsTab initial={initial} collapsed={collapsed} onToggle={toggleSection} />
        )}
      </main>

      <AiDialog email={email} tab={tab} onResult={handleAgentResult} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm ${
        active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}