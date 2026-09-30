import nodemailer from "nodemailer";
import { sleep, errorMessage } from "@/lib/crawler/http";

// 邮件发送：QQ 邮箱 SMTP 为主，Resend 为备用；失败重试 3 次（指数退避）。

const RETRIES = 3;

const QQ_HOST = process.env.QQ_SMTP_HOST ?? "smtp.qq.com";
const QQ_PORT = Number(process.env.QQ_SMTP_PORT ?? 465);
const QQ_USER = process.env.QQ_EMAIL_USER;
const QQ_PASS = process.env.QQ_EMAIL_PASS;

const RESEND_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? "campus-digest@resend.dev";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

export interface SendMailResult {
  ok: boolean;
  provider?: "qq" | "resend";
  error?: string;
}

export function mailConfigured(): boolean {
  return Boolean(QQ_USER && QQ_PASS) || Boolean(RESEND_KEY);
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (RESEND_KEY) return sendViaResend(input);
  if (QQ_USER && QQ_PASS) return sendViaQQ(input);
  return { ok: false, error: "未配置邮件服务（需 QQ_EMAIL_USER/QQ_EMAIL_PASS 或 RESEND_API_KEY）" };
}

async function sendViaQQ(input: SendMailInput): Promise<SendMailResult> {
  const transport = nodemailer.createTransport({
    host: QQ_HOST,
    port: QQ_PORT,
    secure: QQ_PORT === 465,
    auth: { user: QQ_USER, pass: QQ_PASS },
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      await transport.sendMail({
        from: `"校园热点日报" <${QQ_USER}>`,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      return { ok: true, provider: "qq" };
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES - 1) await sleep(1000 * 2 ** attempt);
    }
  }
  return { ok: false, provider: "qq", error: errorMessage(lastErr) };
}

async function sendViaResend(input: SendMailInput): Promise<SendMailResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_KEY}`,
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [input.to],
          subject: input.subject,
          html: input.html,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return { ok: true, provider: "resend" };
      const body = await res.text();
      lastErr = new Error(`Resend ${res.status}: ${body}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < RETRIES - 1) await sleep(1000 * 2 ** attempt);
  }
  return { ok: false, provider: "resend", error: errorMessage(lastErr) };
}