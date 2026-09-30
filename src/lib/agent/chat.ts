import type { SupabaseClient } from "@supabase/supabase-js";
import { TOOLS, executeTool, type ToolContext } from "./tools";
import type { AgentResult } from "@/lib/types";

// DeepSeek（OpenAI 兼容接口）function-calling 循环：
// 把系统提示 + 上下文 + 对话发给模型，模型报 tool_calls 就执行并在下一轮把结果回传，
// 直到模型给出最终文本回复。最多 MAX_STEPS 轮，防止死循环。

const API_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
const MODEL = process.env.DEEPSEEK_MODEL ?? process.env.OPENAI_MODEL ?? "deepseek-chat";
const BASE = process.env.DEEPSEEK_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com/v1";
const MAX_STEPS = 6;

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface AgentChatInput {
  userId: string;
  supabase: SupabaseClient;
  context: string;
  messages: { role: "user" | "assistant"; text: string }[];
}

export async function runAgentChat(input: AgentChatInput): Promise<AgentResult> {
  if (!API_KEY) throw new Error("未配置 AI 密钥（DEEPSEEK_API_KEY 或 OPENAI_API_KEY）");

  const ctx: ToolContext = { userId: input.userId, supabase: input.supabase };

  const system = [
    "你是「校园热点追踪」工具的配置助手。用中文、简洁地回复，不要编造未发生的事实。",
    "你可以调用工具来修改配置、运行任务、发送邮件、查询状态、折叠界面区块。",
    "工具执行结果会以 tool 消息返回给你，请基于真实结果作答。",
    "当前上下文：",
    input.context,
  ].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...input.messages.map((m) => ({ role: m.role, content: m.text })),
  ];

  const refresh = new Set<string>();
  const sectionToggles: AgentResult["sectionToggles"] = [];
  const toolsUsed: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages,
        tools: TOOLS.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI 服务返回 ${res.status}：${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("AI 服务返回为空");

    // 有工具调用 → 执行并回传结果，继续下一轮
    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });

      for (const tc of message.tool_calls) {
        toolsUsed.push(tc.function.name);
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }
        const outcome = await executeTool(tc.function.name, args, ctx);
        for (const r of outcome.refresh ?? []) refresh.add(r);
        for (const st of outcome.sectionToggles ?? []) sectionToggles.push(st);
        messages.push({ role: "tool", tool_call_id: tc.id, content: outcome.message });
      }
      continue;
    }

    // 无工具调用 → 最终回复
    return {
      reply: message.content?.trim() || "已完成。",
      refresh: [...refresh],
      sectionToggles,
      toolsUsed,
    };
  }

  return {
    reply: "已完成（达到最大执行轮次）。",
    refresh: [...refresh],
    sectionToggles,
    toolsUsed,
  };
}