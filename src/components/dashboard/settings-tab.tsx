"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  SCHOOL_NAME,
  SOURCES,
  DEFAULT_HOT_WINDOW_DAYS,
  normalizeSources,
  sourceKeyFromUrl,
} from "@/lib/constants";
import type { DashboardInitial, SourceRun } from "@/lib/types";

export function SettingsTab({
  initial,
  collapsed,
  onToggle,
}: {
  initial: DashboardInitial;
  collapsed: Record<string, boolean>;
  onToggle: (section: string) => void;
}) {
  const router = useRouter();
  const { config, recentSources, digests } = initial;

  const sources = normalizeSources(config?.sources ?? SOURCES);
  const hotWindowDays = config?.hot_window_days ?? DEFAULT_HOT_WINDOW_DAYS;

  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 添加来源表单
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newListPath, setNewListPath] = useState("");

  // 时效窗口草稿
  const [draftDays, setDraftDays] = useState<number>(hotWindowDays);

  const sourceMap = new Map<string, SourceRun>();
  for (const sr of recentSources) sourceMap.set(sr.source, sr);

  async function persist(patch: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) {
        setNotice(data.error ?? "保存失败");
        return false;
      }
      router.refresh();
      return true;
    } catch (e) {
      setNotice("请求失败：" + (e instanceof Error ? e.message : String(e)));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addSource() {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) {
      setNotice("请填写来源名称和网址");
      return;
    }
    const listPath = newListPath.trim();
    const next = [
      ...sources,
      { key: sourceKeyFromUrl(url), name, baseUrl: url, ...(listPath ? { listPath } : {}) },
    ];
    const ok = await persist({ sources: next });
    if (ok) {
      setNewName("");
      setNewUrl("");
      setNewListPath("");
    }
  }

  function deleteSource(key: string) {
    void persist({ sources: sources.filter((s) => s.key !== key) });
  }

  function saveWindow() {
    void persist({ hot_window_days: draftDays });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5">
        <SectionHeader id="config" label="配置" collapsed={collapsed["config"] ?? false} onToggle={onToggle} />
        {!(collapsed["config"] ?? false) && (
          <div className="mt-2">
            <ConfigRow label="学校" value={config?.school ?? SCHOOL_NAME} readOnly />
            <ConfigRow label="关注关键词" value={config?.include_keywords.join("、") ?? "—"} hint="命中用于打分排序" />
            <ConfigRow label="排除关键词" value={config?.exclude_keywords.join("、") ?? "—"} hint="命中先过滤" />
            <ConfigRow label="时效窗口（天）" value={`${hotWindowDays} 天`} hint="数据源更新慢，热点在该天数内仍视为持续关注" />
            <ConfigRow label="收件邮箱" value={config?.recipient_emails.join("、") || "（未设置）"} />
            <ConfigRow label="每日发送时间（北京时间）" value={config?.send_time ?? "08:00"} />
            <ConfigRow label="启用邮件日报" value={config?.email_enabled ? "开启" : "关闭"} />
            <p className="mt-3 text-xs text-zinc-400">
              配置可通过底部 AI 助手用自然语言修改，例如「关注招生、讲座，早上 8 点发，邮箱 test@example.com」。
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <SectionHeader
          id="hotWindow"
          label="时效窗口"
          collapsed={collapsed["hotWindow"] ?? false}
          onToggle={onToggle}
        />
        {!(collapsed["hotWindow"] ?? false) && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={1}
              max={365}
              value={draftDays}
              onChange={(e) => setDraftDays(Number(e.target.value))}
              className="w-24 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <span className="text-sm text-zinc-500">天</span>
            <button
              onClick={saveWindow}
              disabled={busy}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              保存
            </button>
            <p className="w-full text-xs text-zinc-400">
              决定热点事件在多少天内仍被算作「持续关注 / 已有更新」。数据源更新较慢时可适当调大，当前默认 {DEFAULT_HOT_WINDOW_DAYS} 天。
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <SectionHeader
          id="sourceManage"
          label="来源管理"
          collapsed={collapsed["sourceManage"] ?? false}
          onToggle={onToggle}
        />
        {!(collapsed["sourceManage"] ?? false) && (
          <div className="mt-3">
            {sources.length === 0 ? (
              <p className="py-2 text-sm text-zinc-400">暂无数据来源，请在下方添加。</p>
            ) : (
              <ul className="divide-y">
                {sources.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{s.name}</div>
                      <div className="truncate text-xs text-zinc-400">{s.baseUrl}{s.listPath ?? ""}</div>
                    </div>
                    <button
                      onClick={() => deleteSource(s.key)}
                      disabled={busy}
                      className="shrink-0 rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 space-y-2 border-t pt-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="来源名称，如 教务处通知"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="网址，如 https://jwc.nciae.edu.cn"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={newListPath}
                  onChange={(e) => setNewListPath(e.target.value)}
                  placeholder="列表页路径（可选），如 /xwdt.htm，默认 /index.htm"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <button
                  onClick={addSource}
                  disabled={busy}
                  className="shrink-0 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                >
                  添加来源
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <SectionHeader
          id="sourceStatus"
          label="来源状态（最近一次运行）"
          collapsed={collapsed["sourceStatus"] ?? false}
          onToggle={onToggle}
        />
        {!(collapsed["sourceStatus"] ?? false) && (
          <ul className="mt-2 divide-y">
            {sources.map((s) => {
              const sr = sourceMap.get(s.key);
              return (
                <li key={s.key} className="flex items-center justify-between py-2 text-sm">
                  <span>{s.name}</span>
                  {sr ? (
                    <span className={sr.status === "success" ? "text-green-600" : "text-red-600"}>
                      {sr.status === "success" ? `成功 · ${sr.items_count} 条` : `失败${sr.error ? ` · ${sr.error}` : ""}`}
                    </span>
                  ) : (
                    <span className="text-zinc-400">未运行</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <SectionHeader id="history" label="历史日报" collapsed={collapsed["history"] ?? false} onToggle={onToggle} />
        {!(collapsed["history"] ?? false) && (
          <div className="mt-2">
            {digests.length === 0 ? (
              <p className="py-2 text-sm text-zinc-400">暂无历史日报</p>
            ) : (
              <ul className="divide-y">
                {digests.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{d.date}</span>
                    <span className="text-zinc-500">
                      {d.hot_count} 条热点 · 邮件：{statusLabel(d.email_status)}
                      {d.empty_reason ? ` · ${d.empty_reason}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <SectionHeader id="notes" label="说明" collapsed={collapsed["notes"] ?? false} onToggle={onToggle} />
        {!(collapsed["notes"] ?? false) && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600">
            <li>数据来源：{sources.map((s) => s.name).join("、") || "（未配置）"}，可在「来源管理」中自行增删。</li>
            <li>反爬说明：不抓贴吧 / 微博 / 小红书，不绕过登录与验证码；串行抓取、单来源独立失败。</li>
            <li>Mock 规则：来源失败仅显示失败，绝不用 Mock 填充真实日报；无新内容不编造热点。</li>
            <li>已知限制：仅支持 {SCHOOL_NAME} 单校；邮件发送需单独配置 QQ SMTP 或 Resend。</li>
          </ul>
        )}
      </section>

      {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>}
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

function ConfigRow({
  label,
  value,
  hint,
  readOnly,
}: {
  label: string;
  value: string;
  hint?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 py-3 text-sm">
      <div>
        <div className="text-zinc-600">
          {label}
          {readOnly && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-400">只读</span>}
        </div>
        {hint && <div className="mt-0.5 text-xs text-zinc-400">{hint}</div>}
      </div>
      <div className="max-w-[55%] text-right font-medium">{value}</div>
    </div>
  );
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: "待发送",
    sent: "已发送",
    failed: "失败",
    skipped: "跳过",
  };
  return map[s] ?? s;
}