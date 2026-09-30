"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, type EventCategory } from "@/lib/constants";
import { formatBeijingTime } from "@/lib/datetime";
import type { CampusEvent, DashboardInitial, RunSummary } from "@/lib/types";

const CATEGORY_ORDER: EventCategory[] = ["new", "ongoing", "updated", "low"];

export function DigestTab({
  initial,
  collapsed,
  onToggle,
}: {
  initial: DashboardInitial;
  collapsed: Record<string, boolean>;
  onToggle: (section: string) => void;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState("");
  const { latestRun, events, latestEmailLog } = initial;

  async function runNow() {
    setRunning(true);
    setNotice(null);
    try {
      const res = await fetch("/api/run-now", { method: "POST" });
      const data = (await res.json()) as RunSummary & { error?: string };
      if (!res.ok || data.error) {
        setNotice(data.error ?? "运行失败");
      } else {
        setNotice(
          `运行完成：获取 ${data.items_count} 条，合并 ${data.events_count} 个事件，来源成功 ${data.sources_succeeded} / 失败 ${data.sources_failed}。`,
        );
        router.refresh();
      }
    } catch (e) {
      setNotice("运行请求失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRunning(false);
    }
  }

  async function sendTestEmail() {
    if (!email) {
      setNotice("请先输入接收测试邮件的邮箱");
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch("/api/send-test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) {
        setNotice(data.error ?? "邮件发送失败");
      } else {
        setNotice(`测试邮件已发送到 ${email}，请查收（含垃圾箱）。`);
        router.refresh();
      }
    } catch (e) {
      setNotice("邮件请求失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  }

  const emailResult = latestEmailLog
    ? latestEmailLog.status === "sent"
      ? "已发送"
      : "失败"
    : latestRun
      ? "未发送"
      : "—";

  const grouped: Record<EventCategory, CampusEvent[]> = {
    new: events.filter((e) => e.category === "new"),
    ongoing: events.filter((e) => e.category === "ongoing"),
    updated: events.filter((e) => e.category === "updated"),
    low: events.filter((e) => e.category === "low"),
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5">
        <SectionHeader id="runSummary" label="运行摘要" collapsed={collapsed["runSummary"] ?? false} onToggle={onToggle} />
        {!(collapsed["runSummary"] ?? false) && (
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Summary
              label="最近运行（北京时间）"
              value={latestRun ? formatBeijingTime(latestRun.started_at) : "暂无运行"}
            />
            <Summary label="获取条数" value={String(latestRun?.items_count ?? 0)} />
            <Summary label="合并事件数" value={String(latestRun?.events_count ?? 0)} />
            <Summary
              label="来源成功 / 失败"
              value={latestRun ? `${latestRun.sources_succeeded} / ${latestRun.sources_failed}` : "—"}
            />
            <Summary label="邮件发送结果" value={emailResult} />
          </div>
        )}
      </section>

      {CATEGORY_ORDER.map((cat) => (
        <CategorySection
          key={cat}
          id={cat}
          label={CATEGORY_LABELS[cat]}
          events={grouped[cat]}
          collapsed={collapsed[cat] ?? cat === "low"}
          onToggle={onToggle}
        />
      ))}

      {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>}

      <section className="flex flex-col gap-3 rounded-xl border bg-white p-5 sm:flex-row sm:items-center">
        <button
          onClick={runNow}
          disabled={running}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {running ? "运行中…" : "立即运行一次"}
        </button>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="接收测试邮件的邮箱"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          onClick={sendTestEmail}
          disabled={sending}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
        >
          {sending ? "发送中…" : "发送测试邮件"}
        </button>
      </section>
    </div>
  );
}

function SectionHeader({
  id,
  label,
  collapsed,
  onToggle,
}: {
  id: string;
  label: string;
  collapsed: boolean;
  onToggle: (section: string) => void;
}) {
  return (
    <button onClick={() => onToggle(id)} className="flex w-full items-center justify-between text-left">
      <span className="text-sm font-semibold text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-400">{collapsed ? "▸ 展开" : "▾ 折叠"}</span>
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function CategorySection({
  id,
  label,
  events,
  collapsed,
  onToggle,
}: {
  id: string;
  label: string;
  events: CampusEvent[];
  collapsed: boolean;
  onToggle: (section: string) => void;
}) {
  return (
    <section className="rounded-xl border bg-white">
      <button
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-zinc-400">
          {events.length} 条 {collapsed ? "▸ 展开" : "▾ 折叠"}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-4 border-t px-5 py-4">
          {events.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">暂无热点数据</p>
          ) : (
            events.map((ev) => <EventCard key={ev.id} event={ev} />)
          )}
        </div>
      )}
    </section>
  );
}

function EventCard({ event }: { event: CampusEvent }) {
  const firstUrl = event.source_urls[0];
  return (
    <article className="rounded-lg border border-zinc-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-6">
          {firstUrl ? (
            <a href={firstUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">
              {event.title}
            </a>
          ) : (
            event.title
          )}
        </h3>
        <div className="flex shrink-0 gap-1">
          {event.credibility && <Badge>{event.credibility}</Badge>}
          {event.is_rumor && <Badge danger>传闻</Badge>}
        </div>
      </div>
      {event.summary && <p className="mt-2 text-sm text-zinc-600">{event.summary}</p>}
      {event.reason && <p className="mt-1 text-xs text-zinc-400">关注原因：{event.reason}</p>}
    </article>
  );
}

function Badge({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs ${
        danger ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {children}
    </span>
  );
}