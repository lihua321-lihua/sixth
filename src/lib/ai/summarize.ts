import type { Credibility } from "@/lib/constants";

// AI 总结与事件是否同一的二次判定。优先使用 DeepSeek（OpenAI 兼容接口）；
// KEY 缺失或调用失败时降级为启发式结果。

const AI_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
const AI_MODEL =
  process.env.DEEPSEEK_MODEL ?? process.env.OPENAI_MODEL ?? "deepseek-chat";
const AI_BASE =
  process.env.DEEPSEEK_BASE_URL ??
  process.env.OPENAI_BASE_URL ??
  "https://api.deepseek.com/v1";

export interface AiSummary {
  summary: string | null;
  reason: string | null;
  credibility: Credibility;
  is_rumor: boolean;
}

// 按来源推断可信度：学校官网=官方事实；其余=传闻待证实
export function inferCredibility(sources: string[]): Credibility {
  const official = ["news", "aero", "yjsb", "zb"];
  const hasOfficial = sources.some((s) => official.includes(s));
  if (hasOfficial) return "官方事实";
  return "传闻待证实";
}

interface OpenAiJson {
  summary?: string;
  reason?: string;
  credibility?: string;
  is_rumor?: boolean;
}

async function chatJson(messages: { role: string; content: string }[]): Promise<OpenAiJson | null> {
  if (!AI_KEY) return null;
  try {
    const res = await fetch(`${AI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.2,
        messages,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as OpenAiJson;
  } catch {
    return null;
  }
}

function normalizeCredibility(value: string | undefined): Credibility {
  if (value?.includes("媒体")) return "媒体报道";
  if (value?.includes("传闻") || value?.includes("待证实") || value?.includes("网传")) {
    return "传闻待证实";
  }
  return "官方事实";
}

// 对单个事件输出总结/关注原因/可信度/是否传闻；失败降级为标题+来源+链接的呈现
export async function summarizeEvent(args: {
  title: string;
  sources: string[];
  source_urls: string[];
  keywords: string[];
}): Promise<AiSummary> {
  const fallback: AiSummary = {
    summary: null,
    reason: null,
    credibility: inferCredibility(args.sources),
    is_rumor: inferCredibility(args.sources) === "传闻待证实",
  };

  if (!AI_KEY) return fallback;

  const json = await chatJson([
    {
      role: "system",
      content:
        "你是校园新闻编辑。根据标题、来源与链接，输出 JSON：summary（一句话总结，不超过 60 字）、reason（关注原因，不超过 40 字）、credibility（官方事实/媒体报道/传闻待证实之一）、is_rumor（布尔，是否传闻）。" +
        "可信度规则：学校官网=官方事实；第三方媒体=媒体报道并用“据…报道”；无官方信源=传闻待证实。无法判断时宁可标为待证实，不要编造。",
    },
    {
      role: "user",
      content: JSON.stringify({
        title: args.title,
        sources: args.sources,
        links: args.source_urls,
        keywords: args.keywords,
      }),
    },
  ]);

  if (!json) return fallback;

  return {
    summary: json.summary?.trim() || fallback.summary,
    reason: json.reason?.trim() || fallback.reason,
    credibility: normalizeCredibility(json.credibility),
    is_rumor: json.is_rumor === true,
  };
}

// 事件是否同一的二次判定（仅用于标题相似度灰区）。失败返回 false（不合并）。
export async function aiSameEvent(titleA: string, titleB: string): Promise<boolean> {
  if (!AI_KEY) return false;
  const json = await chatJson([
    {
      role: "system",
      content: "判断两个新闻标题是否描述同一事件。输出 JSON：{ same: boolean }。",
    },
    { role: "user", content: JSON.stringify({ a: titleA, b: titleB }) },
  ]);
  if (!json) return false;
  return (json as OpenAiJson & { same?: boolean }).same === true;
}