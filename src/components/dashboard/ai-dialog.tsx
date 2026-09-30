"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentResult } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: "assistant",
    text: "我是校园热点助手，可以用自然语言帮你修改配置、立即运行、发送测试邮件、查询状态、折叠区块。",
  },
];

// 底部 AI 对话窗口：收起时显示右下角悬浮按钮，点击弹出；再次点击「收起」关闭。
// 调用 /api/agent，成功后把结构化结果回传给父组件刷新/折叠区块。
export function AiDialog({
  email,
  tab,
  onResult,
}: {
  email: string;
  tab: string;
  onResult: (result: AgentResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, messages: next }),
      });
      const data = (await res.json()) as AgentResult & { error?: string };
      if (!res.ok || data.error) {
        setMessages((m) => [...m, { role: "assistant", text: `抱歉，操作失败：${data.error ?? "未知错误"}` }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
        onResult(data);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((m) => [...m, { role: "assistant", text: `抱歉，请求失败：${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="打开 AI 助手"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg hover:bg-zinc-800"
      >
        <span aria-hidden>✦</span>
        AI 助手
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
      <div className="mx-auto max-w-4xl px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-500">AI 助手</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="收起 AI 助手"
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            收起 ▾
          </button>
        </div>

        <div ref={listRef} className="mb-2 max-h-48 space-y-1 overflow-y-auto text-sm">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "assistant" ? "text-zinc-600" : "text-right text-blue-700"}>
              {m.role === "assistant" ? "助手： " : ""}
              {m.text}
            </div>
          ))}
          {loading && <div className="text-zinc-400">助手思考中…</div>}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="用自然语言修改配置、运行任务、发送测试邮件、查询状态…"
            disabled={loading}
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "处理中…" : "发送"}
          </button>
        </div>
        <div className="mt-1 text-xs text-zinc-400">
          当前登录：{email} · 上下文：{tab === "settings" ? "设置与状态" : "日报"}
        </div>
      </div>
    </div>
  );
}