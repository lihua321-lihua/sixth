import axios, { type AxiosRequestConfig } from "axios";

// HTTP 抓取基础工具：重试 + 指数退避 + 字符集检测解码。

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 指数退避：baseMs * 2^attempt（1s、2s、4s…）
export function backoffMs(attempt: number, baseMs = 1000): number {
  return baseMs * 2 ** attempt;
}

// 字符集探测：先看响应头 content-type，再看 <meta charset>
function detectCharset(contentType: string | undefined, head: string): string {
  const fromHeader = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType ?? "");
  if (fromHeader) return fromHeader[1].toLowerCase();
  const meta = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head);
  if (meta) return meta[1].toLowerCase();
  return "utf-8";
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

// 抓取文本：arraybuffer + 字符集解码；失败按指数退避重试（默认重试 2 次）
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 15000, retries = 2, headers } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const cfg: AxiosRequestConfig = {
        url,
        method: "GET",
        responseType: "arraybuffer",
        timeout: timeoutMs,
        maxRedirects: 5,
        headers: {
          "User-Agent": DEFAULT_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...headers,
        },
      };
      const res = await axios(cfg);
      const buf = Buffer.from(res.data);
      const headStr = buf.slice(0, 4096).toString("latin1");
      const charset = detectCharset(res.headers["content-type"] as string | undefined, headStr);
      let decoder: TextDecoder;
      try {
        decoder = new TextDecoder(charset);
      } catch {
        decoder = new TextDecoder("utf-8");
      }
      return decoder.decode(buf);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
      }
    }
  }
  throw lastErr;
}

// 将错误收敛为人类可读信息（用于 source_runs.error）
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}