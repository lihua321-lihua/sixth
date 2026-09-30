import { createHash, randomInt } from "crypto";

// 邮箱验证码：生成、哈希、邮件渲染。仅服务端模块使用。

export const CODE_TTL_MS = 10 * 60 * 1000; // 验证码有效期 10 分钟
export const RESEND_COOLDOWN_MS = 60 * 1000; // 重发间隔 60 秒
export const MAX_VERIFY_ATTEMPTS = 5; // 单条验证码最大校验失败次数

// 6 位数字验证码（含前导零）
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// SHA-256 十六进制哈希（入库只存哈希，不落明文验证码）
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// 验证码邮件 HTML
export function renderVerificationEmail(code: string): string {
  return `<div style="font-family:sans-serif;color:#18181b;max-width:560px">
    <h2 style="margin:0 0 4px">校园热点追踪工具</h2>
    <p style="margin:0 0 16px;color:#71717a;font-size:13px">北华航天工业学院</p>
    <p style="margin:16px 0 0">你的注册验证码是：</p>
    <p style="margin:8px 0 16px;font-size:30px;font-weight:700;letter-spacing:6px">${code}</p>
    <p style="margin:0;font-size:13px;color:#71717a">验证码 10 分钟内有效，请勿泄露给他人。如非本人操作，请忽略本邮件。</p>
  </div>`;
}